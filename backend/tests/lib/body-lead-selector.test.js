const fs = require('node:fs');
const path = require('node:path');

const { XMLParser } = require('fast-xml-parser');

const { selectBodyAndLead } = require('../../src/lib/body-lead-selector');
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

const normalizeFixture = (fixtureName) => {
  const xml = loadFixture(fixtureName);
  const parsed = parser.parse(xml);
  const item = getFirstItem(parsed);
  return normalizeFeedItem(item);
};

describe('selectBodyAndLead', () => {
  it('selects content:encoded body and uses summary lead for Ghost/WordPress feeds', () => {
    const normalized = normalizeFixture('rss-404media.xml');

    const result = selectBodyAndLead(normalized);

    expect(result.bodyHtmlRaw).toContain('The long-form story body.');
    expect(result.leadHtmlRaw).toBe('<p>A short summary for the story.</p>');
    expect(result.diagnostics.chosenSource).toBe('contentEncoded');
    expect(result.diagnostics.contentScore).toBeGreaterThan(0.7);
    expect(result.diagnostics.leadUsed).toBe(true);
    expect(result.diagnostics.dedupeRatio).toBeLessThan(0.9);
    expect(result.diagnostics.reasons).toContain('has-block-tags');
  });

  it('keeps Substack descriptions as lead when different from body', () => {
    const normalized = normalizeFixture('rss-substack.xml');

    const result = selectBodyAndLead(normalized);

    expect(result.bodyHtmlRaw).toContain('<p>Hello readers!</p>');
    expect(result.leadHtmlRaw).toBe('<p>Short intro &amp; highlights.</p>');
    expect(result.diagnostics.chosenSource).toBe('contentEncoded');
    expect(result.diagnostics.leadUsed).toBe(true);
    expect(result.diagnostics.dedupeRatio).toBeLessThan(0.5);
  });

  it('prefers Atom content HTML and keeps summary as lead', () => {
    const normalized = normalizeFixture('atom-example.xml');

    const result = selectBodyAndLead(normalized);

    expect(result.bodyHtmlRaw).toContain('Full article body');
    expect(result.leadHtmlRaw).toBe('<p>Learn about orbits.</p>');
    expect(result.diagnostics.chosenSource).toBe('content');
    expect(result.diagnostics.leadUsed).toBe(true);
  });

  it('wraps plaintext Atom content in a paragraph and uses summary lead', () => {
    const normalized = normalizeFixture('atom-text.xml');

    const result = selectBodyAndLead(normalized);

    expect(result.bodyHtmlRaw).toBe('<p>Status update without HTML tags</p>');
    expect(result.leadHtmlRaw).toBe('<p>Short status summary</p>');
    expect(result.diagnostics.chosenSource).toBe('content');
    expect(result.diagnostics.reasons).toContain('wrapped-plaintext');
  });

  it('falls back to summary when no substantial body is available', () => {
    const normalized = normalizeFixture('rss-minimal.xml');

    const result = selectBodyAndLead(normalized);

    expect(result.bodyHtmlRaw).toBe('<p>Just a short entry.</p>');
    expect(result.leadHtmlRaw).toBeNull();
    expect(result.diagnostics.chosenSource).toBe('descriptionOrSummary');
    expect(result.diagnostics.leadUsed).toBe(false);
    expect(result.diagnostics.reasons).toContain('wrapped-plaintext');
  });

  it('deduplicates summary when identical to the body', () => {
    const normalized = normalizeFixture('rss-wordpress.xml');

    const result = selectBodyAndLead(normalized);

    expect(result.bodyHtmlRaw).toContain('Launch day!');
    expect(result.leadHtmlRaw).toBeNull();
    expect(result.diagnostics.leadUsed).toBe(false);
    expect(result.diagnostics.dedupeRatio).toBeGreaterThanOrEqual(0.9);
    expect(result.diagnostics.reasons).toContain('description-similar-omitted');
  });

  it('truncates very large bodies and records diagnostics', () => {
    const paragraph = `<p>${'A'.repeat(1024)}</p>`;
    const hugeBody = paragraph.repeat(200);

    const result = selectBodyAndLead({
      rawHtmlCandidates: {
        contentEncoded: hugeBody,
      },
    });

    expect(result.bodyHtmlRaw.length).toBeLessThanOrEqual(150 * 1024);
    expect(result.leadHtmlRaw).toBeNull();
    expect(result.diagnostics.chosenSource).toBe('contentEncoded');
    expect(result.diagnostics.reasons).toContain('truncated-150kb');
  });

  it('limits very long leads to 400 characters and appends ellipsis', () => {
    const description = `<p>${'b'.repeat(450)}</p>`;

    const result = selectBodyAndLead({
      rawHtmlCandidates: {
        contentEncoded: '<p>Body content stays full.</p>',
        descriptionOrSummary: description,
      },
    });

    expect(result.leadHtmlRaw).toMatch(/^<p>b{400}…<\/p>$/);
    expect(result.diagnostics.leadUsed).toBe(true);
    expect(result.diagnostics.reasons).toContain('lead-truncated-400');
  });
});
