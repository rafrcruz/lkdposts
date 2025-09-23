const he = require('he');

const TEXT_NODE_KEYS = ['#text', '_text', 'text', 'value'];

const ensureArray = (value) => {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const coerceToString = (value) => {
  if (value == null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
};

const extractFirstText = (value) => {
  const direct = coerceToString(value);
  if (direct != null) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = extractFirstText(entry);
      if (text != null && text !== '') {
        return text;
      }
    }
    return undefined;
  }

  if (value && typeof value === 'object') {
    for (const key of TEXT_NODE_KEYS) {
      if (Object.hasOwn(value, key)) {
        const text = extractFirstText(value[key]);
        if (text != null && text !== '') {
          return text;
        }
      }
    }
  }

  return undefined;
};

const decodeAndTrim = (value) => {
  const raw = extractFirstText(value);
  if (typeof raw !== 'string') {
    return undefined;
  }
  const decoded = he.decode(raw, { isAttributeValue: false });
  const trimmed = decoded.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getRawHtml = (value) => {
  const raw = extractFirstText(value);
  return typeof raw === 'string' ? raw : undefined;
};

const parseBooleanAttribute = (value) => {
  if (value == null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return undefined;
};

const parseNumberAttribute = (value) => {
  if (value == null) {
    return undefined;
  }

  const numberValue = Number.parseInt(String(value).trim(), 10);
  return Number.isNaN(numberValue) ? undefined : numberValue;
};

const decodeUrl = (value) => {
  const raw = extractFirstText(value);
  if (typeof raw !== 'string') {
    return undefined;
  }
  const decoded = he.decode(raw, { isAttributeValue: true });
  const trimmed = decoded.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const extractAtomLink = (links) => {
  const entries = ensureArray(links);
  let fallback;

  for (const entry of entries) {
    if (!entry) {
      continue;
    }

    if (typeof entry === 'string') {
      const url = decodeUrl(entry);
      if (url && !fallback) {
        fallback = url;
      }
      continue;
    }

    if (typeof entry === 'object') {
      const relRaw = entry['@_rel'] ?? entry.rel;
      const rel = typeof relRaw === 'string' ? relRaw.trim().toLowerCase() : undefined;
      const href = decodeUrl(entry['@_href'] ?? entry.href ?? entry);

      if (!href) {
        continue;
      }

      if (rel === 'alternate') {
        return href;
      }

      if (!fallback && !rel) {
        fallback = href;
      }

      if (!fallback && rel === 'self') {
        fallback = href;
      }
    }
  }

  return fallback;
};

const resolveCanonicalUrl = (item) => {
  const origLink = decodeUrl(item['feedburner:origLink']);
  if (origLink) {
    return origLink;
  }

  const link = item.link;
  if (link && typeof link === 'object' && (link['@_href'] || Array.isArray(link))) {
    const atomLink = extractAtomLink(link);
    if (atomLink) {
      return atomLink;
    }
  }

  const stringLink = decodeUrl(link);
  if (stringLink) {
    return stringLink;
  }

  return undefined;
};

const formatPublishedDate = (item) => {
  const candidates = [item.pubDate, item.published, item.updated];

  for (const candidate of candidates) {
    const text = extractFirstText(candidate);
    if (!text) {
      continue;
    }

    const date = new Date(text);
    if (!Number.isNaN(date.valueOf())) {
      return date.toISOString().slice(0, 10);
    }
  }

  return undefined;
};

const extractAuthor = (item) => {
  const creator = decodeAndTrim(item['dc:creator']);
  if (creator) {
    return creator;
  }

  const atomAuthor = item.author;
  if (atomAuthor && typeof atomAuthor === 'object') {
    const name = decodeAndTrim(atomAuthor.name);
    if (name) {
      return name;
    }
  }

  const author = decodeAndTrim(item.author);
  return author ?? undefined;
};

const collectCategoryStrings = (value) => {
  const result = [];

  if (value == null) {
    return result;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    result.push(String(value));
    return result;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      result.push(...collectCategoryStrings(entry));
    }
    return result;
  }

  if (typeof value === 'object') {
    if (typeof value['@_term'] === 'string') {
      result.push(value['@_term']);
    }
    if (typeof value['@_label'] === 'string') {
      result.push(value['@_label']);
    }
    if (typeof value['@_scheme'] === 'string') {
      result.push(value['@_scheme']);
    }

    for (const key of TEXT_NODE_KEYS) {
      if (Object.hasOwn(value, key)) {
        result.push(...collectCategoryStrings(value[key]));
      }
    }
  }

  return result;
};

const normalizeCategories = (item) => {
  const rawCategories = [item.category, item.categories, item['dc:subject']];
  const deduped = new Map();

  for (const candidate of rawCategories) {
    const values = collectCategoryStrings(candidate);
    for (const value of values) {
      const decoded = he.decode(String(value), { isAttributeValue: false }).trim();
      if (!decoded) {
        continue;
      }
      const key = decoded.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, decoded);
      }
    }
  }

  return Array.from(deduped.values());
};

const buildRawHtmlCandidates = (item) => ({
  contentEncoded: getRawHtml(item['content:encoded']),
  content: getRawHtml(item.content),
  descriptionOrSummary: getRawHtml(item.description ?? item.summary),
});

