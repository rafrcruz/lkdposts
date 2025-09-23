const { parse, NodeType } = require('node-html-parser');
const he = require('he');

const DEFAULT_OPTIONS = {
  keepEmbeds: false,
  allowedIframeHosts: [],
  injectTopImage: true,
  excerptMaxChars: 220,
  maxHtmlKB: 150,
  stripKnownBoilerplates: true,
};

const ALLOWED_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'blockquote',
  'strong',
  'em',
  'code',
  'pre',
  'figure',
  'figcaption',
  'hr',
  'br',
]);

const VOID_TAGS = new Set(['img', 'hr', 'br']);

const DROP_CONTENT_TAGS = new Set([
  'script',
  'style',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'video',
  'audio',
]);

const READ_MORE_PHRASES = new Set(['read more', 'continue reading']);

const DEFAULT_TRACKING_PARAM_NAMES = new Set([
  'ref',
  'fbclid',
  'gclid',
  'mc_eid',
  'mc_cid',
  'igshid',
  'spm',
  'xtor',
  'mkt_tok',
  'yclid',
  'vero_id',
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;')
    .replaceAll(/'/g, '&#39;');

const isHttpUrl = (value) => {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

const normalizeAllowedHosts = (hosts) => {
  if (!Array.isArray(hosts)) {
    return [];
  }
  const normalized = [];
  for (const host of hosts) {
    if (typeof host !== 'string') {
      continue;
    }
    const trimmed = host.trim().toLowerCase();
    if (trimmed) {
      normalized.push(trimmed);
    }
  }
  return normalized;
};

const computeBaseUrls = (normalized) => {
  const bases = [];
  if (isHttpUrl(normalized?.canonicalUrl)) {
    bases.push(normalized.canonicalUrl);
  }
  if (isHttpUrl(normalized?.sourceFeed?.url)) {
    bases.push(normalized.sourceFeed.url);
  }
  return bases;
};

const sanitizeClassValue = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const classes = value
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return classes.length > 0 ? classes.join(' ') : null;
};

const addLeadClass = (leadHtmlRaw) => {
  if (typeof leadHtmlRaw !== 'string') {
    return '';
  }
  const trimmed = leadHtmlRaw.trim();
  if (!trimmed) {
    return '';
  }
  const paragraphMatch = trimmed.match(/^<p\b([^>]*)>([\s\S]*)<\/p>$/i);
  if (paragraphMatch) {
    const attrsRaw = paragraphMatch[1] ?? '';
    const inner = paragraphMatch[2] ?? '';
    const classMatch = attrsRaw.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
    let updatedAttrs = attrsRaw;
    if (classMatch) {
      const classValue = classMatch[2] ?? classMatch[3] ?? classMatch[4] ?? '';
      const existingClasses = classValue
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (!existingClasses.includes('lead')) {
        existingClasses.push('lead');
      }
      const replacement = `class="${existingClasses.join(' ')}"`;
      updatedAttrs = attrsRaw.replace(classMatch[0], ` ${replacement}`);
    } else {
      updatedAttrs = `${attrsRaw} class="lead"`;
    }
    const normalizedAttrs = updatedAttrs.replace(/\s+/g, ' ').trim();
    const attrPart = normalizedAttrs ? ` ${normalizedAttrs}` : '';
    return `<p${attrPart}>${inner}</p>`;
  }
  return `<p class="lead">${trimmed}</p>`;
};

const isLikelyImageUrl = (urlObject) => {
  if (!urlObject || typeof urlObject !== 'object') {
    return false;
  }
  if (!urlObject.pathname || urlObject.pathname.length <= 1) {
    return false;
  }
  const lowerPath = urlObject.pathname.toLowerCase();
  for (const extension of IMAGE_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) {
      return true;
    }
  }
  return false;
};

const buildTrackerParamNames = (overrideList) => {
  if (!Array.isArray(overrideList) || overrideList.length === 0) {
    return new Set(DEFAULT_TRACKING_PARAM_NAMES);
  }

  const normalized = new Set();
  for (const entry of overrideList) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim().toLowerCase();
    if (trimmed) {
      normalized.add(trimmed);
    }
  }

  return normalized.size > 0 ? normalized : new Set(DEFAULT_TRACKING_PARAM_NAMES);
};

const normalizeUrlValue = (rawValue, context, { allowedSchemes, record = true } = {}) => {
  if (typeof rawValue !== 'string') {
    return { ok: false };
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { ok: false };
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return { ok: false };
  }

  if (lower.startsWith('mailto:')) {
    if (!allowedSchemes.has('mailto')) {
      return { ok: false };
    }
    if (record) {
      context.diagnostics.linkFixes += 1;
    }
    return { ok: true, value: trimmed, protocol: 'mailto:' };
  }

  const candidates = [trimmed];
  if (trimmed.startsWith('//')) {
    candidates.unshift(`https:${trimmed}`);
    candidates.push(`http:${trimmed}`);
  }

  let resolved = null;
  const attemptWithBases = (value) => {
    for (const base of [null, ...context.baseUrls]) {
      try {
        resolved = base ? new URL(value, base) : new URL(value);
        if (resolved) {
          return;
        }
      } catch (error) {
        resolved = null;
      }
    }
  };

  for (const candidate of candidates) {
    attemptWithBases(candidate);
    if (resolved) {
      break;
    }
  }

  if (!resolved) {
    attemptWithBases(trimmed);
  }

  if (!resolved) {
    return { ok: false };
  }

  const protocol = resolved.protocol.toLowerCase();
  const normalizedProtocol = protocol.endsWith(':') ? protocol.slice(0, -1) : protocol;
  if (!allowedSchemes.has(normalizedProtocol)) {
    return { ok: false };
  }
  if ((protocol === 'http:' || protocol === 'https:') && !resolved.hostname) {
    return { ok: false };
  }

  let removedParams = 0;
  if (protocol === 'http:' || protocol === 'https:') {
    const params = resolved.searchParams;
    const trackerParamNames = context.trackerParamNames || DEFAULT_TRACKING_PARAM_NAMES;
    for (const key of Array.from(params.keys())) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith('utm_') || trackerParamNames.has(lowerKey)) {
        const occurrences = params.getAll(key).length || 1;
        removedParams += occurrences;
        params.delete(key);
      }
    }
  }

  if (record) {
    context.diagnostics.linkFixes += 1;
    if (removedParams > 0) {
      context.diagnostics.trackerParamsRemoved += removedParams;
    }
  }

  const value = protocol === 'http:' || protocol === 'https:' ? resolved.toString() : trimmed;
  return { ok: true, value, protocol, removedParams, urlObject: resolved };
};

