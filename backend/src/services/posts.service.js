const { XMLParser } = require('fast-xml-parser');
const { createHash } = require('crypto');

const feedRepository = require('../repositories/feed.repository');
const articleRepository = require('../repositories/article.repository');
const postRepository = require('../repositories/post.repository');
const { createTtlCache } = require('../utils/ttl-cache');
const config = require('../config');

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const MAX_PAGE_SIZE = 50;
const MAX_ARTICLE_TITLE_LENGTH = 200;
const MAX_ARTICLE_CONTENT_LENGTH = 800;

const refreshLocks = new Map();

const shouldCacheFeeds =
  config.cache.feedFetchTtlMs > 0 && Number.isInteger(config.cache.feedFetchMaxEntries) && config.cache.feedFetchMaxEntries > 0;

const feedFetchCache = shouldCacheFeeds
  ? createTtlCache({
      ttlMs: config.cache.feedFetchTtlMs,
      maxEntries: config.cache.feedFetchMaxEntries,
    })
  : null;

const POST_PLACEHOLDER_CONTENT = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  'Nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.',
].join('\n');

class InvalidCursorError extends Error {
  constructor(message = 'Invalid pagination cursor', options = {}) {
    super(message, options);
    this.name = 'InvalidCursorError';
    this.code = 'INVALID_CURSOR';
  }
}

const normalizeDate = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

const ensureDate = (value) => {
  const date = normalizeDate(value ?? new Date());
  if (!date) {
    throw new Error('Invalid date value provided');
  }
  return date;
};

const ensureArray = (value) => {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const TEXT_VALUE_KEYS = ['#text', '_text', 'text', 'value'];

const extractTextFromArray = (values) => {
  for (const entry of values) {
    const text = extractText(entry);
    if (text) {
      return text;
    }
  }
  return '';
};

const extractTextFromObject = (value) => {
  for (const key of TEXT_VALUE_KEYS) {
    if (Object.hasOwn(value, key)) {
      const text = extractText(value[key]);
      if (text) {
        return text;
      }
    }
  }
  return '';
};

const extractText = (value) => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return extractTextFromArray(value);
  }

  if (typeof value === 'object') {
    return extractTextFromObject(value);
  }

  return String(value);
};

const stripHtml = (value) => {
  if (!value) {
    return '';
  }

  return value.replace(/<[^>]+>/g, ' ');
};

const cleanText = (value) => stripHtml(value).replace(/\s+/g, ' ').trim();

