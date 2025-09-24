const he = require('he');

const SOURCE_PRIORITY = ['contentEncoded', 'content', 'descriptionOrSummary'];
const BLOCK_TAG_REGEX = /<(p|div|img|h1|h2|h3|ul|ol|li|figure|pre|code|blockquote)\b/i;
const PARAGRAPH_REGEX = /<(p|figure)\b[^>]*>/gi;
const HTML_LIKE_REGEX = /<\/?[a-z][^>]*>/i;
const TAG_OR_ENTITY_REGEX = /(<[^>]+>|&[a-z0-9#]+;)/gi;
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const BODY_SIZE_LIMIT = 150 * 1024; // 150 KB approx.
const LEAD_TEXT_LIMIT = 400;

const BLOCK_CLOSING_TAGS = ['</p>', '</div>', '</section>', '</article>', '</li>', '</ul>', '</ol>', '</figure>', '</pre>', '</code>', '</blockquote>'];

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const looksLikeHtml = (value) => HTML_LIKE_REGEX.test(value);

const wrapPlainText = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return `<p>${trimmed}</p>`;
};

const removeTrivialBoilerplate = (html) => {
  let result = html;

  result = result.replaceAll(
    /<div[^>]*class="[^"]*\boutpost-pub-container\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    '',
  );

  result = result.replaceAll(
    /(?:\s*<p[^>]*>\s*(?:<a[^>]*>\s*)?(?:read more|continue reading)[^<]*?(?:<\/a>)?\s*<\/p>\s*)+$/gim,
    '',
  );

  return result;
};

const countParagraphs = (html) => {
  const matches = html.match(PARAGRAPH_REGEX);
  return matches ? matches.length : 0;
};

const hasBlockTags = (html) => BLOCK_TAG_REGEX.test(html);

const computeLengthScore = (length) => Math.min(0.3, length * 0.0005);

const computeContentScore = ({ hasBlocks, length, paragraphCount }) => {
  const blockScore = hasBlocks ? 0.4 : 0;
  const lengthScore = length > 0 ? computeLengthScore(length) : 0;
  const paragraphScore = paragraphCount >= 2 ? 0.3 : 0;
  return Math.min(1, blockScore + lengthScore + paragraphScore);
};

const tokenizeHtml = (html) => {
  const tokens = [];
  let lastIndex = 0;
  let match;

  while ((match = TAG_OR_ENTITY_REGEX.exec(html)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: html.slice(lastIndex, match.index) });
    }

    const token = match[0];
    if (token.startsWith('<')) {
      tokens.push({ type: 'tag', value: token });
    } else {
      tokens.push({ type: 'entity', value: token });
    }

    lastIndex = TAG_OR_ENTITY_REGEX.lastIndex;
  }

  if (lastIndex < html.length) {
    tokens.push({ type: 'text', value: html.slice(lastIndex) });
  }

  return tokens;
};

const updateTagStack = (tag, stack) => {
  const tagNameMatch = tag.match(/^<\/?\s*([a-z0-9:-]+)/i);
  if (!tagNameMatch) {
    return;
  }

  const tagName = tagNameMatch[1].toLowerCase();
  if (tag.startsWith('</')) {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i] === tagName) {
        stack.splice(i, 1);
        break;
      }
    }
    return;
  }

  if (VOID_TAGS.has(tagName)) {
    return;
  }

  if (tag.endsWith('/>')) {
    return;
  }

  stack.push(tagName);
};

const closeOpenTags = (html) => {
  const tokens = tokenizeHtml(html);
  const stack = [];

  for (const token of tokens) {
    if (token.type === 'tag') {
      updateTagStack(token.value, stack);
    }
  }

  if (stack.length === 0) {
    return html;
  }

  let closed = html;
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    closed += `</${stack[i]}>`;
  }
  return closed;
};

const truncateHtmlByTextLength = (html, limit) => {
  if (!html) {
    return { html: '', truncated: false };
  }

  const tokens = tokenizeHtml(html);
  let length = 0;
  let truncated = false;
  let result = '';
  const stack = [];

  outer: for (const token of tokens) {
    if (token.type === 'tag') {
      result += token.value;
      updateTagStack(token.value, stack);
      continue;
    }

    if (token.type === 'entity') {
      if (length >= limit) {
        truncated = true;
        break;
      }
      result += token.value;
      length += 1;
      continue;
    }

    const chars = Array.from(token.value);
    for (const char of chars) {
      if (length >= limit) {
        truncated = true;
        break outer;
      }
      result += char;
      length += 1;
    }
  }

  if (!truncated) {
    return { html, truncated: false };
  }

  result = result.replaceAll(/\s+$/g, '');
  result += '…';

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    result += `</${stack[i]}>`;
  }

  return { html: result, truncated: true };
};

const truncateBodyHtml = (html) => {
  if (!html || html.length <= BODY_SIZE_LIMIT) {
    return { html, truncated: false };
  }

  let cutIndex = -1;
  for (const closing of BLOCK_CLOSING_TAGS) {
    const idx = html.lastIndexOf(closing, BODY_SIZE_LIMIT);
    if (idx !== -1) {
      const candidate = idx + closing.length;
      if (candidate > cutIndex) {
        cutIndex = candidate;
      }
    }
  }

  if (cutIndex === -1) {
    cutIndex = BODY_SIZE_LIMIT;
  }

  let sliced = html.slice(0, cutIndex);

  const partial = sliced.match(/<[^>]*$/);
  if (partial && !partial[0].includes('>')) {
    sliced = sliced.slice(0, partial.index);
  }

  return { html: closeOpenTags(sliced), truncated: true };
};

