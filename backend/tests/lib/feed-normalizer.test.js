const fs = require('node:fs');
const path = require('node:path');

const { XMLParser } = require('fast-xml-parser');

const { normalizeFeedItem } = require('../../src/lib/feed-normalizer');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: false,
  parseTagValue: false,
});

const loadFixture = (name) =>
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');

const getFirstItem = (parsed) => {
  if (parsed.rss?.channel?.item) {
    return Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item[0]
      : parsed.rss.channel.item;
  }
  if (parsed.channel?.item) {
    return Array.isArray(parsed.channel.item) ? parsed.channel.item[0] : parsed.channel.item;
  }
  if (parsed.feed?.entry) {
    return Array.isArray(parsed.feed.entry) ? parsed.feed.entry[0] : parsed.feed.entry;
  }
  if (parsed.entry) {
    return Array.isArray(parsed.entry) ? parsed.entry[0] : parsed.entry;
  }
  throw new Error('Unable to locate first feed item in fixture');
};

describe('normalizeFeedItem', () => {
  it('normalizes a 404 Media RSS item with media content and metadata', () => {
    const xml = loadFixture('rss-404media.xml');
    const parsed = parser.parse(xml);
    const item = getFirstItem(parsed);

    const normalized = normalizeFeedItem(item, {
      feedUrl: 'https://www.404media.co/rss/',
    });

    expect(normalized.title).toBe('Inside the "Example" Conspiracy');
    expect(normalized.canonicalUrl).toBe('https://www.404media.co/inside-the-example-conspiracy/');
    expect(normalized.publishedAtISO).toBe('2025-01-01');
    expect(normalized.author).toBe('404 Media Team');
    expect(normalized.categories).toEqual(['Investigations', 'Technology']);
    expect(normalized.rawHtmlCandidates.contentEncoded).toContain('The long-form story body.');
    expect(normalized.rawHtmlCandidates.descriptionOrSummary).toContain('A short summary');
    expect(normalized.media).toBeDefined();
    expect(normalized.media.mediaContent[0]).toEqual({
      url: 'https://static.404media.co/images/story-main.jpg',
      width: 1600,
      height: 900,
    });
    expect(normalized.media.mediaThumbnail[0]).toEqual({
      url: 'https://static.404media.co/images/story-thumb.jpg',
      width: 800,
      height: 450,
    });
    expect(normalized.guid).toBe('tag:404media.co,2025-01-01:/inside-the-example-conspiracy');
    expect(normalized.isPermaLink).toBe(false);
    expect(normalized.sourceFeed).toEqual({ url: 'https://www.404media.co/rss/' });
  });

  it('keeps enclosure image and author details for Substack RSS feeds', () => {
    const xml = loadFixture('rss-substack.xml');
    const parsed = parser.parse(xml);
    const item = getFirstItem(parsed);

    const normalized = normalizeFeedItem(item);

    expect(normalized.rawHtmlCandidates.contentEncoded).toContain('Hello readers!');
    expect(normalized.media.enclosureImage).toEqual({
      url: 'https://substackcdn.com/image.jpg',
      type: 'image/jpeg',
    });
    expect(normalized.author).toBe('Sebastian Raschka');
    expect(normalized.categories).toEqual(['Data Science']);
    expect(normalized.publishedAtISO).toBe('2025-02-03');
  });

  it('prefers alternate link and summary fields for Atom entries', () => {
    const xml = loadFixture('atom-example.xml');
    const parsed = parser.parse(xml);
    const item = getFirstItem(parsed);

    const normalized = normalizeFeedItem(item);

    expect(normalized.canonicalUrl).toBe('https://example.com/orbital-mechanics-explained');
    expect(normalized.rawHtmlCandidates.descriptionOrSummary).toBe('<p>Learn about orbits.</p>');
    expect(normalized.rawHtmlCandidates.content).toContain('Full article body');
    expect(normalized.media.inlineImages).toContain('https://example.com/images/orbit.png');
    expect(normalized.publishedAtISO).toBe('2025-02-09');
  });

  it('extracts inline images from WordPress RSS feeds', () => {
    const xml = loadFixture('rss-wordpress.xml');
    const parsed = parser.parse(xml);
    const item = getFirstItem(parsed);

    const normalized = normalizeFeedItem(item);

    expect(normalized.rawHtmlCandidates.contentEncoded).toContain('<img src="https://blog.cloudflare.com/images/launch.png"');
    expect(normalized.media.inlineImages).toEqual(['https://blog.cloudflare.com/images/launch.png']);
    expect(normalized.guid).toBe('https://blog.cloudflare.com/?p=123456');
    expect(normalized.isPermaLink).toBe(false);
  });
});
