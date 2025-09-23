const fs = require('node:fs');
const path = require('node:path');
const promClient = require('prom-client');

const { refreshUserFeeds } = require('../src/services/posts.service');
const { prisma } = require('../src/lib/prisma');
const config = require('../src/config');
const rssMetrics = require('../src/services/rss-metrics');
const ingestionDiagnostics = require('../src/services/ingestion-diagnostics');

const loadFixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

const buildFetchMock = (body) =>
  jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: jest.fn().mockResolvedValue(body),
  });

const createFeed = ({ ownerKey = '1', url = 'https://example.com/feed.xml', lastFetchedAt = null } = {}) =>
  prisma.feed.create({ data: { ownerKey, url, lastFetchedAt } });

const getMetricValue = async (name, labels = {}) => {
  const metric = promClient.register.getSingleMetric(name);
  if (!metric || typeof metric.get !== 'function') {
    return 0;
  }

  const data = await metric.get();
  if (!data || !Array.isArray(data.values)) {
    return 0;
  }

  const serialized = JSON.stringify(labels ?? {});
  const match = data.values.find((entry) => JSON.stringify(entry.labels ?? {}) === serialized);
  return match && typeof match.value === 'number' ? match.value : 0;
};

describe('RSS ingestion end-to-end', () => {
  beforeEach(() => {
    prisma.__reset();
    rssMetrics.resetMetrics();
    ingestionDiagnostics.reset();
    Object.assign(config.rss, {
      keepEmbeds: false,
      allowedIframeHosts: [],
      injectTopImage: true,
      excerptMaxChars: 220,
      maxHtmlKB: 150,
      stripKnownBoilerplates: true,
      reprocessPolicy: 'if-empty-or-changed',
      logLevel: 'info',
      trackerParamsRemoveList: null,
    });
  });

  it('sanitizes a 404 Media style feed and prefers media:content images', async () => {
    const feed = await createFeed({ url: 'https://www.404media.co/rss/' });
    const fetcher = buildFetchMock(loadFixture('rss-404media.xml'));
    const now = new Date('2025-01-02T10:00:00Z');

    const result = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

    expect(result.results[0].articlesCreated).toBe(1);
    const [article] = await prisma.article.findMany();
    expect(article.articleHtml).toContain('The long-form story body.');
    expect(article.articleHtml).toContain('class="lead"');
    expect(article.articleHtml).toContain('https://static.404media.co/images/story-main.jpg');
    expect(article.articleHtml).not.toContain('<iframe');

    const diagnostics = ingestionDiagnostics.getRecent({ feedId: feed.id });
    expect(diagnostics).toHaveLength(1);
    const diag = diagnostics[0];
    expect(diag.chosenSource).toBe('contentEncoded');
    expect(diag.articleHtmlLength).toBeGreaterThan(diag.rawDescriptionLength);
    expect(diag.hasBlockTags).toBe(true);
    expect(diag.looksEscapedHtml).toBe(false);
    expect(diag.weakContent).toBe(false);

    expect(await getMetricValue('rss_image_source_total', { source: 'media:content' })).toBe(1);
  });

  it('removes boilerplates and tracker params for Substack feeds by default', async () => {
    const feed = await createFeed({ url: 'https://newsletter.example.com/rss' });
    const fetcher = buildFetchMock(loadFixture('rss-substack.xml'));
    const now = new Date('2025-02-05T08:00:00Z');

    const summary = await refreshUserFeeds({ ownerKey: '1', now, fetcher });
    expect(summary.results[0].articlesCreated).toBe(1);

    const [article] = await prisma.article.findMany();
    expect(article.articleHtml).toContain('Hello readers!');
    expect(article.articleHtml).not.toContain('outpost-promo');
    expect(article.articleHtml).not.toMatch(/utm_/i);
    expect(article.articleHtml).toMatch(/custom=trackme/);
    expect(article.articleHtml).not.toContain('<iframe');
    expect(article.articleHtml).toMatch(/rel="noopener noreferrer"/);

    const [substackDiag] = ingestionDiagnostics.getRecent({ feedId: feed.id });
    expect(substackDiag).toBeDefined();
    expect(substackDiag.chosenSource).not.toBe('descriptionOrSummary');
    expect(substackDiag.hasBlockTags).toBe(true);
    expect(substackDiag.looksEscapedHtml).toBe(false);

    expect(await getMetricValue('rss_tracker_params_removed_total')).toBeGreaterThan(0);
  });

  it('keeps whitelisted embeds when configured', async () => {
    Object.assign(config.rss, {
      keepEmbeds: true,
      allowedIframeHosts: ['open.spotify.com'],
      trackerParamsRemoveList: ['custom'],
    });
    const feed = await createFeed({ url: 'https://newsletter.example.com/rss' });
    const fetcher = buildFetchMock(loadFixture('rss-substack.xml'));

    const result = await refreshUserFeeds({ ownerKey: '1', now: new Date('2025-02-05T09:00:00Z'), fetcher });
    expect(result.results[0].articlesCreated).toBe(1);

    const [article] = await prisma.article.findMany();
    expect(article.articleHtml).toContain('open.spotify.com/embed/episode/12345');
    expect(article.articleHtml).not.toMatch(/custom=trackme/);
  });

  it('renders Atom HTML entries and preserves inline images', async () => {
    const feed = await createFeed({ url: 'https://example.com/atom.xml' });
    const fetcher = buildFetchMock(loadFixture('atom-example.xml'));

    await refreshUserFeeds({ ownerKey: '1', now: new Date('2025-02-11T08:00:00Z'), fetcher });

    const [article] = await prisma.article.findMany();
    expect(article.articleHtml).toContain('Full article body');
    expect(article.articleHtml).toContain('https://example.com/images/orbit.png');
  });

  it('wraps Atom text entries in paragraphs', async () => {
    const feed = await createFeed({ url: 'https://example.com/status.xml' });
    const fetcher = buildFetchMock(loadFixture('atom-text.xml'));

    await refreshUserFeeds({ ownerKey: '1', now: new Date('2025-02-11T09:00:00Z'), fetcher });

    const [article] = await prisma.article.findMany();
    expect(article.articleHtml).toContain('Short status summary');
    expect(article.articleHtml).toContain('Status update without HTML tags');
  });

  it('handles minimal RSS feeds with description only', async () => {
    const feed = await createFeed({ url: 'https://example.com/minimal.xml' });
    const fetcher = buildFetchMock(loadFixture('rss-minimal.xml'));

    await refreshUserFeeds({ ownerKey: '1', now: new Date('2025-03-07T12:30:00Z'), fetcher });

    const [article] = await prisma.article.findMany();
    expect(article.articleHtml).toContain('Just a short entry.');
    const [minimalDiag] = ingestionDiagnostics.getRecent({ feedId: feed.id });
    expect(minimalDiag).toBeDefined();
    expect(minimalDiag.weakContent).toBe(true);
    expect(minimalDiag.articleHtmlLength).toBeLessThan(600);
    expect(minimalDiag.looksEscapedHtml).toBe(false);
    expect(await getMetricValue('rss_image_source_total', { source: 'none' })).toBe(1);
  });

  it('truncates overly long content and appends a truncation notice', async () => {
    const feed = await createFeed({ url: 'https://example.com/huge.xml' });
    const fetcher = buildFetchMock(loadFixture('rss-large.xml'));

    await refreshUserFeeds({ ownerKey: '1', now: new Date('2025-02-06T12:00:00Z'), fetcher });

    const [article] = await prisma.article.findMany();
    expect(article.articleHtml.length).toBeLessThanOrEqual(config.rss.maxHtmlKB * 1024);
    expect(article.articleHtml).toContain('Conteúdo truncado');
    expect(await getMetricValue('rss_truncated_html_total', { truncated: 'true' })).toBe(1);
  });

  it('skips overwriting articles when reprocess policy is set to never', async () => {
    config.rss.reprocessPolicy = 'never';
    const feed = await createFeed({ url: 'https://example.com/policy.xml' });
    const fixtureA = loadFixture('rss-minimal.xml');
    const fixtureB = fixtureA.replace('Just a short entry.', 'Updated entry content.');
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: jest.fn().mockResolvedValue(fixtureA) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: jest.fn().mockResolvedValue(fixtureB) });

    const firstSummary = await refreshUserFeeds({ ownerKey: '1', now: new Date('2025-03-07T12:30:00Z'), fetcher });
    expect(firstSummary.results[0].articlesCreated).toBe(1);

    const [initial] = await prisma.article.findMany();
    expect(initial.articleHtml).toContain('Just a short entry.');

    const secondSummary = await refreshUserFeeds({ ownerKey: '1', now: new Date('2025-03-08T09:00:00Z'), fetcher });
    expect(secondSummary.results[0].articlesCreated).toBe(0);

    const [article] = await prisma.article.findMany();
    expect(article.articleHtml).toContain('Just a short entry.');
    expect(article.articleHtml).not.toContain('Updated entry content.');
    expect(await getMetricValue('rss_items_skipped', { policy: 'never' })).toBeGreaterThanOrEqual(1);
  });

  it('updates stored HTML when content changes under if-empty-or-changed policy', async () => {
    config.rss.reprocessPolicy = 'if-empty-or-changed';
    const feed = await createFeed({ url: 'https://example.com/update.xml' });
    const fixtureA = loadFixture('rss-minimal.xml');
    const fixtureB = fixtureA.replace('Just a short entry.', 'A brand new entry body.');
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: jest.fn().mockResolvedValue(fixtureA) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: jest.fn().mockResolvedValue(fixtureB) });

    const firstSummary = await refreshUserFeeds({ ownerKey: '1', now: new Date('2025-03-07T12:30:00Z'), fetcher });
    expect(firstSummary.results[0].articlesCreated).toBe(1);

    const [initial] = await prisma.article.findMany();
    expect(initial.articleHtml).toContain('Just a short entry.');

    const secondSummary = await refreshUserFeeds({
      ownerKey: '1',
      now: new Date('2025-03-08T10:00:00Z'),
      fetcher,
    });
    expect(secondSummary.results[0].articlesCreated).toBe(0);

    const [updated] = await prisma.article.findMany();
    expect(updated.articleHtml).toContain('A brand new entry body.');
  });
});