const selectBestMediaResource = (resources, context) => {
  if (!Array.isArray(resources) || resources.length === 0) {
    return null;
  }
  let best = null;
  for (const resource of resources) {
    if (!resource || typeof resource !== 'object') {
      continue;
    }
    const normalized = normalizeUrlValue(resource.url, context, {
      allowedSchemes: new Set(['http', 'https']),
      record: false,
    });
    if (!normalized.ok || !isLikelyImageUrl(normalized.urlObject)) {
      continue;
    }
    const width = Number.isFinite(resource.width)
      ? resource.width
      : Number.parseInt(resource.width, 10);
    const height = Number.isFinite(resource.height)
      ? resource.height
      : Number.parseInt(resource.height, 10);
    const area = Number.isFinite(width) && Number.isFinite(height) ? width * height : 0;
    if (!best || area > best.area) {
      best = { normalizedUrl: normalized.value, area };
    }
  }
  return best;
};

const selectMainImageCandidate = (normalized, context) => {
  const media = normalized?.media;
  if (!media || typeof media !== 'object') {
    return null;
  }

  const mediaContent = selectBestMediaResource(media.mediaContent, context);
  if (mediaContent) {
    return { source: 'media:content', normalizedUrl: mediaContent.normalizedUrl };
  }

  const mediaThumbnail = selectBestMediaResource(media.mediaThumbnail, context);
  if (mediaThumbnail) {
    return { source: 'thumbnail', normalizedUrl: mediaThumbnail.normalizedUrl };
  }

  const enclosure = media.enclosureImage;
  if (enclosure && typeof enclosure === 'object') {
    const type = typeof enclosure.type === 'string' ? enclosure.type.toLowerCase() : '';
    if (!type || type.startsWith('image/')) {
      const normalized = normalizeUrlValue(enclosure.url, context, {
        allowedSchemes: new Set(['http', 'https']),
        record: false,
      });
      if (normalized.ok && isLikelyImageUrl(normalized.urlObject)) {
        return { source: 'enclosure', normalizedUrl: normalized.value };
      }
    }
  }

  return null;
};

