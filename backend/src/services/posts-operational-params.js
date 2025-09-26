const appParamsService = require('./app-params.service');

const MS_PER_SECOND = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const normalizeCooldownSeconds = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return appParamsService.DEFAULT_APP_PARAMS.postsRefreshCooldownSeconds;
  }

  const normalized = Math.trunc(value);
  return normalized < 0 ? 0 : normalized;
};

const normalizeWindowDays = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return appParamsService.DEFAULT_APP_PARAMS.postsTimeWindowDays;
  }

  const normalized = Math.trunc(value);
  return normalized < 1 ? 1 : normalized;
};

const buildOperationalParams = ({ cooldownSeconds, windowDays }) => {
  const normalizedCooldownSeconds = normalizeCooldownSeconds(cooldownSeconds);
  const normalizedWindowDays = normalizeWindowDays(windowDays);

  return {
    cooldownSeconds: normalizedCooldownSeconds,
    cooldownMs: normalizedCooldownSeconds * MS_PER_SECOND,
    windowDays: normalizedWindowDays,
    windowMs: normalizedWindowDays * MS_PER_DAY,
  };
};

const resolveOperationalParams = async (overrides) => {
  if (overrides && (overrides.cooldownSeconds != null || overrides.windowDays != null)) {
    return buildOperationalParams({
      cooldownSeconds:
        overrides.cooldownSeconds ?? appParamsService.DEFAULT_APP_PARAMS.postsRefreshCooldownSeconds,
      windowDays: overrides.windowDays ?? appParamsService.DEFAULT_APP_PARAMS.postsTimeWindowDays,
    });
  }

  const params = await appParamsService.getAppParams();
  return buildOperationalParams({
    cooldownSeconds: params.postsRefreshCooldownSeconds,
    windowDays: params.postsTimeWindowDays,
  });
};

const defaultOperationalParams = buildOperationalParams({
  cooldownSeconds: appParamsService.DEFAULT_APP_PARAMS.postsRefreshCooldownSeconds,
  windowDays: appParamsService.DEFAULT_APP_PARAMS.postsTimeWindowDays,
});

module.exports = {
  MS_PER_SECOND,
  MS_PER_DAY,
  normalizeCooldownSeconds,
  normalizeWindowDays,
  buildOperationalParams,
  resolveOperationalParams,
  defaultOperationalParams,
};

