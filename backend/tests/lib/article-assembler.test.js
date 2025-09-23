const fs = require('node:fs');
const path = require('node:path');

const { XMLParser } = require('fast-xml-parser');

const { normalizeFeedItem } = require('../../src/lib/feed-normalizer');
const { selectBodyAndLead } = require('../../src/lib/body-lead-selector');
const { assembleArticle } = require('../../src/lib/article-assembler');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: false,
  parseTagValue: false,
});

const loadFixture = (name) =>
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');

const parseFirstItem = (xml) => {
  const parsed = parser.parse(xml);
  if (parsed.rss?.channel?.item) {
    return Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item[0]
      : parsed.rss.channel.item;
  }
  if (parsed['rdf:RDF']?.item) {
    return Array.isArray(parsed['rdf:RDF'].item)
      ? parsed['rdf:RDF'].item[0]
      : parsed['rdf:RDF'].item;
  }
  if (parsed.feed?.entry) {
    return Array.isArray(parsed.feed.entry) ? parsed.feed.entry[0] : parsed.feed.entry;
  }
  throw new Error('Unable to locate item in fixture');
};

describe('assembleArticle', () => {
  it('builds sanitized html with media hero metadata', () => {
    const xml = loadFixture('rss-404media.xml');
    const item = parseFirstItem(xml);
    const normalized = normalizeFeedItem(item, { feedUrl: 'https://www.404media.co/rss/' });
    const bodySelection = selectBodyAndLead(normalized);

    const result = assembleArticle(normalized, bodySelection);

    expect(result.articleHtml).toContain('<p class="lead">A short summary for the story.</p>');
    expect(result.articleHtml).toContain(
      '<figure><img src="https://static.404media.co/images/story-main.jpg"',
    );
    expect(result.articleHtml).toContain('loading="lazy"');
    expect(result.articleHtml).toContain('decoding="async"');
    expect(result.articleHtml).toContain(
      '<a href="https://www.404media.co/inside-the-example-conspiracy/" target="_blank" rel="noopener noreferrer">',
    );

    expect(result.mainImageUrl).toBe('https://static.404media.co/images/story-main.jpg');
    expect(result.excerpt).toBe('A short summary for the story. The long-form story body.');
    expect(result.diagnostics.imageSource).toBe('media:content');
    expect(result.diagnostics.removedEmbeds).toBe(0);
    expect(result.diagnostics.trackerParamsRemoved).toBe(0);
  });

  it('removes iframe embeds by default', () => {
    const normalized = {
      canonicalUrl: 'https://example.com/post',
      rawHtmlCandidates: {},
    };
    const choice = {
      bodyHtmlRaw:
        '<p>Audio episode</p><iframe src="https://playlist.megaphone.fm/episode?utm_source=rss"></iframe>',
      leadHtmlRaw: null,
    };

    const result = assembleArticle(normalized, choice);

    expect(result.articleHtml).not.toContain('<iframe');
    expect(result.diagnostics.removedEmbeds).toBe(1);
    expect(result.diagnostics.keptEmbedsHosts).toEqual([]);
  });

  it('keeps whitelisted iframe embeds when enabled', () => {
    const normalized = {
      canonicalUrl: 'https://example.com/post',
      rawHtmlCandidates: {},
    };
    const choice = {
      bodyHtmlRaw:
        '<p>Audio episode</p><iframe src="https://playlist.megaphone.fm/episode?utm_source=rss"></iframe>',
      leadHtmlRaw: null,
    };

    const result = assembleArticle(normalized, choice, {
      keepEmbeds: true,
      allowedIframeHosts: ['playlist.megaphone.fm'],
    });

    expect(result.articleHtml).toContain(
      '<iframe src="https://playlist.megaphone.fm/episode" loading="lazy" allowfullscreen',
    );
    expect(result.diagnostics.removedEmbeds).toBe(0);
    expect(result.diagnostics.keptEmbedsHosts).toEqual(['playlist.megaphone.fm']);
    expect(result.diagnostics.trackerParamsRemoved).toBe(1);
  });

  it('normalizes inline links and images when no media metadata exists', () => {
    const normalized = {
      canonicalUrl: 'https://example.com/post?utm_source=rss',
      sourceFeed: { url: 'https://example.com/feed?utm_medium=rss' },
      categories: ['Updates'],
      rawHtmlCandidates: {},
    };
    const choice = {
      leadHtmlRaw: 'Lead text',
      bodyHtmlRaw:
        '<p>Intro paragraph with a <a href="/relative?utm_campaign=news&ref=link" style="color:red" onclick="alert(1)">Go</a>.</p>' +
        '<p><img src="/images/photo.png?utm_medium=rss" alt="Photo"></p>' +
        '<div class="outpost-pub-container"><p>Promoted</p></div>' +
        '<p>Read more</p>',
    };

    const result = assembleArticle(normalized, choice, { injectTopImage: false });

    expect(result.articleHtml).toContain(
      '<a href="https://example.com/relative" target="_blank" rel="noopener noreferrer">Go</a>',
    );
    expect(result.articleHtml).toContain('<p class="lead">Lead text</p>');
    expect(result.articleHtml).toContain('<img src="https://example.com/images/photo.png"');
    expect(result.articleHtml).not.toContain('outpost-pub-container');
    expect(result.articleHtml).not.toMatch(/Read more/i);
    expect(result.articleHtml).not.toContain('onclick');
    expect(result.articleHtml).not.toContain('style=');

    expect(result.mainImageUrl).toBe('https://example.com/images/photo.png');
    expect(result.diagnostics.imageSource).toBe('inline');
    expect(result.diagnostics.trackerParamsRemoved).toBe(4);
    expect(result.diagnostics.linkFixes).toBe(3);
    expect(result.excerpt).toBe('Lead text Intro paragraph with a Go.');
  });

  it('prefers enclosure image when available', () => {
    const xml = loadFixture('rss-substack.xml');
    const item = parseFirstItem(xml);
    const normalized = normalizeFeedItem(item);
    const bodySelection = selectBodyAndLead(normalized);

    const result = assembleArticle(normalized, bodySelection);

    expect(result.mainImageUrl).toBe('https://substackcdn.com/image.jpg');
    expect(result.articleHtml).toContain('<figure><img src="https://substackcdn.com/image.jpg"');
    expect(result.diagnostics.imageSource).toBe('enclosure');
  });

  it('truncates very large html payloads and marks diagnostics', () => {
    const normalized = {
      canonicalUrl: 'https://example.com/big',
      rawHtmlCandidates: {},
    };
    const choice = {
      leadHtmlRaw: null,
      bodyHtmlRaw: '<p>' + 'Long text '.repeat(5000) + '</p>',
    };

    const result = assembleArticle(normalized, choice, { maxHtmlKB: 1 });

    expect(result.diagnostics.truncated).toBe(true);
    expect(result.articleHtml).toContain('<p><em>Conteúdo truncado.</em></p>');
  });

  it('respects excerpt length configuration', () => {
    const normalized = {
      canonicalUrl: 'https://example.com/custom',
      rawHtmlCandidates: {},
    };
    const choice = {
      leadHtmlRaw: 'Lead text for excerpt sizing',
      bodyHtmlRaw: '<p>' + 'Body content '.repeat(40) + '</p>',
    };

    const result = assembleArticle(normalized, choice, { excerptMaxChars: 80 });

    expect(result.excerpt.length).toBeLessThanOrEqual(81);
    expect(result.excerpt.endsWith('…')).toBe(true);
  });
});
