const BLOCK_TAG_REGEX = /<(p|div|img|h1|h2|h3|ul|ol|li|figure|pre|code|blockquote)\b/i;
const ESCAPED_BLOCK_TAG_REGEX = /&(lt|#60);\/?(p|div|img|h1|h2|h3|ul|ol|li|figure|pre|code|blockquote)/i;

const ensureString = (value) => (typeof value === 'string' ? value : '');

const hasBlockTags = (html) => BLOCK_TAG_REGEX.test(ensureString(html));

const looksEscapedHtml = (html) => ESCAPED_BLOCK_TAG_REGEX.test(ensureString(html));

const collapseWhitespace = (value) => value.replaceAll(/\s+/g, ' ').trim();

const computeWeakContent = ({ html }) => {
  const content = ensureString(html);
  const normalized = collapseWhitespace(content);
  const length = normalized.length;
  const containsBlocks = hasBlockTags(content);
  return {
    length,
    containsBlocks,
    weak: length < 300 || !containsBlocks,
  };
};

const buildPreview = (html, maxLength = 300) => {
  if (typeof html !== 'string' || maxLength <= 0) {
    return '';
  }
  if (html.length <= maxLength) {
    return html;
  }
  return html.slice(0, maxLength);
};

module.exports = {
  hasBlockTags,
  looksEscapedHtml,
  computeWeakContent,
  buildPreview,
};
