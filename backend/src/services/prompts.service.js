const { Prisma } = require('@prisma/client');
const ApiError = require('../utils/api-error');
const promptRepository = require('../repositories/prompt.repository');
const { prisma } = require('../lib/prisma');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const normalizeLimit = (limit) => {
  if (limit == null) {
    return DEFAULT_PAGE_SIZE;
  }

  const parsed = Number(limit);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_PAGINATION', message: 'limit must be a positive integer' });
  }

  const coerced = Math.trunc(parsed);

  if (coerced < 1) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_PAGINATION', message: 'limit must be at least 1' });
  }

  return Math.min(coerced, MAX_PAGE_SIZE);
};

const normalizeOffset = (offset) => {
  if (offset == null) {
    return 0;
  }

  const parsed = Number(offset);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_PAGINATION', message: 'offset must be a non-negative integer' });
  }

  const coerced = Math.trunc(parsed);

  if (coerced < 0) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_PAGINATION', message: 'offset must be a non-negative integer' });
  }

  return coerced;
};

const listPrompts = async ({ userId, limit, offset, enabled }) => {
  const appliedLimit = normalizeLimit(limit);
  const appliedOffset = normalizeOffset(offset);

  const [items, total] = await Promise.all([
    promptRepository.findManyByUser({ userId, take: appliedLimit, skip: appliedOffset, enabled }),
    promptRepository.countByUser({ userId, enabled }),
  ]);

  return {
    items,
    total,
    limit: appliedLimit,
    offset: appliedOffset,
  };
};

const ensurePromptOwnership = async ({ userId, id }) => {
  const prompt = await promptRepository.findByIdForUser({ userId, id });

  if (!prompt) {
    throw new ApiError({ statusCode: 404, code: 'PROMPT_NOT_FOUND', message: 'Prompt not found' });
  }

  return prompt;
};

const shiftPositionsForward = async ({ userId, startingAt }, client) => {
  const prismaClient = client ?? prisma;

  const promptsToShift = await prismaClient.prompt.findMany({
    where: {
      userId,
      position: { gte: startingAt },
    },
    orderBy: { position: 'desc' },
  });

  for (const prompt of promptsToShift) {
    // eslint-disable-next-line no-await-in-loop
    await prismaClient.prompt.update({
      where: { id: prompt.id },
      data: { position: prompt.position + 1 },
    });
  }
};

const createPrompt = async ({ userId, title, content, position, enabled = true }) => {
  return prisma.$transaction(async (tx) => {
    let targetPosition = position;

    if (targetPosition == null) {
      const maxPosition = await promptRepository.findMaxPositionForUser({ userId }, tx);
      targetPosition = maxPosition == null ? 0 : maxPosition + 1;
    } else {
      await shiftPositionsForward({ userId, startingAt: targetPosition }, tx);
    }

    const created = await promptRepository.create(
      { userId, title, content, position: targetPosition, enabled },
      tx
    );

    return created;
  });
};

const updatePrompt = async ({ userId, id, title, content, enabled }) => {
  const prompt = await ensurePromptOwnership({ userId, id });

  const data = {};

  if (title !== undefined) {
    data.title = title;
  }

  if (content !== undefined) {
    data.content = content;
  }

  if (enabled !== undefined) {
    data.enabled = enabled;
  }

  if (prompt.enabled && enabled === false) {
    return prisma.$transaction(async (tx) => {
      const maxPosition = await promptRepository.findMaxPositionForUser({ userId }, tx);
      const nextPosition = maxPosition == null ? 0 : maxPosition + 1;

      const updatedPrompt = await promptRepository.update(
        { id, data: { ...data, position: nextPosition } },
        tx
      );

      return updatedPrompt;
    });
  }

  const updated = await promptRepository.update({ id, data });

  return updated;
};

const deletePrompt = async ({ userId, id }) => {
  await ensurePromptOwnership({ userId, id });
  await promptRepository.deleteById({ id });
};

const getPromptById = async ({ userId, id }) => ensurePromptOwnership({ userId, id });

const reorderPrompts = async ({ userId, items }) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_REORDER_PAYLOAD', message: 'items must contain at least one entry' });
  }

  const ids = items.map((item) => item.id);
  const positions = items.map((item) => item.position);

  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new ApiError({ statusCode: 400, code: 'DUPLICATE_PROMPT_ID', message: 'Duplicate prompt ids are not allowed' });
  }

  const uniquePositions = new Set(positions);
  if (uniquePositions.size !== positions.length) {
    throw new ApiError({ statusCode: 400, code: 'DUPLICATE_POSITION', message: 'Duplicate positions are not allowed' });
  }

  if (positions.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_POSITION', message: 'Positions must be non-negative integers' });
  }

  const prompts = await promptRepository.findManyByIdsForUser({ userId, ids });
  if (prompts.length !== ids.length) {
    throw new ApiError({ statusCode: 404, code: 'PROMPT_NOT_FOUND', message: 'One or more prompts were not found' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        // eslint-disable-next-line no-await-in-loop
        await tx.prompt.update({
          where: { id: item.id },
          data: { position: -1 - index },
        });
      }

      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop
        await tx.prompt.update({
          where: { id: item.id },
          data: { position: item.position },
        });
      }

      const updated = await tx.prompt.findMany({
        where: { userId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });

      return updated;
    });

    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError({
        statusCode: 400,
        code: 'POSITION_CONFLICT',
        message: 'Position conflict detected during reorder',
        cause: error,
      });
    }

    throw error;
  }
};

module.exports = {
  listPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  reorderPrompts,
  constants: {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  },
};