const createDiagnostics = () => ({
  imageSource: 'none',
  removedEmbeds: 0,
  linkFixes: 0,
  trackerParamsRemoved: 0,
  truncated: false,
  keptEmbedsHosts: [],
});

const createSanitizeContext = (baseUrls, diagnostics, options, trackerParamNames) => ({
  baseUrls,
  diagnostics,
  options,
  expectedTopImageUrl: null,
  sanitizedTopImageUrl: null,
  inlineImageCandidate: null,
  keptEmbedsHosts: new Set(),
  trackerParamNames,
});

const createDescriptor = ({ type, tagName = null, html = '', textContent = '', attributes = null }) => ({
  type,
  tagName,
  html,
  textContent,
  attributes,
});

const sanitizeChildren = (nodes, context) => {
  const result = [];
  for (const node of nodes) {
    const sanitized = sanitizeNode(node, context);
    if (sanitized.length > 0) {
      result.push(...sanitized);
    }
  }
  return result;
};

const sanitizeNode = (node, context) => {
  if (!node) {
    return [];
  }
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = node.rawText ?? '';
    if (!text) {
      return [];
    }
    return [
      createDescriptor({
        type: 'text',
        html: text,
        textContent: node.text ?? text,
      }),
    ];
  }
  if (node.nodeType === NodeType.COMMENT_NODE) {
    return [];
  }
  if (node.nodeType === NodeType.ELEMENT_NODE) {
    return sanitizeElement(node, context);
  }
  return [];
};

