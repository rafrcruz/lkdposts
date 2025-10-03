const ApiError = require('../utils/api-error');
const { Sentry } = require('../lib/sentry');
const appParamsRepository = require('../repositories/app-params.repository');

const OPENAI_MODEL_OPTIONS = Object.freeze([
  'gpt-5-nano',
  'gpt-5-mini',
  'gpt-5',
  'gpt-5-nano-2025-08-07',
  'gpt-5-mini-2025-08-07',
  'gpt-5-2025-08-07',
]);
const OPENAI_MODEL_SET = new Set(OPENAI_MODEL_OPTIONS);
const DEFAULT_OPENAI_MODEL = OPENAI_MODEL_OPTIONS[0];

const normalizeOpenAiModelValue = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return OPENAI_MODEL_SET.has(normalized) ? normalized : null;
};

const DEFAULT_APP_PARAMS = {
  postsRefreshCooldownSeconds: 3600,
  postsTimeWindowDays: 7,
  openAiModel: DEFAULT_OPENAI_MODEL,
};

const toDomainModel = (record) => ({
  postsRefreshCooldownSeconds: record.postsRefreshCooldownSeconds,
  postsTimeWindowDays: record.postsTimeWindowDays,
  openAiModel: normalizeOpenAiModelValue(record.openAiModel) ?? DEFAULT_OPENAI_MODEL,
  updatedAt: record.updatedAt instanceof Date ? record.updatedAt : new Date(record.updatedAt),
  updatedBy: record.updatedBy ?? null,
});

const ensureDefaultAppParams = async () => {
  const record = await appParamsRepository.ensureDefaultSingleton(DEFAULT_APP_PARAMS);
  return toDomainModel(record);
};

const getAppParams = () => ensureDefaultAppParams();

const validateCooldown = (value) => {
  if (!Number.isInteger(value)) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_POSTS_REFRESH_COOLDOWN_SECONDS',
      message: 'posts_refresh_cooldown_seconds must be an integer',
    });
  }

  if (value < 0) {
    throw new ApiError({
      statusCode: 422,
      code: 'POSTS_REFRESH_COOLDOWN_SECONDS_TOO_LOW',
      message: 'posts_refresh_cooldown_seconds must be greater than or equal to 0',
    });
  }
};

const validateTimeWindow = (value) => {
  if (!Number.isInteger(value)) {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_POSTS_TIME_WINDOW_DAYS',
      message: 'posts_time_window_days must be an integer',
    });
  }

  if (value < 1) {
    throw new ApiError({
      statusCode: 422,
      code: 'POSTS_TIME_WINDOW_DAYS_TOO_LOW',
      message: 'posts_time_window_days must be greater than or equal to 1',
    });
  }
};

const validateOpenAiModel = (value) => {
  if (typeof value !== 'string') {
    throw new ApiError({
      statusCode: 400,
      code: 'INVALID_OPENAI_MODEL',
      message: 'openai.model must be a string',
    });
  }

  const normalized = normalizeOpenAiModelValue(value);

  if (!normalized) {
    throw new ApiError({
      statusCode: 422,
      code: 'UNSUPPORTED_OPENAI_MODEL',
      message: `openai.model must be one of: ${OPENAI_MODEL_OPTIONS.join(', ')}`,
    });
  }

  return normalized;
};

const updateAppParams = async ({ updates, updatedBy }) => {
  const current = await ensureDefaultAppParams();
  const changes = {};
  let openAiModelChanged = false;

  if (Object.hasOwn(updates, 'posts_refresh_cooldown_seconds')) {
    const cooldown = updates.posts_refresh_cooldown_seconds;
    validateCooldown(cooldown);
    changes.postsRefreshCooldownSeconds = cooldown;
  }

  if (Object.hasOwn(updates, 'posts_time_window_days')) {
    const windowDays = updates.posts_time_window_days;
    validateTimeWindow(windowDays);
    changes.postsTimeWindowDays = windowDays;
  }

  if (Object.hasOwn(updates, 'openai.model')) {
    const model = validateOpenAiModel(updates['openai.model']);

    if (model !== current.openAiModel) {
      changes.openAiModel = model;
      openAiModelChanged = true;
    }
  }

  if (Object.keys(changes).length === 0) {
    return current;
  }

  const normalizedUpdatedBy =
    updatedBy == null || updatedBy === '' ? null : String(updatedBy).trim() || null;

  const updatedRecord = await appParamsRepository.updateSingleton({
    ...changes,
    updatedBy: normalizedUpdatedBy,
  });

  const updated = toDomainModel(updatedRecord);
  const changedKeys = Object.keys(changes);

  const breadcrumbData = {
    updatedBy: normalizedUpdatedBy ?? 'unknown',
    changed: changedKeys,
  };

  try {
    Sentry.addBreadcrumb({
      category: 'app-params',
      level: 'info',
      message: 'Application parameters updated',
      data: breadcrumbData,
    });

    if (openAiModelChanged) {
      Sentry.addBreadcrumb({
        category: 'settings',
        level: 'info',
        message: 'openai.model updated',
      });
    }
  } catch (error) {
    console.warn('Failed to add Sentry breadcrumb for app params update', error);
  }

  const changeLog = {};

  if (Object.hasOwn(updates, 'posts_refresh_cooldown_seconds')) {
    changeLog.posts_refresh_cooldown_seconds = changes.postsRefreshCooldownSeconds;
  }

  if (Object.hasOwn(updates, 'posts_time_window_days')) {
    changeLog.posts_time_window_days = changes.postsTimeWindowDays;
  }

  if (openAiModelChanged && Object.hasOwn(updates, 'openai.model')) {
    changeLog['openai.model'] = changes.openAiModel;
  }

  console.info('app-params updated by %s', breadcrumbData.updatedBy, {
    changed: changeLog,
  });

  return updated;
};

const getOpenAIModel = async () => {
  const record = await appParamsRepository.ensureDefaultSingleton(DEFAULT_APP_PARAMS);

  if (!record || typeof record.openAiModel !== 'string') {
    return DEFAULT_OPENAI_MODEL;
  }

  const trimmed = record.openAiModel.trim();
  return trimmed !== '' ? trimmed : DEFAULT_OPENAI_MODEL;
};

const normalizePersistedOpenAiModel = async () => {
  const record = await appParamsRepository.findSingleton();

  if (!record) {
    return null;
  }

  const normalized = normalizeOpenAiModelValue(record.openAiModel);
  const targetModel = normalized ?? DEFAULT_OPENAI_MODEL;

  if (record.openAiModel === targetModel) {
    return targetModel;
  }

  await appParamsRepository.updateSingleton({ openAiModel: targetModel });
  return targetModel;
};

module.exports = {
  OPENAI_MODEL_OPTIONS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_APP_PARAMS,
  ensureDefaultAppParams,
  getAppParams,
  updateAppParams,
  getOpenAIModel,
  normalizePersistedOpenAiModel,
};
