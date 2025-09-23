const LEVELS = new Map([
  ['fatal', 0],
  ['error', 1],
  ['warn', 2],
  ['info', 3],
  ['debug', 4],
  ['trace', 5],
]);

const normalizeLevel = (level) => {
  if (typeof level !== 'string') {
    return 'info';
  }
  const normalized = level.trim().toLowerCase();
  return LEVELS.has(normalized) ? normalized : 'info';
};

const createLogger = (level) => {
  const normalizedLevel = normalizeLevel(level);
  const threshold = LEVELS.get(normalizedLevel) ?? LEVELS.get('info');

  const shouldLog = (targetLevel) => {
    const numeric = LEVELS.get(targetLevel) ?? LEVELS.get('info');
    return numeric <= threshold;
  };

  return {
    level: normalizedLevel,
    debug(message, context) {
      if (shouldLog('debug')) {
        console.debug(message, context);
      }
    },
    info(message, context) {
      if (shouldLog('info')) {
        console.info(message, context);
      }
    },
    warn(message, context) {
      if (shouldLog('warn')) {
        console.warn(message, context);
      }
    },
    error(message, context) {
      if (shouldLog('error')) {
        console.error(message, context);
      }
    },
  };
};

module.exports = {
  createLogger,
};
