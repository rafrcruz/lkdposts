const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const postsService = require('../services/posts.service');
const postGenerationService = require('../services/post-generation.service');
const config = require('../config');
const { ROLES } = require('../constants/roles');
const { hasBlockTags, buildPreview } = require('../utils/html-diagnostics');

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

const toIsoString = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value.toISOString();
  }
  try {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
  } catch (error) {
    return null;
  }
};

const mapPostListItem = (article, { includeDiagnostics = false } = {}) => {
  const noticia = article.articleHtml ?? null;
  const response = {
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
          content: article.post.content ?? null,
          createdAt: toIsoString(article.post.createdAt),
          status: article.post.status ?? null,
          generatedAt: toIsoString(article.post.generatedAt),
          modelUsed: article.post.modelUsed ?? null,
          errorReason: article.post.errorReason ?? null,
          tokensInput: article.post.tokensInput ?? null,
          tokensOutput: article.post.tokensOutput ?? null,
          promptBaseHash: article.post.promptBaseHash ?? null,
          attemptCount: article.post.attemptCount ?? 0,
          updatedAt: toIsoString(article.post.updatedAt),
        }
      : null,
    link: article.link ?? null,
    articleHtml: noticia,
    noticia,
  };

  if (includeDiagnostics) {
    const preview = buildPreview(noticia);
    response.noticiaPreviewLength = preview.length;
    response.hasBlockTags = hasBlockTags(noticia);
  }

  return response;
};

const refresh = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const result = await postsService.refreshUserFeeds({ ownerKey });

  let generationSummary = null;
  try {
    generationSummary = await postGenerationService.generatePostsForOwner({ ownerKey });
  } catch (error) {
    console.error('Failed to generate posts for LinkedIn', { ownerKey, error });
    generationSummary = postGenerationService.getLatestStatus(ownerKey);
  }

  return res.success({
    now: result.now.toISOString(),
    feeds: result.results.map(mapFeedSummary),
    generation: generationSummary,
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
    const includeDiagnostics = !config.isProduction || req.user?.role === ROLES.ADMIN;

    return res.success(
      {
        items: result.items.map((article) => mapPostListItem(article, { includeDiagnostics })),
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