const parseMediaResource = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }

  const url = decodeUrl(entry['@_url'] ?? entry.url);
  if (!url) {
    return undefined;
  }

  const width = parseNumberAttribute(entry['@_width'] ?? entry.width);
  const height = parseNumberAttribute(entry['@_height'] ?? entry.height);

  const resource = { url };
  if (width != null) {
    resource.width = width;
  }
  if (height != null) {
    resource.height = height;
  }

  return resource;
};

const collectMediaResources = (value) => {
  const resources = [];
  for (const entry of ensureArray(value)) {
    const parsed = parseMediaResource(entry);
    if (parsed) {
      resources.push(parsed);
    }
  }
  return resources;
};

const selectEnclosureImage = (value) => {
  for (const entry of ensureArray(value)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const type = decodeAndTrim(entry['@_type'] ?? entry.type);
    if (!type || !type.toLowerCase().startsWith('image/')) {
      continue;
    }
    const url = decodeUrl(entry['@_url'] ?? entry.url);
    if (!url) {
      continue;
    }
    return { url, type };
  }
  return undefined;
};

const IMG_SRC_REGEX = /<img\b[^>]*?\bsrc\s*=\s*("([^"]+)"|'([^']+)'|([^"'\s>]+))/gi;

const collectInlineImages = (candidates) => {
  const deduped = new Map();

  for (const html of candidates) {
    if (typeof html !== 'string') {
      continue;
    }

    let match;
    while ((match = IMG_SRC_REGEX.exec(html)) != null) {
      const rawSrc = match[2] ?? match[3] ?? match[4];
      if (!rawSrc) {
        continue;
      }
      const decoded = he.decode(rawSrc, { isAttributeValue: true }).trim();
      if (!decoded) {
        continue;
      }
      const key = decoded;
      if (!deduped.has(key)) {
        deduped.set(key, decoded);
      }
    }
  }

  return Array.from(deduped.values());
};

const buildMediaObject = (item, rawHtmlCandidates) => {
  const mediaContent = collectMediaResources(item['media:content']);
  const mediaThumbnail = collectMediaResources(item['media:thumbnail']);
  const enclosureImage = selectEnclosureImage(item.enclosure);
  const inlineImages = collectInlineImages([
    rawHtmlCandidates.contentEncoded,
    rawHtmlCandidates.content,
    rawHtmlCandidates.descriptionOrSummary,
  ]);

  const media = {};
  if (mediaContent.length > 0) {
    media.mediaContent = mediaContent;
  }
  if (mediaThumbnail.length > 0) {
    media.mediaThumbnail = mediaThumbnail;
  }
  if (enclosureImage) {
    media.enclosureImage = enclosureImage;
  }
  if (inlineImages.length > 0) {
    media.inlineImages = inlineImages;
  }

  return Object.keys(media).length > 0 ? media : undefined;
};

const extractGuid = (item) => {
  const guidRaw = item.guid;
  const guid = decodeAndTrim(guidRaw);
  const isPermaLink = parseBooleanAttribute(
    guidRaw && typeof guidRaw === 'object' ? guidRaw['@_isPermaLink'] ?? guidRaw.isPermaLink : undefined,
  );

  if (!guid && isPermaLink === undefined) {
    return undefined;
  }

  const result = {};
  if (guid) {
    result.guid = guid;
  }
  if (isPermaLink !== undefined) {
    result.isPermaLink = isPermaLink;
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

/**
 * Normalizes a parsed feed entry (RSS 2.0, Atom 1.0 or RSS 1.0/RDF) into a standard shape.
 *
 * @param {object} rawItem - Item produced by the XML parser used by the feed fetcher.
 * @param {object} [options]
 * @param {string} [options.feedUrl] - URL of the source feed, if available in the context.
 * @param {{ warn?: Function }} [options.logger] - Optional logger used for soft warnings.
 * @returns {object} Normalized feed item containing title, canonicalUrl, publication date, author,
 * categories, raw HTML candidates, media metadata, optional GUID information and source feed.
 */
const normalizeFeedItem = (rawItem, options = {}) => {
  if (!rawItem || typeof rawItem !== 'object') {
    throw new TypeError('rawItem must be an object');
  }

  const { feedUrl, logger = console } = options;

  const title = decodeAndTrim(rawItem.title) ?? '';
  const canonicalUrl = resolveCanonicalUrl(rawItem);
  const publishedAtISO = formatPublishedDate(rawItem);
  const author = extractAuthor(rawItem);
  const categories = normalizeCategories(rawItem);
  const rawHtmlCandidates = buildRawHtmlCandidates(rawItem);
  const media = buildMediaObject(rawItem, rawHtmlCandidates);
  const guidInfo = extractGuid(rawItem);

  if (!title && logger?.warn) {
    logger.warn('Feed item missing title', { feedUrl, guid: guidInfo?.guid ?? null });
  }

  if (!canonicalUrl && logger?.warn) {
    logger.warn('Feed item missing canonical URL', { feedUrl, guid: guidInfo?.guid ?? null });
  }

  const normalized = {
    title,
    canonicalUrl,
    publishedAtISO,
    author,
    categories,
    rawHtmlCandidates,
  };

  if (media) {
    normalized.media = media;
  }

  if (guidInfo) {
    Object.assign(normalized, guidInfo);
  }

  if (feedUrl) {
    normalized.sourceFeed = { url: feedUrl };
  }

  return normalized;
};

module.exports = {
  normalizeFeedItem,
};