const hasClass = (node, className) => {
  const classAttr = node.getAttribute('class');
  if (typeof classAttr !== 'string') {
    return false;
  }
  return classAttr
    .split(/\s+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(className);
};

const sanitizeElement = (node, context) => {
  const tagName = node.rawTagName ? node.rawTagName.toLowerCase() : '';
  if (!tagName) {
    return sanitizeChildren(node.childNodes, context);
  }

  if (context.options.stripKnownBoilerplates && hasClass(node, 'outpost-pub-container')) {
    return [];
  }

  if (tagName === 'iframe') {
    return sanitizeIframe(node, context);
  }

  if (DROP_CONTENT_TAGS.has(tagName)) {
    return [];
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    return sanitizeChildren(node.childNodes, context);
  }

  if (tagName === 'a') {
    return sanitizeAnchor(node, context);
  }
  if (tagName === 'img') {
    return sanitizeImage(node, context);
  }
  if (tagName === 'br') {
    return [createDescriptor({ type: 'element', tagName: 'br', html: '<br>', textContent: '' })];
  }
  if (tagName === 'hr') {
    return [createDescriptor({ type: 'element', tagName: 'hr', html: '<hr>', textContent: '' })];
  }

  return sanitizeGenericElement(node, context, tagName);
};

const sanitizeAnchor = (node, context) => {
  const hrefRaw = node.getAttribute('href');
  const normalized = normalizeUrlValue(hrefRaw, context, {
    allowedSchemes: new Set(['http', 'https', 'mailto']),
  });
  if (!normalized.ok) {
    return sanitizeChildren(node.childNodes, context);
  }

  const children = sanitizeChildren(node.childNodes, context);
  const textContent = children.map((child) => child.textContent).join('');
  const attrs = [];
  const attributesObject = {};
  attrs.push(`href="${escapeHtml(normalized.value)}"`);
  attributesObject.href = normalized.value;

  const classValue = sanitizeClassValue(node.getAttribute('class'));
  if (classValue) {
    attrs.push(`class="${escapeHtml(classValue)}"`);
    attributesObject.class = classValue;
  }

  const titleValue = node.getAttribute('title');
  if (typeof titleValue === 'string' && titleValue.trim()) {
    attrs.push(`title="${escapeHtml(titleValue.trim())}"`);
    attributesObject.title = titleValue.trim();
  }

  if (normalized.protocol === 'http:' || normalized.protocol === 'https:') {
    attrs.push('target="_blank"');
    attrs.push('rel="noopener noreferrer"');
    attributesObject.target = '_blank';
    attributesObject.rel = 'noopener noreferrer';
  }

  const innerHtml = children.map((child) => child.html).join('');
  const html = `<a ${attrs.join(' ')}>${innerHtml}</a>`;
  return [
    createDescriptor({
      type: 'element',
      tagName: 'a',
      html,
      textContent,
      attributes: attributesObject,
    }),
  ];
};

const sanitizeImage = (node, context) => {
  const srcRaw = node.getAttribute('src');
  const normalized = normalizeUrlValue(srcRaw, context, {
    allowedSchemes: new Set(['http', 'https']),
  });
  if (!normalized.ok || !isLikelyImageUrl(normalized.urlObject)) {
    return [];
  }

  const attrs = [];
  const attributesObject = {};
  attrs.push(`src="${escapeHtml(normalized.value)}"`);
  attributesObject.src = normalized.value;

  const classValue = sanitizeClassValue(node.getAttribute('class'));
  if (classValue) {
    attrs.push(`class="${escapeHtml(classValue)}"`);
    attributesObject.class = classValue;
  }

  const altAttr = node.getAttribute('alt');
  if (typeof altAttr === 'string') {
    attrs.push(`alt="${escapeHtml(altAttr)}"`);
    attributesObject.alt = altAttr;
  } else {
    attrs.push('alt=""');
    attributesObject.alt = '';
  }

  const titleAttr = node.getAttribute('title');
  if (typeof titleAttr === 'string' && titleAttr.trim()) {
    attrs.push(`title="${escapeHtml(titleAttr.trim())}"`);
    attributesObject.title = titleAttr.trim();
  }

  const widthAttr = node.getAttribute('width');
  if (typeof widthAttr === 'string') {
    const normalizedWidth = Number.parseInt(widthAttr, 10);
    if (Number.isFinite(normalizedWidth) && normalizedWidth > 0) {
      attrs.push(`width="${normalizedWidth}"`);
      attributesObject.width = String(normalizedWidth);
    }
  }

  const heightAttr = node.getAttribute('height');
  if (typeof heightAttr === 'string') {
    const normalizedHeight = Number.parseInt(heightAttr, 10);
    if (Number.isFinite(normalizedHeight) && normalizedHeight > 0) {
      attrs.push(`height="${normalizedHeight}"`);
      attributesObject.height = String(normalizedHeight);
    }
  }

  attrs.push('loading="lazy"');
  attrs.push('decoding="async"');
  attributesObject.loading = 'lazy';
  attributesObject.decoding = 'async';

  const html = `<img ${attrs.join(' ')}>`;

  if (context.expectedTopImageUrl && normalized.value === context.expectedTopImageUrl) {
    context.sanitizedTopImageUrl = normalized.value;
  }
  if (!context.inlineImageCandidate && normalized.value !== context.expectedTopImageUrl) {
    context.inlineImageCandidate = normalized.value;
  }

  return [
    createDescriptor({ type: 'element', tagName: 'img', html, textContent: '', attributes: attributesObject }),
  ];
};

const sanitizeGenericElement = (node, context, tagName) => {
  const children = sanitizeChildren(node.childNodes, context);
  const innerHtml = children.map((child) => child.html).join('');
  const textContent = children.map((child) => child.textContent).join('');

  const attrs = [];
  const attributesObject = {};
  const classValue = sanitizeClassValue(node.getAttribute('class'));
  if (classValue) {
    attrs.push(`class="${escapeHtml(classValue)}"`);
    attributesObject.class = classValue;
  }

  const attrString = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  const closing = VOID_TAGS.has(tagName) ? '' : `</${tagName}>`;
  const html = `<${tagName}${attrString}>${innerHtml}${closing}`;

  return [
    createDescriptor({
      type: 'element',
      tagName,
      html,
      textContent,
      attributes: attributesObject,
    }),
  ];
};

const sanitizeIframe = (node, context) => {
  const { options, diagnostics } = context;
  if (!options.keepEmbeds) {
    diagnostics.removedEmbeds += 1;
    return [];
  }
  const srcRaw = node.getAttribute('src');
  const normalized = normalizeUrlValue(srcRaw, context, {
    allowedSchemes: new Set(['https']),
  });
  if (!normalized.ok) {
    diagnostics.removedEmbeds += 1;
    return [];
  }

  const host = normalized.urlObject.hostname.toLowerCase();
  if (!options.allowedIframeHosts.includes(host)) {
    diagnostics.removedEmbeds += 1;
    return [];
  }

  context.keptEmbedsHosts.add(host);

  const attrs = [`src="${escapeHtml(normalized.value)}"`, 'loading="lazy"', 'allowfullscreen'];
  const attributesObject = { src: normalized.value, loading: 'lazy', allowfullscreen: '' };

  const classValue = sanitizeClassValue(node.getAttribute('class'));
  if (classValue) {
    attrs.push(`class="${escapeHtml(classValue)}"`);
    attributesObject.class = classValue;
  }

  const titleAttr = node.getAttribute('title');
  if (typeof titleAttr === 'string' && titleAttr.trim()) {
    attrs.push(`title="${escapeHtml(titleAttr.trim())}"`);
    attributesObject.title = titleAttr.trim();
  }

  const widthAttr = node.getAttribute('width');
  if (typeof widthAttr === 'string') {
    const normalizedWidth = Number.parseInt(widthAttr, 10);
    if (Number.isFinite(normalizedWidth) && normalizedWidth > 0) {
      attrs.push(`width="${normalizedWidth}"`);
      attributesObject.width = String(normalizedWidth);
    }
  }

  const heightAttr = node.getAttribute('height');
  if (typeof heightAttr === 'string') {
    const normalizedHeight = Number.parseInt(heightAttr, 10);
    if (Number.isFinite(normalizedHeight) && normalizedHeight > 0) {
      attrs.push(`height="${normalizedHeight}"`);
      attributesObject.height = String(normalizedHeight);
    }
  }

  const html = `<iframe ${attrs.join(' ')}></iframe>`;
  return [
    createDescriptor({
      type: 'element',
      tagName: 'iframe',
      html,
      textContent: '',
      attributes: attributesObject,
    }),
  ];
};

const stripTrailingWhitespace = (nodes) => {
  while (nodes.length > 0) {
    const last = nodes[nodes.length - 1];
    if (last.type === 'text' && !last.textContent.trim()) {
      nodes.pop();
      continue;
    }
    break;
  }
};

const isIsolatedReadMoreParagraph = (node) => {
  if (node.type !== 'element' || node.tagName !== 'p') {
    return false;
  }
  const rawText = node.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalized = rawText.replace(/[.!?…›»→-]+$/g, '').trim();
  return READ_MORE_PHRASES.has(normalized);
};

const stripBoilerplateParagraphs = (nodes) => {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (isIsolatedReadMoreParagraph(nodes[index])) {
      nodes.splice(index, 1);
    }
  }
  stripTrailingWhitespace(nodes);
};

