const { prisma } = require('../lib/prisma');

const APP_PARAMS_ID = 1;

const findSingleton = () => prisma.appParams.findUnique({ where: { id: APP_PARAMS_ID } });

const createSingleton = ({ postsRefreshCooldownSeconds, postsTimeWindowDays, openAiModel, updatedBy = null }) =>
  prisma.appParams.create({
    data: {
      id: APP_PARAMS_ID,
      postsRefreshCooldownSeconds,
      postsTimeWindowDays,
      openAiModel,
      updatedBy,
    },
  });

const ensureDefaultSingleton = async ({ postsRefreshCooldownSeconds, postsTimeWindowDays, openAiModel }) => {
  const existing = await findSingleton();

  if (existing) {
    return existing;
  }

  return createSingleton({ postsRefreshCooldownSeconds, postsTimeWindowDays, openAiModel });
};

const updateSingleton = ({ postsRefreshCooldownSeconds, postsTimeWindowDays, openAiModel, updatedBy }) => {
  const data = {};

  if (postsRefreshCooldownSeconds !== undefined) {
    data.postsRefreshCooldownSeconds = postsRefreshCooldownSeconds;
  }

  if (postsTimeWindowDays !== undefined) {
    data.postsTimeWindowDays = postsTimeWindowDays;
  }

  if (openAiModel !== undefined) {
    data.openAiModel = openAiModel;
  }

  if (updatedBy !== undefined) {
    data.updatedBy = updatedBy;
  }

  return prisma.appParams.update({
    where: { id: APP_PARAMS_ID },
    data,
  });
};

module.exports = {
  APP_PARAMS_ID,
  findSingleton,
  ensureDefaultSingleton,
  updateSingleton,
};
