const ApiError = require('../utils/api-error');
const { Sentry } = require('../lib/sentry');
const appParamsRepository = require('../repositories/app-params.repository');

const DEFAULT_APP_PARAMS = {
  postsRefreshCooldownSeconds: 3600,
  postsTimeWindowDays: 7,
};

const toDomainModel = (record) => ({
  postsRefreshCooldownSeconds: record.postsRefreshCooldownSeconds,
  postsTimeWindowDays: record.postsTimeWindowDays,
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

const updateAppParams = async ({ updates, updatedBy }) => {
  const current = await ensureDefaultAppParams();
  const changes = {};

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

  console.info('app-params updated by %s', breadcrumbData.updatedBy, {
    changed: changeLog,
  });

  return updated;
};

module.exports = {
  DEFAULT_APP_PARAMS,
  ensureDefaultAppParams,
  getAppParams,
  updateAppParams,
};