const sanitizeFragment = (html, context) => {
  if (!html) {
    return { html: '', nodes: [] };
  }
  const root = parse(html, { comment: true });
  const nodes = sanitizeChildren(root.childNodes, context);
  if (context.options.stripKnownBoilerplates) {
    stripBoilerplateParagraphs(nodes);
  }
  const serialized = nodes.map((node) => node.html).join('\n').trim();
  return { html: serialized, nodes };
};

const truncateHtmlIfNeeded = (html, maxHtmlKB, diagnostics) => {
  if (!html) {
    return { html, truncated: false };
  }
  const limitKb = Number.isFinite(maxHtmlKB) && maxHtmlKB > 0 ? maxHtmlKB : DEFAULT_OPTIONS.maxHtmlKB;
  const limitBytes = Math.floor(limitKb * 1024);
  const htmlBuffer = Buffer.from(html, 'utf8');
  if (htmlBuffer.length <= limitBytes) {
    return { html, truncated: false };
  }

  const truncatedBuffer = htmlBuffer.subarray(0, limitBytes);
  let truncatedHtml = truncatedBuffer.toString('utf8');
  const closingTags = ['</p>', '</figure>', '</ul>', '</ol>', '</pre>', '</code>', '</blockquote>', '</h1>', '</h2>', '</h3>', '</li>'];
  let cutIndex = -1;
  for (const closing of closingTags) {
    const index = truncatedHtml.lastIndexOf(closing);
    if (index > cutIndex) {
      cutIndex = index + closing.length;
    }
  }
  if (cutIndex > -1) {
    truncatedHtml = truncatedHtml.slice(0, cutIndex);
  }
  truncatedHtml = truncatedHtml.trimEnd();
  const notice = '<p><em>Conteúdo truncado.</em></p>';
  diagnostics.truncated = true;
  return { html: `${truncatedHtml}${truncatedHtml ? '\n' : ''}${notice}`, truncated: true };
};

