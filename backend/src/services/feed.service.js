const ApiError = require('../utils/api-error');
const { prisma } = require('../lib/prisma');

const MAX_PAGE_SIZE = 50;
const MAX_BULK_FEED_URLS = 25;

const sanitizeString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const normalizeTitle = (title) => {
  if (title === undefined) {
    return undefined;
  }

  const sanitized = sanitizeString(title);
  return sanitized.length > 0 ? sanitized : null;
};

const ensureValidUrl = (input, { required = true } = {}) => {
  const sanitized = sanitizeString(input);

  if (!sanitized) {
    if (!required) {
      return null;
    }

    throw new ApiError({ statusCode: 400, code: 'URL_REQUIRED', message: 'URL is required' });
  }

  try {
    const parsed = new URL(sanitized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol');
    }
  } catch (error) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_URL', message: 'Invalid URL provided' });
  }

  return sanitized;
};

const filterOwnerFeed = async (id, ownerKey) => {
  const feed = await prisma.feed.findUnique({ where: { id } });

  if (!feed || feed.ownerKey !== ownerKey) {
    throw new ApiError({ statusCode: 404, code: 'FEED_NOT_FOUND', message: 'Feed not found' });
  }

  return feed;
};

const listFeeds = async ({ ownerKey, cursor, limit }) => {
  const safeLimit = Math.min(Math.max(limit ?? 20, 1), MAX_PAGE_SIZE);

  const query = {
    where: { ownerKey },
    orderBy: { id: 'asc' },
    take: safeLimit + 1,
  };

  if (cursor) {
    query.cursor = { id: cursor };
    query.skip = 1;
  }

  const feeds = await prisma.feed.findMany(query);
  const hasMore = feeds.length > safeLimit;
  const items = hasMore ? feeds.slice(0, safeLimit) : feeds;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  const total = await prisma.feed.count({ where: { ownerKey } });

  return {
    items,
    nextCursor,
    total,
    limit: safeLimit,
  };
};

const createFeed = async ({ ownerKey, url, title }) => {
  const normalizedUrl = ensureValidUrl(url);
  const normalizedTitle = normalizeTitle(title);

  const existing = await prisma.feed.findUnique({
    where: {
      ownerKey_url: { ownerKey, url: normalizedUrl },
    },
  });

  if (existing) {
    throw new ApiError({ statusCode: 409, code: 'FEED_ALREADY_EXISTS', message: 'Feed already exists for this user' });
  }

  const created = await prisma.feed.create({
    data: {
      ownerKey,
      url: normalizedUrl,
      title: normalizedTitle ?? undefined,
    },
  });

  return created;
};

const analyzeUrlCandidate = (value) => {
  const sanitized = sanitizeString(value);

  if (!sanitized) {
    return { ok: false, url: '', reason: 'URL_REQUIRED' };
  }

  try {
    const parsed = new URL(sanitized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, url: sanitized, reason: 'INVALID_URL' };
    }
  } catch (error) {
    return { ok: false, url: sanitized, reason: 'INVALID_URL' };
  }

  return { ok: true, url: sanitized };
};

const createFeedsInBulk = async ({ ownerKey, urls }) => {
  const result = {
    created: [],
    duplicates: [],
    invalid: [],
  };

  if (!Array.isArray(urls)) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_PAYLOAD', message: 'urls must be an array of strings' });
  }

  if (urls.length > MAX_BULK_FEED_URLS) {
    throw new ApiError({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: `A maximum of ${MAX_BULK_FEED_URLS} feeds can be created per request`,
    });
  }

  const seen = new Set();
  const candidates = [];

  urls.forEach((candidate) => {
    const analysis = analyzeUrlCandidate(candidate);

    if (!analysis.ok) {
      result.invalid.push({ url: analysis.url, reason: analysis.reason });
      return;
    }

    if (seen.has(analysis.url)) {
      result.duplicates.push({ url: analysis.url, reason: 'DUPLICATE_IN_PAYLOAD', feedId: null });
      return;
    }

    seen.add(analysis.url);
    candidates.push(analysis.url);
  });

  if (candidates.length === 0) {
    return result;
  }

  const existingFeeds = await prisma.feed.findMany({
    where: {
      ownerKey,
      url: { in: candidates },
    },
  });

  const existingByUrl = new Map();
  existingFeeds.forEach((feed) => {
    existingByUrl.set(feed.url, feed);
    result.duplicates.push({ url: feed.url, reason: 'ALREADY_EXISTS', feedId: feed.id });
  });

  const urlsToCreate = candidates.filter((url) => !existingByUrl.has(url));

  for (const url of urlsToCreate) {
    const created = await prisma.feed.create({
      data: {
        ownerKey,
        url,
      },
    });

    result.created.push(created);
  }

  return result;
};

const updateFeed = async ({ ownerKey, feedId, url, title }) => {
  const existing = await filterOwnerFeed(feedId, ownerKey);

  const data = {};

  if (url !== undefined) {
    const normalizedUrl = ensureValidUrl(url);

    if (normalizedUrl !== existing.url) {
      const duplicate = await prisma.feed.findUnique({
        where: {
          ownerKey_url: { ownerKey, url: normalizedUrl },
        },
      });

      if (duplicate && duplicate.id !== feedId) {
        throw new ApiError({ statusCode: 409, code: 'FEED_ALREADY_EXISTS', message: 'Feed already exists for this user' });
      }

      data.url = normalizedUrl;
    }
  }

  if (title !== undefined) {
    data.title = normalizeTitle(title);
  }

  if (Object.keys(data).length === 0) {
    return existing;
  }

  const updated = await prisma.feed.update({
    where: { id: feedId },
    data,
  });

  return updated;
};

const deleteFeed = async ({ ownerKey, feedId }) => {
  await filterOwnerFeed(feedId, ownerKey);

  await prisma.feed.delete({ where: { id: feedId } });
};

module.exports = {
  listFeeds,
  createFeed,
  createFeedsInBulk,
  updateFeed,
  deleteFeed,
  constants: {
    MAX_PAGE_SIZE,
    MAX_BULK_FEED_URLS,
  },
};