const normalizeForComparison = (html) => {
  if (!html) {
    return '';
  }
  const withoutTags = html.replaceAll(/<[^>]*>/g, ' ');
  const decoded = he.decode(withoutTags, { isAttributeValue: false });
  return decoded.replaceAll(/\s+/g, ' ').trim().toLowerCase();
};

const computeDedupeRatio = (a, b) => {
  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
};

const addReason = (reasons, reason) => {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
};

const evaluateCandidate = (source, value) => {
  if (!isNonEmptyString(value)) {
    return null;
  }

  let processed = value;
  const trimmedOriginal = processed.trim();
  let usedPlainTextWrapper = false;

  if (!looksLikeHtml(trimmedOriginal)) {
    processed = wrapPlainText(trimmedOriginal);
    usedPlainTextWrapper = true;
  }

  const cleaned = removeTrivialBoilerplate(processed);
  const trimmed = cleaned.trim();
  if (!trimmed) {
    return null;
  }

  const hasBlocks = hasBlockTags(trimmed);
  const paragraphCount = countParagraphs(trimmed);
  const length = trimmed.length;
  const contentScore = computeContentScore({ hasBlocks, length, paragraphCount });
  const isSubstantial = hasBlocks || length > 300 || paragraphCount >= 2;

  return {
    source,
    html: trimmed,
    metrics: {
      hasBlocks,
      paragraphCount,
      length,
      contentScore,
      isSubstantial,
    },
    usedPlainTextWrapper,
    removedBoilerplate: cleaned !== processed,
  };
};

/**
 * Selects the best raw HTML body and optional lead from normalized feed candidates.
 *
 * @param {object} normalizedItem - Normalized feed item.
 * @param {object} normalizedItem.rawHtmlCandidates - Available raw HTML candidates.
 * @returns {{ bodyHtmlRaw: string, leadHtmlRaw: string | null, diagnostics: { chosenSource: 'contentEncoded' | 'content' | 'descriptionOrSummary' | 'empty', contentScore: number, leadUsed: boolean, dedupeRatio: number, reasons: string[] }}}
 */
const selectBodyAndLead = (normalizedItem) => {
  if (!normalizedItem || typeof normalizedItem !== 'object') {
    throw new TypeError('normalizedItem must be an object');
  }

  const candidates = normalizedItem.rawHtmlCandidates || {};
  const evaluated = {};
  const reasons = [];

  let chosen = null;
  let chosenSource = 'empty';
  let fallback = null;

  for (const source of SOURCE_PRIORITY) {
    const value = candidates[source];
    const evaluation = evaluateCandidate(source, value);
    if (!evaluation) {
      continue;
    }

    evaluated[source] = evaluation;

    if (!fallback || evaluation.metrics.length > fallback.metrics.length) {
      fallback = evaluation;
    }

    if (!chosen && evaluation.metrics.isSubstantial) {
      chosen = evaluation;
      chosenSource = source;
    }
  }

  if (!chosen && fallback) {
    chosen = fallback;
    chosenSource = fallback.source;
    addReason(reasons, 'fallback-largest');
  }

  let bodyHtmlRaw = '';
  let contentScore = 0;

  if (chosen) {
    bodyHtmlRaw = chosen.html;
    contentScore = chosen.metrics.contentScore;

    if (chosen.metrics.hasBlocks) {
      addReason(reasons, 'has-block-tags');
    }
    if (chosen.metrics.length > 300) {
      addReason(reasons, 'length>300');
    }
    if (chosen.metrics.paragraphCount >= 2) {
      addReason(reasons, 'p-count>=2');
    }
    if (chosen.usedPlainTextWrapper) {
      addReason(reasons, 'wrapped-plaintext');
    }
    if (chosen.removedBoilerplate) {
      addReason(reasons, 'boilerplate-removed');
    }
  }

  const bodyTruncation = truncateBodyHtml(bodyHtmlRaw);
  if (bodyTruncation.truncated) {
    bodyHtmlRaw = bodyTruncation.html;
    addReason(reasons, 'truncated-150kb');
  }

  let leadHtmlRaw = null;
  let leadUsed = false;
  let dedupeRatio = 0;

  const descriptionCandidate = evaluated.descriptionOrSummary;
  if (descriptionCandidate && chosenSource !== 'descriptionOrSummary') {
    let leadCandidateHtml = descriptionCandidate.html;

    const normalizedBody = normalizeForComparison(bodyHtmlRaw);
    const normalizedLead = normalizeForComparison(leadCandidateHtml);
    dedupeRatio = computeDedupeRatio(normalizedBody, normalizedLead);

    if (dedupeRatio >= 0.9) {
      addReason(reasons, 'description-similar-omitted');
    } else {
      const truncatedLead = truncateHtmlByTextLength(leadCandidateHtml, LEAD_TEXT_LIMIT);
      leadCandidateHtml = truncatedLead.html.trim();
      if (truncatedLead.truncated) {
        addReason(reasons, 'lead-truncated-400');
      }

      leadHtmlRaw = leadCandidateHtml;
      leadUsed = true;
    }
  } else if (!descriptionCandidate) {
    dedupeRatio = 0;
  }

  if (!leadUsed) {
    leadHtmlRaw = null;
  }

  return {
    bodyHtmlRaw,
    leadHtmlRaw,
    diagnostics: {
      chosenSource,
      contentScore,
      leadUsed,
      dedupeRatio,
      reasons,
    },
  };
};

module.exports = {
  selectBodyAndLead,
};

