type ParsedRoot = {
  body: HTMLElement;
};

const FOOTER_CLASS_KEYWORDS = ['fonte', 'tags', 'meta'];
const MIN_EXCERPT_LENGTH = 160;
const TARGET_EXCERPT_LENGTH = 220;
const MAX_EXCERPT_LENGTH = 240;

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const resolveImageUrl = (src: string | null, baseUrl?: string): string | undefined => {
  if (!src) {
    return undefined;
  }

  const trimmed = src.trim();
  if (!trimmed) {
    return undefined;
  }

  if (isHttpUrl(trimmed)) {
    return trimmed;
  }

  if (!baseUrl) {
    return undefined;
  }

  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
      return resolved.toString();
    }
  } catch {
    // ignore resolution errors
  }

  return undefined;
};

const parseHtml = (html: string): ParsedRoot | null => {
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(html, 'text/html');
      const hasParserError = parsed.querySelector('parsererror');
      if (!hasParserError && parsed.body) {
        return { body: parsed.body };
      }
    } catch {
      // fall through to template fallback
    }
  }

  if (typeof document !== 'undefined' && document.implementation?.createHTMLDocument) {
    const doc = document.implementation.createHTMLDocument('preview');
    doc.body.innerHTML = html;
    return { body: doc.body };
  }

  if (typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.innerHTML = html;
    return { body: container };
  }

  return null;
};

const removeFooterElements = (root: HTMLElement) => {
  const selectors = FOOTER_CLASS_KEYWORDS.map((keyword) => `[class*="${keyword}"]`).join(',');
  if (selectors) {
    const elements = root.querySelectorAll(selectors);
    for (const element of elements) {
      if (element instanceof HTMLElement) {
        element.remove();
      }
    }
  }

  const footers = root.querySelectorAll('footer');
  for (const element of footers) {
    element.remove();
  }
};

const sanitizeRoot = (root: HTMLElement) => {
  const removable = root.querySelectorAll('script, style, noscript');
  for (const element of removable) {
    element.remove();
  }
  removeFooterElements(root);
};

const normalizeWhitespace = (value: string) => value.replaceAll(/\s+/g, ' ').trim();

const findTruncationPoint = (text: string, preferred: number, fallback: number) => {
  const clamp = (limit: number) => {
    const candidate = text.slice(0, limit + 1);
    const lastWhitespace = candidate.lastIndexOf(' ');
    return lastWhitespace > 0 ? lastWhitespace : -1;
  };

  const preferredIndex = clamp(preferred);
  if (preferredIndex >= MIN_EXCERPT_LENGTH) {
    return preferredIndex;
  }

  const fallbackIndex = clamp(fallback);
  if (fallbackIndex >= MIN_EXCERPT_LENGTH) {
    return fallbackIndex;
  }

  return Math.max(preferred, MIN_EXCERPT_LENGTH);
};

const buildExcerpt = (text: string) => {
  if (!text) {
    return '';
  }

  if (text.length <= MAX_EXCERPT_LENGTH) {
    return text;
  }

  const cutoff = findTruncationPoint(text, TARGET_EXCERPT_LENGTH, MAX_EXCERPT_LENGTH);
  const truncated = text.slice(0, cutoff).trimEnd();
  return `${truncated}…`;
};

const extractFirstParagraph = (root: HTMLElement) => {
  const paragraphs = Array.from(root.querySelectorAll<HTMLParagraphElement>('p'));
  for (const paragraph of paragraphs) {
    const text = normalizeWhitespace(paragraph.textContent ?? '');
    if (text) {
      return text;
    }
  }
  return undefined;
};

export const extractArticlePreview = (
  html: string,
  baseUrl?: string,
): { imageUrl?: string; excerpt: string; firstParagraph?: string } => {
  const parsed = parseHtml(html);

  if (!parsed?.body) {
    return { excerpt: normalizeWhitespace(html) };
  }

  sanitizeRoot(parsed.body);

  const images = Array.from(parsed.body.querySelectorAll<HTMLImageElement>('img'));
  let imageUrl: string | undefined;
  for (const image of images) {
    imageUrl = resolveImageUrl(image.getAttribute('src'), baseUrl);
    if (imageUrl) {
      break;
    }
  }

  const rawText = normalizeWhitespace(parsed.body.textContent ?? '');
  const excerpt = buildExcerpt(rawText);
  const firstParagraph = extractFirstParagraph(parsed.body);

  return {
    imageUrl,
    excerpt,
    firstParagraph,
  };
};

export type ArticlePreview = ReturnType<typeof extractArticlePreview>;

