const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const feedService = require('../services/feed.service');

const parsePositiveInteger = (value, { field = 'id', required = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ApiError({ statusCode: 400, code: 'INVALID_INPUT', message: `Invalid ${field}` });
    }

    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_INPUT', message: `Invalid ${field}` });
  }

  return number;
};

const getOwnerKey = (req) => {
  if (!req.user || req.user.id == null) {
    throw new ApiError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication required' });
  }

  return String(req.user.id);
};

const mapFeed = (feed) => ({
  id: feed.id,
  url: feed.url,
  title: feed.title ?? null,
  lastFetchedAt: feed.lastFetchedAt ?? null,
  createdAt: feed.createdAt,
  updatedAt: feed.updatedAt,
});

const list = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const cursor = req.query.cursor != null ? parsePositiveInteger(req.query.cursor, { field: 'cursor' }) : null;
  const limit = req.query.limit != null ? parsePositiveInteger(req.query.limit, { field: 'limit' }) : undefined;

  const { items, nextCursor, total, limit: appliedLimit } = await feedService.listFeeds({ ownerKey, cursor, limit });

  return res.success(
    {
      items: items.map(mapFeed),
    },
    {
      meta: {
        nextCursor: nextCursor != null ? String(nextCursor) : null,
        total,
        limit: appliedLimit,
      },
    }
  );
});

const create = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const { url, title } = req.body ?? {};

  if (url == null) {
    throw new ApiError({ statusCode: 400, code: 'URL_REQUIRED', message: 'URL is required' });
  }

  const feed = await feedService.createFeed({ ownerKey, url, title });

  return res.success(mapFeed(feed), { statusCode: 201 });
});

const bulkCreate = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const { urls } = req.body ?? {};

  const result = await feedService.createFeedsInBulk({ ownerKey, urls });

  return res.success({
    created: result.created.map(mapFeed),
    duplicates: result.duplicates.map((entry) => ({
      url: entry.url,
      reason: entry.reason,
      feedId: entry.feedId ?? null,
    })),
    invalid: result.invalid.map((entry) => ({ url: entry.url, reason: entry.reason })),
  });
});

const update = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const feedId = parsePositiveInteger(req.params.id, { field: 'id', required: true });
  const { title, url } = req.body ?? {};

  if (title === undefined && url === undefined) {
    throw new ApiError({ statusCode: 400, code: 'NO_UPDATES_PROVIDED', message: 'No updates provided' });
  }

  const feed = await feedService.updateFeed({ ownerKey, feedId, title, url });

  return res.success(mapFeed(feed));
});

const remove = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const feedId = parsePositiveInteger(req.params.id, { field: 'id', required: true });

  await feedService.deleteFeed({ ownerKey, feedId });

  return res.success({ message: 'Feed removed' });
});

module.exports = {
  list,
  create,
  bulkCreate,
  update,
  remove,
};
