const MAX_ENTRIES = 200;

const diagnosticsMap = new Map();

const normalizeInteger = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
};

const normalizeString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value;
};

const record = (entry) => {
  if (!entry || entry.articleId == null) {
    return;
  }

  const normalized = {
    articleId: entry.articleId,
    feedId: entry.feedId ?? null,
    feedTitle: entry.feedTitle ?? null,
    itemTitle: entry.itemTitle ?? null,
    canonicalUrl: entry.canonicalUrl ?? null,
    publishedAt: entry.publishedAt ? new Date(entry.publishedAt) : null,
    chosenSource: entry.chosenSource ?? 'empty',
    rawDescriptionLength: normalizeInteger(entry.rawDescriptionLength),
    bodyHtmlRawLength: normalizeInteger(entry.bodyHtmlRawLength),
    articleHtmlLength: normalizeInteger(entry.articleHtmlLength),
    hasBlockTags: Boolean(entry.hasBlockTags),
    looksEscapedHtml: Boolean(entry.looksEscapedHtml),
    weakContent: Boolean(entry.weakContent),
    articleHtmlPreview: normalizeString(entry.articleHtmlPreview),
    recordedAt: entry.recordedAt ? new Date(entry.recordedAt) : new Date(),
  };

  if (diagnosticsMap.has(normalized.articleId)) {
    diagnosticsMap.delete(normalized.articleId);
  }

  diagnosticsMap.set(normalized.articleId, normalized);

  while (diagnosticsMap.size > MAX_ENTRIES) {
    const oldestKey = diagnosticsMap.keys().next().value;
    diagnosticsMap.delete(oldestKey);
  }
};

const getRecent = ({ limit, feedId } = {}) => {
  const safeLimit = (() => {
    if (limit == null) {
      return 25;
    }
    const numeric = Number(limit);
    if (!Number.isFinite(numeric)) {
      return 25;
    }
    return Math.max(1, Math.min(MAX_ENTRIES, Math.trunc(numeric)));
  })();

  const allEntries = Array.from(diagnosticsMap.values()).reverse();
  const items = [];

  for (const entry of allEntries) {
    if (feedId != null && entry.feedId !== feedId) {
      continue;
    }
    items.push(entry);
    if (items.length >= safeLimit) {
      break;
    }
  }

  return items;
};

const reset = () => {
  diagnosticsMap.clear();
};

module.exports = {
  record,
  getRecent,
  reset,
};