const generateExcerptText = (nodes, maxChars) => {
  if (!nodes || nodes.length === 0) {
    return '';
  }
  const parts = [];
  for (const node of nodes) {
    if (node.type === 'element') {
      if (node.tagName === 'figure') {
        continue;
      }
      const classValue = node.attributes?.class ?? '';
      const hasMetaClass = classValue
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .some((entry) => entry.startsWith('article-meta'));
      if (hasMetaClass) {
        continue;
      }
    }
    const text = node.textContent;
    if (typeof text === 'string' && text.trim()) {
      parts.push(text);
    }
  }
  if (parts.length === 0) {
    return '';
  }
  const combined = parts.join(' ');
  const normalized = he
    .decode(combined)
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : DEFAULT_OPTIONS.excerptMaxChars;
  if (normalized.length <= limit) {
    return normalized;
  }
  let truncated = normalized.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > Math.floor(limit * 0.6)) {
    truncated = truncated.slice(0, lastSpace);
  }
  return `${truncated.trimEnd()}…`;
};

const buildMetaHtml = (normalized) => {
  const metaParts = [];
  if (normalized?.author) {
    metaParts.push(
      `<p class="article-meta article-meta-author"><strong>Autor:</strong> ${escapeHtml(normalized.author)}</p>`,
    );
  }
  if (normalized?.publishedAtISO) {
    metaParts.push(
      `<p class="article-meta article-meta-date"><strong>Publicado:</strong> ${escapeHtml(normalized.publishedAtISO)}</p>`,
    );
  }
  if (normalized?.canonicalUrl) {
    metaParts.push(
      `<p class="article-meta article-meta-source"><strong>Fonte:</strong> <a href="${escapeHtml(
        normalized.canonicalUrl,
      )}">${escapeHtml(normalized.canonicalUrl)}</a></p>`,
    );
  }
  if (Array.isArray(normalized?.categories) && normalized.categories.length > 0) {
    metaParts.push(
      `<p class="article-meta article-meta-tags"><strong>Tags:</strong> ${escapeHtml(
        normalized.categories.join(', '),
      )}</p>`,
    );
  }
  return metaParts.join('\n');
};

const buildBaseHtml = (normalized, contentChoice, imageCandidate, options) => {
  const segments = [];
  const leadHtml = addLeadClass(contentChoice.leadHtmlRaw);
  if (leadHtml) {
    segments.push(leadHtml);
  }
  if (options.injectTopImage && imageCandidate?.normalizedUrl) {
    segments.push(`<figure><img src="${imageCandidate.normalizedUrl}" alt=""></figure>`);
  }
  if (typeof contentChoice.bodyHtmlRaw === 'string' && contentChoice.bodyHtmlRaw.trim()) {
    segments.push(contentChoice.bodyHtmlRaw);
  }
  const metaHtml = buildMetaHtml(normalized);
  if (metaHtml) {
    segments.push(metaHtml);
  }
  return segments.join('\n');
};

