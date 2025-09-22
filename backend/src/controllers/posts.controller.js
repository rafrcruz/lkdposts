const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const postsService = require('../services/posts.service');

const getOwnerKey = (req) => {
  if (!req.user || req.user.id == null) {
    throw new ApiError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication required' });
  }

  return String(req.user.id);
};

const mapFeedSummary = (entry) => ({
  feedId: entry.feedId,
  feedUrl: entry.feedUrl,
  feedTitle: entry.feedTitle,
  skippedByCooldown: entry.skippedByCooldown,
  cooldownSecondsRemaining: entry.cooldownSecondsRemaining,
  itemsRead: entry.itemsRead,
  itemsWithinWindow: entry.itemsWithinWindow,
  articlesCreated: entry.articlesCreated,
  duplicates: entry.duplicates,
  invalidItems: entry.invalidItems,
  error: entry.error ? entry.error.message : null,
});

const mapPostListItem = (article) => ({
  id: article.id,
  title: article.title,
  contentSnippet: article.contentSnippet,
  publishedAt: article.publishedAt instanceof Date ? article.publishedAt.toISOString() : article.publishedAt,
  feed: article.feed
    ? {
        id: article.feed.id,
        title: article.feed.title ?? null,
        url: article.feed.url ?? null,
      }
    : null,
  post: article.post
    ? {
        content: article.post.content,
        createdAt:
          article.post.createdAt instanceof Date
            ? article.post.createdAt.toISOString()
            : article.post.createdAt ?? null,
      }
    : null,
});

const refresh = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const result = await postsService.refreshUserFeeds({ ownerKey });

  return res.success({
    now: result.now.toISOString(),
    feeds: result.results.map(mapFeedSummary),
  });
});

const cleanup = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const result = await postsService.cleanupOldArticles({ ownerKey });

  return res.success(result);
});

const list = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const { cursor, limit, feedId } = req.validated?.query ?? {};

  try {
    const result = await postsService.listRecentArticles({ ownerKey, cursor, limit, feedId });

    res.withCache(15, 'private');
    return res.success(
      {
        items: result.items.map(mapPostListItem),
      },
      {
        meta: {
          nextCursor: result.nextCursor,
          limit: result.limit,
        },
      }
    );
  } catch (error) {
    if (error instanceof postsService.InvalidCursorError) {
      throw new ApiError({ statusCode: 400, code: 'INVALID_CURSOR', message: 'Invalid pagination cursor' });
    }

    throw error;
  }
});

module.exports = {
  refresh,
  cleanup,
  list,
};
