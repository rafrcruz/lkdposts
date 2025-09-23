const asyncHandler = require('../utils/async-handler');
const ingestionDiagnostics = require('../services/ingestion-diagnostics');

const toIsoString = (value) => {
  if (value instanceof Date) {
    const timestamp = value.valueOf();
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp).toISOString();
    }
    return null;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
  }

  return null;
};

const listIngestionDiagnostics = asyncHandler(async (req, res) => {
  const { limit, feedId } = req.validated?.query ?? {};
  const entries = ingestionDiagnostics.getRecent({ limit, feedId });

  const items = entries.map((entry) => ({
    itemId: entry.articleId,
    feedId: entry.feedId ?? null,
    feedTitle: entry.feedTitle ?? null,
    itemTitle: entry.itemTitle ?? null,
    canonicalUrl: entry.canonicalUrl ?? null,
    publishedAt: toIsoString(entry.publishedAt),
    chosenSource: entry.chosenSource,
    rawDescriptionLength: entry.rawDescriptionLength,
    bodyHtmlRawLength: entry.bodyHtmlRawLength,
    articleHtmlLength: entry.articleHtmlLength,
    hasBlockTags: entry.hasBlockTags,
    looksEscapedHtml: entry.looksEscapedHtml,
    weakContent: entry.weakContent,
    articleHtmlPreview: entry.articleHtmlPreview,
    recordedAt: toIsoString(entry.recordedAt),
  }));

  return res.success({ items });
});

module.exports = {
  listIngestionDiagnostics,
};
