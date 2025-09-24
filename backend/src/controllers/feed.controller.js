const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const feedService = require('../services/feed.service');

const getOwnerKey = (req) => {
  const { user } = req;

  if (user == null || user.id == null) {
    throw new ApiError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication required' });
  }

  return String(user.id);
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
  const { cursor, limit } = req.validated?.query ?? {};

  const { items, nextCursor, total, limit: appliedLimit } = await feedService.listFeeds({
    ownerKey,
    cursor,
    limit,
  });

  res.withCache(30, 'private');
  return res.success(
    {
      items: items.map(mapFeed),
    },
    {
      meta: {
        nextCursor: nextCursor == null ? null : String(nextCursor),
        total,
        limit: appliedLimit,
      },
    }
  );
});

const create = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const { url, title } = req.validated?.body ?? {};

  const feed = await feedService.createFeed({ ownerKey, url, title });

  return res.success(mapFeed(feed), { statusCode: 201 });
});

const bulkCreate = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const { urls } = req.validated?.body ?? {};

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
  const { id } = req.validated?.params ?? {};
  const { title, url } = req.validated?.body ?? {};

  const feed = await feedService.updateFeed({ ownerKey, feedId: id, title, url });

  return res.success(mapFeed(feed));
});

const remove = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const { id } = req.validated?.params ?? {};

  await feedService.deleteFeed({ ownerKey, feedId: id });

  return res.success({ message: 'Feed removed' });
});

const reset = asyncHandler(async (req, res) => {
  const adminId = req.user?.id == null ? null : String(req.user.id);

  const result = await feedService.resetAllFeeds({ requestedBy: adminId });

  return res.success(result);
});

module.exports = {
  list,
  create,
  bulkCreate,
  update,
  remove,
  reset,
};
