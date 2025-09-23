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
  if (parsed['rdf:RDF']?.item) {
    return Array.isArray(parsed['rdf:RDF'].item)
      ? parsed['rdf:RDF'].item[0]
      : parsed['rdf:RDF'].item;
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

  it('normalizes RSS 1.0/RDF items with encoded content, media and rdf identifiers', () => {
    const xml = loadFixture('rdf-complete.xml');
    const parsed = parser.parse(xml);
    const item = getFirstItem(parsed);

    const normalized = normalizeFeedItem(item, { feedUrl: 'https://example.com/rdf/feed' });

    expect(normalized.title).toBe('Mission Update from Orbit');
    expect(normalized.canonicalUrl).toBe('https://example.com/rdf/articles/mission-update');
    expect(normalized.publishedAtISO).toBe('2024-03-15');
    expect(normalized.author).toBe('Commander Jane Doe');
    expect(normalized.categories).toEqual(['Space', 'Exploration']);
    expect(normalized.rawHtmlCandidates.contentEncoded).toContain('nominal operations aboard the station');
    expect(normalized.rawHtmlCandidates.descriptionOrSummary).toContain('Highlights from the latest orbital mission.');
    expect(normalized.media.mediaContent[0]).toEqual({
      url: 'https://cdn.example.com/videos/update.mp4',
      width: 1920,
      height: 1080,
    });
    expect(normalized.media.mediaThumbnail[0]).toEqual({
      url: 'https://cdn.example.com/images/thumb.jpg',
      width: 640,
      height: 360,
    });
    expect(normalized.media.inlineImages).toEqual(['https://cdn.example.com/images/station.jpg']);
    expect(normalized.guid).toBe('https://example.com/rdf/articles/mission-update');
    expect(normalized.sourceFeed).toEqual({ url: 'https://example.com/rdf/feed' });
  });

  it('falls back to description when RSS 1.0/RDF items omit encoded content', () => {
    const xml = loadFixture('rdf-minimal.xml');
    const parsed = parser.parse(xml);
    const item = getFirstItem(parsed);

    const normalized = normalizeFeedItem(item, { feedUrl: 'https://news.example.org/feed' });

    expect(normalized.title).toBe('Brief Update');
    expect(normalized.canonicalUrl).toBe('https://news.example.org/posts/brief-update');
    expect(normalized.publishedAtISO).toBe('2024-04-01');
    expect(normalized.author).toBe('News Desk');
    expect(normalized.categories).toEqual(['Updates', 'Community']);
    expect(normalized.rawHtmlCandidates.contentEncoded).toBeUndefined();
    expect(normalized.rawHtmlCandidates.descriptionOrSummary).toBe('A short update on community events.');
    expect(normalized.media).toBeUndefined();
    expect(normalized.guid).toBe('https://news.example.org/posts/brief-update');
    expect(normalized.sourceFeed).toEqual({ url: 'https://news.example.org/feed' });
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
