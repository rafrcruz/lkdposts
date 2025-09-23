const { XMLParser } = require('fast-xml-parser');
const { createHash } = require('node:crypto');

const feedRepository = require('../repositories/feed.repository');
const articleRepository = require('../repositories/article.repository');
const postRepository = require('../repositories/post.repository');
const { createTtlCache } = require('../utils/ttl-cache');
const { normalizeFeedItem } = require('../lib/feed-normalizer');
const { selectBodyAndLead } = require('../lib/body-lead-selector');
const { assembleArticle } = require('../lib/article-assembler');
const { createLogger } = require('./rss-logger');
const rssMetrics = require('./rss-metrics');
const config = require('../config');

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 5000;
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

class RSSIngestionError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'RSSIngestionError';
  }
}

let ingestionLogger = createLogger(config.rss?.logLevel ?? 'info');
const getIngestionLogger = () => {
  const desiredLevel = config.rss?.logLevel ?? 'info';
  if (ingestionLogger.level !== desiredLevel) {
    ingestionLogger = createLogger(desiredLevel);
  }
  return ingestionLogger;
};

const normalizeDate = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) {
      return null;
    }
    return value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  return null;
};

const ensureDate = (value) => {
  const date = normalizeDate(value ?? new Date());
  if (!date) {
    throw new TypeError('Invalid date value provided');
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

  return value.replaceAll(/<[^>]+>/g, ' ');
};

const cleanText = (value) => stripHtml(value).replaceAll(/\s+/g, ' ').trim();

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

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;')
    .replaceAll(/'/g, '&#39;');

const buildFallbackArticleHtml = ({ title, link }) => {
  const safeTitle = escapeHtml(title ?? '');
  const safeLink = link ? escapeHtml(link) : null;

  if (safeLink) {
    const prefix = safeTitle ? `${safeTitle} ` : '';
    return `<p>${prefix}<a href="${safeLink}" rel="noopener" target="_blank">Ler na fonte</a></p>`;
  }

  return `<p>${safeTitle}</p>`;
};

const getAssemblerOptions = () => {
  const rssConfig = config.rss ?? {};
  const allowedHosts = Array.isArray(rssConfig.allowedIframeHosts)
    ? rssConfig.allowedIframeHosts
        .map((host) => (typeof host === 'string' ? host.trim() : ''))
        .filter((host) => host.length > 0)
    : [];

  return {
    keepEmbeds: Boolean(rssConfig.keepEmbeds),
    allowedIframeHosts: allowedHosts,
    injectTopImage: rssConfig.injectTopImage !== false,
    excerptMaxChars:
      Number.isFinite(rssConfig.excerptMaxChars) && rssConfig.excerptMaxChars > 0
        ? rssConfig.excerptMaxChars
        : 220,
    maxHtmlKB:
      Number.isFinite(rssConfig.maxHtmlKB) && rssConfig.maxHtmlKB > 0 ? rssConfig.maxHtmlKB : 150,
    stripKnownBoilerplates: rssConfig.stripKnownBoilerplates !== false,
    trackerParamsRemoveList: Array.isArray(rssConfig.trackerParamsRemoveList)
      ? rssConfig.trackerParamsRemoveList
          .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
          .filter((entry) => entry.length > 0)
      : null,
  };
};

const VALID_REPROCESS_POLICIES = new Set(['never', 'if-empty', 'if-empty-or-changed', 'always']);

const getReprocessPolicy = () => {
  const policy = config.rss?.reprocessPolicy ?? 'if-empty-or-changed';
  return VALID_REPROCESS_POLICIES.has(policy) ? policy : 'if-empty-or-changed';
};

const isHtmlEmpty = (value) => {
  if (typeof value !== 'string') {
    return true;
  }
  return value.replace(/\s+/g, '').length === 0;
};

const normalizeHtmlForDiff = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim();
};

const hasSubstantialHtmlChange = (currentHtml, newHtml) => {
  const normalizedCurrent = normalizeHtmlForDiff(currentHtml);
  const normalizedNew = normalizeHtmlForDiff(newHtml);

  if (!normalizedCurrent && !normalizedNew) {
    return false;
  }

  const currentHash = createHash('sha256').update(normalizedCurrent).digest('hex');
  const newHash = createHash('sha256').update(normalizedNew).digest('hex');
  if (currentHash === newHash) {
    return false;
  }

  const currentLength = normalizedCurrent.length;
  const newLength = normalizedNew.length;
  if (currentLength === 0 || newLength === 0) {
    return currentLength !== newLength;
  }

  const maxLength = Math.max(currentLength, newLength);
  const lengthDelta = Math.abs(currentLength - newLength) / maxLength;
  if (lengthDelta > 0.05) {
    return true;
  }

  const currentTokens = new Set(
    normalizedCurrent
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
  );
  const newTokens = new Set(
    normalizedNew
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
  );

  if (currentTokens.size === 0 || newTokens.size === 0) {
    return currentTokens.size !== newTokens.size;
  }

  let intersection = 0;
  for (const token of currentTokens) {
    if (newTokens.has(token)) {
      intersection += 1;
    }
  }

  const unionSize = currentTokens.size + newTokens.size - intersection;
  const similarity = unionSize === 0 ? 1 : intersection / unionSize;
  return similarity < 0.9;
};

const shouldUpdateArticleHtml = (policy, currentHtml, newHtml) => {
  switch (policy) {
    case 'never':
      return false;
    case 'always':
      return true;
    case 'if-empty':
      return isHtmlEmpty(currentHtml);
    case 'if-empty-or-changed':
    default:
      return isHtmlEmpty(currentHtml) || hasSubstantialHtmlChange(currentHtml, newHtml);
  }
};

const wrapIngestionError = (stage, error) => {
  if (error instanceof RSSIngestionError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new RSSIngestionError(`${stage}: ${message}`, { cause: error });
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

const extractLinkFromString = (value) => sanitizeIdentifier(value);

const extractLinkFromArray = (links) => {
  for (const entry of links) {
    const link = extractLink(entry);
    if (link) {
      return link;
    }
  }

  return null;
};

const extractLinkFromObject = (rawLink) => {
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

  return null;
};

const extractLink = (rawLink) => {
  if (rawLink == null) {
    return null;
  }

  if (typeof rawLink === 'string') {
    return extractLinkFromString(rawLink);
  }

  if (Array.isArray(rawLink)) {
    return extractLinkFromArray(rawLink);
  }

  if (typeof rawLink === 'object') {
    return extractLinkFromObject(rawLink);
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

const isAbortError = (error) => error instanceof Error && error.name === 'AbortError';

const rethrowFetchError = (error) => {
  if (isAbortError(error)) {
    throw new Error('Feed request timed out', { cause: error });
  }

  throw error;
};

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
    }).catch(rethrowFetchError);

    if (!response || typeof response.text !== 'function') {
      throw new Error('Invalid response from feed fetcher');
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: HTTP ${response.status}`);
    }

    const body = await response.text();
    if (typeof body !== 'string') {
      throw new TypeError('Feed response was not text');
    }

    let parsed;
    try {
      parsed = parser.parse(body);
    } catch (error) {
      throw new Error('Failed to parse feed XML', { cause: error });
    }

    const rawItems = extractItemsFromParsedFeed(parsed);
    const items = [];
    let invalidItems = 0;
    const assemblerOptions = getAssemblerOptions();
    const logger = getIngestionLogger();

    for (const raw of rawItems) {
      rssMetrics.incrementItemsTotal();
      const itemStart = Date.now();

      const publishedAt = parsePublishedAt(raw);
      if (!publishedAt) {
        invalidItems += 1;
        rssMetrics.observeItemDuration(Date.now() - itemStart);
        continue;
      }

      const rawTitle = cleanText(extractText(raw.title));
      const truncatedRawTitle = rawTitle ? truncateText(rawTitle, MAX_ARTICLE_TITLE_LENGTH) : '';
      const snippet = buildContentSnippet(raw);
      const snippetFallback = truncatedRawTitle ? truncateText(truncatedRawTitle, MAX_ARTICLE_CONTENT_LENGTH) : '';
      const mergedSnippet = snippet || snippetFallback || 'No description available.';
      const fallbackTitle = truncatedRawTitle || 'Untitled';
      const fallbackGuid = sanitizeIdentifier(extractText(raw.guid));
      const fallbackLink = sanitizeIdentifier(extractLink(raw.link));

      let normalized;
      try {
        normalized = normalizeFeedItem(raw, { feedUrl: url, logger });
      } catch (error) {
        const wrapped = wrapIngestionError('normalize', error);
        rssMetrics.incrementItemsFailed();
        rssMetrics.recordChosenSource('fallback');
        rssMetrics.recordLeadUsed(false);
        rssMetrics.recordImageSource('none');
        rssMetrics.recordTruncated(false);
        rssMetrics.observeItemDuration(Date.now() - itemStart);
        logger.warn('Failed to normalize feed item, using fallback HTML', {
          feedUrl: url,
          reason: wrapped.message,
        });
        items.push({
          title: fallbackTitle,
          contentSnippet: mergedSnippet,
          publishedAt,
          guid: fallbackGuid,
          link: fallbackLink,
          articleHtml: buildFallbackArticleHtml({ title: fallbackTitle, link: fallbackLink }),
        });
        rssMetrics.incrementItemsProcessed();
        continue;
      }

      const normalizedTitle = typeof normalized.title === 'string' ? normalized.title.trim() : '';
      const finalTitle = truncateText(normalizedTitle || truncatedRawTitle || '', MAX_ARTICLE_TITLE_LENGTH) || 'Untitled';
      const guid = sanitizeIdentifier(normalized.guid ?? fallbackGuid);
      const canonicalUrl = sanitizeIdentifier(normalized.canonicalUrl ?? fallbackLink);

      let selectionDiagnostics = { chosenSource: 'empty', leadUsed: false };
      let assembleDiagnostics = {
        imageSource: 'none',
        truncated: false,
        removedEmbeds: 0,
        trackerParamsRemoved: 0,
      };
      let articleHtml = '';
      let usedFallback = false;

      try {
        const selection = selectBodyAndLead(normalized);
        selectionDiagnostics = selection.diagnostics ?? selectionDiagnostics;
        const assembly = assembleArticle(normalized, selection, assemblerOptions);
        assembleDiagnostics = assembly.diagnostics ?? assembleDiagnostics;
        articleHtml = (assembly.articleHtml ?? '').trim();

        if (!articleHtml) {
          usedFallback = true;
          rssMetrics.incrementItemsFailed();
          articleHtml = buildFallbackArticleHtml({ title: finalTitle, link: canonicalUrl });
          logger.warn('Article assembly returned empty HTML, using fallback', {
            feedUrl: url,
            guid,
            link: canonicalUrl,
          });
          selectionDiagnostics = {
            ...selectionDiagnostics,
            leadUsed: false,
          };
        }
      } catch (error) {
        const wrapped = wrapIngestionError('assemble', error);
        usedFallback = true;
        rssMetrics.incrementItemsFailed();
        articleHtml = buildFallbackArticleHtml({ title: finalTitle, link: canonicalUrl });
        logger.warn('Article assembly failed, using fallback HTML', {
          feedUrl: url,
          guid,
          link: canonicalUrl,
          reason: wrapped.message,
        });
        selectionDiagnostics = {
          ...selectionDiagnostics,
          leadUsed: false,
        };
        assembleDiagnostics = {
          imageSource: 'none',
          truncated: false,
          removedEmbeds: 0,
          trackerParamsRemoved: 0,
        };
      }

      rssMetrics.recordChosenSource(selectionDiagnostics?.chosenSource ?? 'empty');
      rssMetrics.recordLeadUsed(Boolean(selectionDiagnostics?.leadUsed));
      rssMetrics.recordImageSource(assembleDiagnostics?.imageSource ?? 'none');
      rssMetrics.recordTruncated(Boolean(assembleDiagnostics?.truncated));
      rssMetrics.addRemovedEmbeds(assembleDiagnostics?.removedEmbeds ?? 0);
      rssMetrics.addTrackerParamsRemoved(assembleDiagnostics?.trackerParamsRemoved ?? 0);

      const durationMs = Date.now() - itemStart;
      rssMetrics.observeItemDuration(durationMs);

      logger.debug('RSS item processed', {
        feedUrl: url,
        guid,
        link: canonicalUrl,
        chosenSource: selectionDiagnostics?.chosenSource ?? 'empty',
        imageSource: assembleDiagnostics?.imageSource ?? 'none',
        leadUsed: Boolean(selectionDiagnostics?.leadUsed),
        truncated: Boolean(assembleDiagnostics?.truncated),
        trackerParamsRemoved: assembleDiagnostics?.trackerParamsRemoved ?? 0,
        removedEmbeds: assembleDiagnostics?.removedEmbeds ?? 0,
        fallback: usedFallback,
      });

      items.push({
        title: finalTitle,
        contentSnippet: mergedSnippet,
        publishedAt,
        guid,
        link: canonicalUrl,
        articleHtml,
      });
      rssMetrics.incrementItemsProcessed();
    }

    items.sort((a, b) => a.publishedAt.valueOf() - b.publishedAt.valueOf());

    return {
      rawCount: rawItems.length,
      items,
      invalidItems,
    };
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
    throw new TypeError('No fetch implementation available');
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
  const lastFetchedTime = lastFetchedAt.valueOf();
  const elapsedMs = currentTime.valueOf() - lastFetchedTime;

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
  const windowStartMs = windowStart.valueOf();
  const currentTimeMs = currentTime.valueOf();

  for (const item of items) {
    const publishedMs = item.publishedAt.valueOf();
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
  const existingByKey = new Map(existing.map((entry) => [entry.dedupeKey, entry]));
  const policy = getReprocessPolicy();
  const logger = getIngestionLogger();

  let created = 0;
  let duplicates = 0;

    for (const candidate of candidates) {
      const existingArticle = existingByKey.get(candidate.dedupeKey);

      if (!existingArticle) {
      const article = await articleRepository.create({
        feedId: feed.id,
        title: candidate.title,
        contentSnippet: candidate.contentSnippet,
        articleHtml: candidate.articleHtml,
        publishedAt: candidate.publishedAt,
        guid: candidate.guid ?? null,
        link: candidate.link ?? null,
        dedupeKey: candidate.dedupeKey,
      });

      await postRepository.create({
        articleId: article.id,
        content: POST_PLACEHOLDER_CONTENT,
      });

      existingByKey.set(candidate.dedupeKey, {
        id: article.id,
        dedupeKey: candidate.dedupeKey,
        articleHtml: candidate.articleHtml,
      });
      created += 1;
      continue;
    }

    if (!shouldUpdateArticleHtml(policy, existingArticle.articleHtml ?? '', candidate.articleHtml)) {
      duplicates += 1;
      rssMetrics.incrementItemsSkipped(policy);
      logger.debug('Skipping article reprocessing per policy', {
        feedId: feed.id,
        policy,
        dedupeKey: candidate.dedupeKey,
      });
      continue;
    }

    await articleRepository.updateArticleHtmlById({
      id: existingArticle.id,
      articleHtml: candidate.articleHtml,
    });
    existingArticle.articleHtml = candidate.articleHtml;
    logger.debug('Updated article HTML via reprocess policy', {
      feedId: feed.id,
      policy,
      dedupeKey: candidate.dedupeKey,
    });
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
    throw new TypeError('ownerKey is required');
  }

  const fetchImpl = getFetchImplementation(fetcher);
  const useCache = !fetcher;
  const currentTime = ensureDate(now);
  const windowStart = new Date(currentTime.valueOf() - WINDOW_MS);

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
    throw new TypeError('ownerKey is required');
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
    throw new TypeError('ownerKey is required');
  }

  const currentTime = ensureDate(now);
  const threshold = new Date(currentTime.valueOf() - WINDOW_MS);

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
      throw new TypeError('Invalid cursor payload');
    }

    const publishedAt = new Date(isoString);
    const id = Number.parseInt(idPart, 10);

    if (Number.isNaN(publishedAt.valueOf()) || !Number.isInteger(id) || id <= 0) {
      throw new TypeError('Invalid cursor payload');
    }

    return { publishedAt, id };
  } catch (error) {
    throw new InvalidCursorError(undefined, { cause: error });
  }
};

const listRecentArticles = async ({ ownerKey, cursor, limit, feedId, now = new Date() }) => {
  if (!ownerKey) {
    throw new TypeError('ownerKey is required');
  }

  const currentTime = ensureDate(now);
  const windowStart = new Date(currentTime.valueOf() - WINDOW_MS);

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
  const lastItem = hasMore ? items.at(-1) ?? null : null;
  const nextCursor = lastItem ? encodeCursor(lastItem) : null;

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