const truncateText = (value, maxLength) => {
  if (typeof value !== 'string') {
    return '';
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
};

const sanitizeIdentifier = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parsePublishedAt = (item) => {
  const publishedSources = [
    item.pubDate,
    item.published,
    item.updated,
    item.lastBuildDate,
    item['dc:date'],
  ];

  for (const candidate of publishedSources) {
    const normalized = extractText(candidate);
    const parsed = normalizeDate(normalized);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

const extractLink = (rawLink) => {
  if (rawLink == null) {
    return null;
  }

  if (typeof rawLink === 'string') {
    return sanitizeIdentifier(rawLink);
  }

  if (Array.isArray(rawLink)) {
    for (const entry of rawLink) {
      const link = extractLink(entry);
      if (link) {
        return link;
      }
    }
    return null;
  }

  if (typeof rawLink === 'object') {
    if (typeof rawLink.href === 'string') {
      return sanitizeIdentifier(rawLink.href);
    }

    if (typeof rawLink['@_href'] === 'string') {
      const rel = typeof rawLink['@_rel'] === 'string' ? rawLink['@_rel'].trim().toLowerCase() : null;
      if (!rel || rel === 'alternate' || rel === 'self') {
        return sanitizeIdentifier(rawLink['@_href']);
      }
    }

    if (Object.hasOwn(rawLink, '#text')) {
      return extractLink(rawLink['#text']);
    }
  }

  return null;
};

const buildContentSnippet = (item) => {
  const candidates = [
    item.description,
    item.summary,
    item['content:encoded'],
    item.content,
  ];

  for (const candidate of candidates) {
    const text = cleanText(extractText(candidate));
    if (text) {
      return truncateText(text, MAX_ARTICLE_CONTENT_LENGTH);
    }
  }

  return '';
};

const normalizeFeedItem = (rawItem) => {
  const publishedAt = parsePublishedAt(rawItem);
  if (!publishedAt) {
    return null;
  }

  const rawTitle = cleanText(extractText(rawItem.title));
  const normalizedTitle = rawTitle ? truncateText(rawTitle, MAX_ARTICLE_TITLE_LENGTH) : '';
  const normalizedSnippet = buildContentSnippet(rawItem);
  const snippetFromTitle = normalizedTitle ? truncateText(normalizedTitle, MAX_ARTICLE_CONTENT_LENGTH) : '';
  const mergedSnippet = normalizedSnippet || snippetFromTitle;
  const guid = sanitizeIdentifier(extractText(rawItem.guid));
  const link = extractLink(rawItem.link);

  if (!normalizedTitle && !mergedSnippet) {
    return null;
  }

  return {
    title: normalizedTitle || 'Untitled',
    contentSnippet: mergedSnippet || 'No description available.',
    publishedAt,
    guid,
    link,
  };
};

const flattenRssChannelItems = (channels) => {
  const items = [];
  for (const channel of ensureArray(channels)) {
    items.push(...ensureArray(channel.item));
  }
  return items;
};

const extractItemsFromParsedFeed = (parsed) => {
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  if (parsed.feed?.entry) {
    return ensureArray(parsed.feed.entry);
  }

  if (parsed.rss?.channel) {
    return flattenRssChannelItems(parsed.rss.channel);
  }

  if (parsed.channel?.item) {
    return ensureArray(parsed.channel.item);
  }

  if (parsed.item) {
    return ensureArray(parsed.item);
  }

  return [];
};

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
};

const parser = new XMLParser(parserOptions);

const fetchAndParseFeed = async (url, fetcher, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1',
        'user-agent': 'lkdposts-bot/1.0',
      },
    });

    if (!response || typeof response.text !== 'function') {
      throw new Error('Invalid response from feed fetcher');
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: HTTP ${response.status}`);
    }

    const body = await response.text();
    if (typeof body !== 'string') {
      throw new Error('Feed response was not text');
    }

    let parsed;
    try {
      parsed = parser.parse(body);
    } catch (error) {
      throw new Error('Failed to parse feed XML');
    }

    const rawItems = extractItemsFromParsedFeed(parsed);
    const items = [];
    let invalidItems = 0;

    rawItems.forEach((raw) => {
      const normalized = normalizeFeedItem(raw);
      if (normalized) {
        items.push(normalized);
      } else {
        invalidItems += 1;
      }
    });

    items.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

    return {
      rawCount: rawItems.length,
      items,
      invalidItems,
    };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('Feed request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const computeDedupeKey = (item) => {
  if (item.guid) {
    return `guid:${item.guid}`;
  }

  if (item.link) {
    return `link:${item.link}`;
  }

  const hash = createHash('sha256')
    .update(item.title || '')
    .update('|')
    .update(item.contentSnippet || '')
    .update('|')
    .update(item.publishedAt.toISOString())
    .digest('hex');

  return `hash:${hash}`;
};

const fetchFeedWithCache = async (url, fetcher, timeoutMs, useCache = true) => {
  if (!useCache || !feedFetchCache) {
    return fetchAndParseFeed(url, fetcher, timeoutMs);
  }

  const cached = feedFetchCache.get(url);
  if (cached) {
    return cached;
  }

  const pending = fetchAndParseFeed(url, fetcher, timeoutMs);
  feedFetchCache.set(url, pending);

  try {
    const result = await pending;
    feedFetchCache.set(url, result);
    return result;
  } catch (error) {
    feedFetchCache.delete(url);
    throw error;
  }
};

const getFetchImplementation = (fetcher) => {
  const impl = fetcher || globalThis.fetch;
  if (typeof impl !== 'function') {
    throw new Error('No fetch implementation available');
  }
  return impl;
};

const createFeedSummary = (feed) => ({
  feedId: feed.id,
  feedUrl: feed.url,
  feedTitle: feed.title ?? null,
  skippedByCooldown: false,
  cooldownSecondsRemaining: 0,
  itemsRead: 0,
  itemsWithinWindow: 0,
  articlesCreated: 0,
  duplicates: 0,
  invalidItems: 0,
  error: null,
});

const calculateCooldownState = (feed, currentTime) => {
  if (!feed.lastFetchedAt) {
    return { active: false, secondsRemaining: 0 };
  }

  const lastFetchedAt = new Date(feed.lastFetchedAt);
  const lastFetchedTime = lastFetchedAt.getTime();
  const elapsedMs = currentTime.getTime() - lastFetchedTime;

  if (Number.isNaN(lastFetchedTime) || elapsedMs >= COOLDOWN_MS) {
    return { active: false, secondsRemaining: 0 };
  }

  const remainingMs = COOLDOWN_MS - elapsedMs;
  return {
    active: true,
    secondsRemaining: Math.ceil(remainingMs / 1000),
  };
};

const collectCandidatesWithinWindow = (items, windowStart, currentTime) => {
  const candidates = [];
  const windowStartMs = windowStart.getTime();
  const currentTimeMs = currentTime.getTime();

  for (const item of items) {
    const publishedMs = item.publishedAt.getTime();
    if (publishedMs < windowStartMs || publishedMs > currentTimeMs) {
      continue;
    }

    candidates.push({ ...item, dedupeKey: computeDedupeKey(item) });
  }

  return candidates;
};

const persistCandidates = async ({ feed, candidates }) => {
  if (candidates.length === 0) {
    return { created: 0, duplicates: 0 };
  }

  const dedupeKeys = candidates.map((candidate) => candidate.dedupeKey);
  const existing = await articleRepository.findExistingDedupeKeys({ feedId: feed.id, dedupeKeys });
  const existingKeys = new Set(existing.map((entry) => entry.dedupeKey));

  let created = 0;
  let duplicates = 0;

  for (const candidate of candidates) {
    if (existingKeys.has(candidate.dedupeKey)) {
      duplicates += 1;
      continue;
    }

    const article = await articleRepository.create({
      feedId: feed.id,
      title: candidate.title,
      contentSnippet: candidate.contentSnippet,
      publishedAt: candidate.publishedAt,
      guid: candidate.guid ?? null,
      link: candidate.link ?? null,
      dedupeKey: candidate.dedupeKey,
    });

    await postRepository.create({
      articleId: article.id,
      content: POST_PLACEHOLDER_CONTENT,
    });

    existingKeys.add(candidate.dedupeKey);
    created += 1;
  }

  return { created, duplicates };
};

const refreshSingleFeed = async ({ feed, fetchImpl, timeoutMs, useCache, currentTime, windowStart }) => {
  const summary = createFeedSummary(feed);
  const cooldown = calculateCooldownState(feed, currentTime);

  if (cooldown.active) {
    summary.skippedByCooldown = true;
    summary.cooldownSecondsRemaining = cooldown.secondsRemaining;
    return summary;
  }

  try {
    const { rawCount, items, invalidItems } = await fetchFeedWithCache(feed.url, fetchImpl, timeoutMs, useCache);
    summary.itemsRead = rawCount;
    summary.invalidItems = invalidItems;

    const candidates = collectCandidatesWithinWindow(items, windowStart, currentTime);
    summary.itemsWithinWindow = candidates.length;

    if (candidates.length > 0) {
      const { created, duplicates } = await persistCandidates({ feed, candidates });
      summary.articlesCreated = created;
      summary.duplicates = duplicates;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.error = { message };
    console.error('Failed to refresh feed', { feedId: feed.id, error });
  }

  await feedRepository.updateById(feed.id, { lastFetchedAt: currentTime });
  return summary;
};

const performRefreshUserFeeds = async ({ ownerKey, now = new Date(), fetcher, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS }) => {
  if (!ownerKey) {
    throw new Error('ownerKey is required');
  }

  const fetchImpl = getFetchImplementation(fetcher);
  const useCache = !fetcher;
  const currentTime = ensureDate(now);
  const windowStart = new Date(currentTime.getTime() - WINDOW_MS);

  const feeds = await feedRepository.findAllByOwner(ownerKey);
  const results = [];

  for (const feed of feeds) {
    const summary = await refreshSingleFeed({ feed, fetchImpl, timeoutMs, useCache, currentTime, windowStart });
    results.push(summary);
  }

  return {
    now: currentTime,
    results,
  };
};

const refreshUserFeeds = async ({ ownerKey, ...rest }) => {
  if (!ownerKey) {
    throw new Error('ownerKey is required');
  }

  const lockKey = String(ownerKey);
  const existing = refreshLocks.get(lockKey);
  if (existing) {
    return existing;
  }

  let activePromise;
  activePromise = (async () => {
    try {
      return await performRefreshUserFeeds({ ownerKey, ...rest });
    } finally {
      if (refreshLocks.get(lockKey) === activePromise) {
        refreshLocks.delete(lockKey);
      }
    }
  })();

  refreshLocks.set(lockKey, activePromise);
  return activePromise;
};

const cleanupOldArticles = async ({ ownerKey, now = new Date() }) => {
  if (!ownerKey) {
    throw new Error('ownerKey is required');
  }

  const currentTime = ensureDate(now);
  const threshold = new Date(currentTime.getTime() - WINDOW_MS);

  const articlesToRemove = await articleRepository.findIdsForCleanup({ ownerKey, olderThan: threshold });

  if (articlesToRemove.length === 0) {
    return { removedArticles: 0, removedPosts: 0 };
  }

  const articleIds = articlesToRemove.map((article) => article.id);

  const postsResult = await postRepository.deleteManyByArticleIds(articleIds);
  const articlesResult = await articleRepository.deleteManyByIds(articleIds);

  const removedPosts = typeof postsResult === 'number' ? postsResult : postsResult.count ?? 0;
  const removedArticles = typeof articlesResult === 'number' ? articlesResult : articlesResult.count ?? 0;

  return { removedArticles, removedPosts };
};

const encodeCursor = (article) => {
  const payload = `${article.publishedAt.toISOString()}::${article.id}`;
  return Buffer.from(payload, 'utf8').toString('base64');
};

const decodeCursor = (cursor) => {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const [isoString, idPart] = decoded.split('::');
    if (!isoString || !idPart) {
      throw new Error('Invalid cursor payload');
    }

    const publishedAt = new Date(isoString);
    const id = Number.parseInt(idPart, 10);

    if (Number.isNaN(publishedAt.getTime()) || !Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid cursor payload');
    }

    return { publishedAt, id };
  } catch (error) {
    throw new InvalidCursorError(undefined, { cause: error });
  }
};

const listRecentArticles = async ({ ownerKey, cursor, limit, feedId, now = new Date() }) => {
  if (!ownerKey) {
    throw new Error('ownerKey is required');
  }

  const currentTime = ensureDate(now);
  const windowStart = new Date(currentTime.getTime() - WINDOW_MS);

  const safeLimit = Math.min(Math.max(limit ?? 20, 1), MAX_PAGE_SIZE);

  let cursorFilter = null;
  if (cursor) {
    const parsed = decodeCursor(cursor);
    cursorFilter = {
      OR: [
        { publishedAt: { lt: parsed.publishedAt } },
        {
          AND: [
            { publishedAt: parsed.publishedAt },
            { id: { lt: parsed.id } },
          ],
        },
      ],
    };
  }

  const articles = await articleRepository.findRecentForOwner({
    ownerKey,
    windowStart,
    currentTime,
    limit: safeLimit + 1,
    cursorFilter,
    feedId,
  });

  const hasMore = articles.length > safeLimit;
  const items = hasMore ? articles.slice(0, safeLimit) : articles;
  const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;

  return {
    items: items.map((article) => ({
      id: article.id,
      title: article.title,
      contentSnippet: article.contentSnippet,
      publishedAt: article.publishedAt,
      feed: article.feed,
      post: article.post ?? null,
    })),
    nextCursor,
    limit: safeLimit,
  };
};

module.exports = {
  refreshUserFeeds,
  cleanupOldArticles,
  listRecentArticles,
  InvalidCursorError,
  POST_PLACEHOLDER_CONTENT,
  constants: {
    COOLDOWN_MS,
    WINDOW_DAYS,
    WINDOW_MS,
    DEFAULT_FETCH_TIMEOUT_MS,
    MAX_PAGE_SIZE,
    MAX_ARTICLE_TITLE_LENGTH,
    MAX_ARTICLE_CONTENT_LENGTH,
  },
};