/**
 * Builds sanitized article HTML, selects a main image candidate and generates
 * a text excerpt suitable for feed cards.
 *
 * @param {object} normalized - Normalized feed item produced by the feed normalizer.
 * @param {{ bodyHtmlRaw: string, leadHtmlRaw?: string | null }} contentChoice -
 *   Result from the body/lead selector containing the chosen raw HTML fragments.
 * @param {object} [options]
 * @param {boolean} [options.keepEmbeds=false] - Keep safe iframe embeds for whitelisted hosts.
 * @param {string[]} [options.allowedIframeHosts=[]] - Hosts allowed when keepEmbeds is enabled.
 * @param {boolean} [options.injectTopImage=true] - Inject main image at the top of the article.
 * @param {number} [options.excerptMaxChars=220] - Maximum number of characters for the excerpt.
 * @param {number} [options.maxHtmlKB=150] - Maximum HTML size in kilobytes before truncation.
 * @param {boolean} [options.stripKnownBoilerplates=true] - Remove known boilerplate blocks.
 * @param {string[]} [options.trackerParamsRemoveList] - Overrides default tracker parameters removal list.
 * @returns {{
 *   articleHtml: string,
 *   mainImageUrl: string | undefined,
 *   excerpt: string,
 *   diagnostics: {
 *     imageSource: string,
 *     removedEmbeds: number,
 *     linkFixes: number,
 *     trackerParamsRemoved: number,
 *     truncated: boolean,
 *     keptEmbedsHosts: string[],
 *   },
 * }}
 */
const assembleArticle = (normalized, contentChoice, options = {}) => {
  if (!normalized || typeof normalized !== 'object') {
    throw new TypeError('normalized must be an object');
  }
  if (!contentChoice || typeof contentChoice !== 'object') {
    throw new TypeError('contentChoice must be an object');
  }

  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  mergedOptions.allowedIframeHosts = normalizeAllowedHosts(mergedOptions.allowedIframeHosts);
  const trackerParamNames = buildTrackerParamNames(mergedOptions.trackerParamsRemoveList);

  const diagnostics = createDiagnostics();
  const baseUrls = computeBaseUrls(normalized);
  const sanitizeContext = createSanitizeContext(baseUrls, diagnostics, mergedOptions, trackerParamNames);

  const imageCandidate = selectMainImageCandidate(normalized, sanitizeContext);
  if (imageCandidate?.normalizedUrl) {
    diagnostics.imageSource = imageCandidate.source;
    if (mergedOptions.injectTopImage) {
      sanitizeContext.expectedTopImageUrl = imageCandidate.normalizedUrl;
    }
  }

  const baseHtml = buildBaseHtml(normalized, contentChoice, imageCandidate, mergedOptions);
  const sanitized = sanitizeFragment(baseHtml, sanitizeContext);
  let articleHtml = sanitized.html;

  const truncation = truncateHtmlIfNeeded(articleHtml, mergedOptions.maxHtmlKB, diagnostics);
  articleHtml = truncation.html;

  const excerpt = generateExcerptText(sanitized.nodes, mergedOptions.excerptMaxChars);

  let mainImageUrl = imageCandidate?.normalizedUrl;
  if (!mainImageUrl && sanitizeContext.inlineImageCandidate) {
    mainImageUrl = sanitizeContext.inlineImageCandidate;
    diagnostics.imageSource = 'inline';
  }
  if (!mainImageUrl) {
    diagnostics.imageSource = 'none';
  }

  diagnostics.keptEmbedsHosts = Array.from(sanitizeContext.keptEmbedsHosts);

  return {
    articleHtml,
    mainImageUrl: mainImageUrl ?? undefined,
    excerpt,
    diagnostics,
  };
};

module.exports = {
  assembleArticle,
};
