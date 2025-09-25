const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const promptsService = require('../services/prompts.service');

const getUserId = (req) => {
  const userId = req.user?.id;

  if (userId == null) {
    throw new ApiError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication required' });
  }

  return Number(userId);
};

const mapPrompt = (prompt) => ({
  id: prompt.id,
  title: prompt.title,
  content: prompt.content,
  position: prompt.position,
  enabled: prompt.enabled,
  createdAt: prompt.createdAt instanceof Date ? prompt.createdAt.toISOString() : prompt.createdAt,
  updatedAt: prompt.updatedAt instanceof Date ? prompt.updatedAt.toISOString() : prompt.updatedAt,
});

const list = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { limit, offset, enabled } = req.validated?.query ?? {};

  const result = await promptsService.listPrompts({ userId, limit, offset, enabled });

  return res.success(
    { items: result.items.map(mapPrompt) },
    {
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    }
  );
});

const create = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { title, content, position, enabled } = req.validated?.body ?? {};

  const prompt = await promptsService.createPrompt({ userId, title, content, position, enabled });

  return res.success(mapPrompt(prompt), { statusCode: 201 });
});

const getById = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.validated?.params ?? {};

  const prompt = await promptsService.getPromptById({ userId, id });

  return res.success(mapPrompt(prompt));
});

const update = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.validated?.params ?? {};
  const { title, content, enabled } = req.validated?.body ?? {};

  const prompt = await promptsService.updatePrompt({ userId, id, title, content, enabled });

  return res.success(mapPrompt(prompt));
});

const remove = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.validated?.params ?? {};

  await promptsService.deletePrompt({ userId, id });

  return res.status(204).send();
});

const reorder = asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { items } = req.validated?.body ?? {};

  const prompts = await promptsService.reorderPrompts({ userId, items });

  return res.success({ items: prompts.map(mapPrompt) });
});

module.exports = {
  list,
  create,
  getById,
  update,
  remove,
  reorder,
};
