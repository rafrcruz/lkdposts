const {
  refreshUserFeeds,
  cleanupOldArticles,
  listRecentArticles,
  InvalidCursorError,
  constants: postsConstants,
} = require('../src/services/posts.service');
const { prisma } = require('../src/lib/prisma');
const rssMetrics = require('../src/services/rss-metrics');
const config = require('../src/config');
const ingestionDiagnostics = require('../src/services/ingestion-diagnostics');
const appParamsService = require('../src/services/app-params.service');

const toRssDate = (date) => new Date(date).toUTCString();

const buildRss = (items) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Example</title>${items.join('')}</channel></rss>`;

const makeRssItem = ({
  title,
  guid,
  link,
  description = 'Sample description',
  publishedAt,
}) => {
  const parts = [`<title>${title}</title>`, `<description>${description}</description>`, `<pubDate>${toRssDate(publishedAt)}</pubDate>`];
  if (guid !== undefined) {
    parts.push(`<guid>${guid}</guid>`);
  }
  if (link !== undefined) {
    parts.push(`<link>${link}</link>`);
  }
  return `<item>${parts.join('')}</item>`;
};

const buildFetchResponse = (body, { ok = true, status } = {}) => ({
  ok,
  status: status ?? (ok ? 200 : 500),
  text: jest.fn().mockResolvedValue(body),
});

const createFetchMock = (responsesByUrl) =>
  jest.fn(async function fetchMock(url) {
    if (!responsesByUrl.has(url)) {
      throw new Error(`Unexpected URL requested: ${url}`);
    }

    const entry = responsesByUrl.get(url);

    if (entry instanceof Error) {
      throw entry;
    }

    if (entry && entry.reject) {
      throw entry.reject;
    }

    const ok = entry?.ok ?? true;
    const status = entry?.status ?? (ok ? 200 : 500);
    const body = entry?.body ?? entry;

    return buildFetchResponse(body, { ok, status });
  });

const createAbortableFetchMock = () =>
  jest.fn(function abortableFetch(url, { signal }) {
    return new Promise(function executor(resolve, reject) {
      function handleAbort() {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      }

      signal.addEventListener('abort', handleAbort, { once: true });
    });
  });

const createDeferredFetchMock = (body) => {
  const response = buildFetchResponse(body);
  let release;

  const fetchPromise = new Promise(function executor(resolve) {
    release = function complete() {
      resolve(response);
    };
  });

  const fetcher = jest.fn(function deferredFetch() {
    return fetchPromise;
  });

  return { fetcher, release };
};

function waitForImmediate() {
  return new Promise(function executor(resolve) {
    setImmediate(resolve);
  });
}

const createFeed = async ({ ownerKey = '1', url = 'https://example.com/feed.xml', lastFetchedAt = null }) =>
  prisma.feed.create({ data: { ownerKey, url, lastFetchedAt } });

describe('posts.service', () => {
  beforeEach(async () => {
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
    await appParamsService.ensureDefaultAppParams();
  });

  describe('refreshUserFeeds', () => {
    it('skips feeds that are still within the cooldown window', async () => {
      const now = new Date('2025-03-01T12:00:00Z');
      const recent = new Date(now.getTime() - 30 * 60 * 1000);
      const feed = await createFeed({ lastFetchedAt: recent });
      const fetcher = jest.fn();

      const result = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      expect(fetcher).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual(
        expect.objectContaining({
          feedId: feed.id,
          skippedByCooldown: true,
          articlesCreated: 0,
        })
      );
      expect(result.results[0].cooldownSecondsRemaining).toBe(1800);

      const updatedFeed = await prisma.feed.findUnique({ where: { id: feed.id } });
      expect(updatedFeed.lastFetchedAt).toEqual(recent);
    });

    it('fetches feeds outside the cooldown window and updates lastFetchedAt', async () => {
      const now = new Date('2025-03-01T12:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-28T00:00:00Z') });
      const fetcher = createFetchMock(
        new Map([[feed.url, buildRss([makeRssItem({ title: 'New', guid: 'guid-1', publishedAt: now })])]])
      );

      const result = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result.results[0]).toEqual(
        expect.objectContaining({
          feedId: feed.id,
          skippedByCooldown: false,
          articlesCreated: 1,
          itemsWithinWindow: 1,
        })
      );

      const updatedFeed = await prisma.feed.findUnique({ where: { id: feed.id } });
      expect(updatedFeed.lastFetchedAt?.toISOString()).toBe(now.toISOString());

    const storedArticles = await prisma.article.findMany();
    expect(storedArticles).toHaveLength(1);
    expect(storedArticles[0].articleHtml).toMatch(/<p>Sample description/);
  });

    it('respects custom cooldown seconds from app parameters', async () => {
      await appParamsService.updateAppParams({
        updates: { posts_refresh_cooldown_seconds: 600 },
        updatedBy: 'tester',
      });

      const now = new Date('2025-03-01T12:00:00Z');
      const recent = new Date(now.getTime() - 2 * 60 * 1000);
      const feed = await createFeed({ lastFetchedAt: recent });
      const fetcher = jest.fn();

      const result = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      expect(fetcher).not.toHaveBeenCalled();
      expect(result.results[0]).toEqual(
        expect.objectContaining({
          feedId: feed.id,
          skippedByCooldown: true,
          cooldownSecondsRemaining: 480,
        }),
      );
    });

    it('ignores items published outside the 7-day window', async () => {
      const now = new Date('2025-03-08T12:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-20T00:00:00Z') });
      const oldDate = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
      const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const rss = buildRss([
        makeRssItem({ title: 'Old', guid: 'g-old', publishedAt: oldDate }),
        makeRssItem({ title: 'Recent', guid: 'g-recent', publishedAt: recentDate }),
      ]);

      const fetcher = createFetchMock(new Map([[feed.url, rss]]));

      const summary = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          articlesCreated: 1,
          itemsWithinWindow: 1,
        })
      );

      const storedArticles = await prisma.article.findMany();
      expect(storedArticles).toHaveLength(1);
      expect(storedArticles[0].title).toBe('Recent');
      expect(storedArticles[0].articleHtml).toContain(recentDate.toISOString().slice(0, 10));
    });

    it('uses the configured time window from app parameters', async () => {
      await appParamsService.updateAppParams({
        updates: { posts_time_window_days: 2 },
        updatedBy: 'tester',
      });

      const now = new Date('2025-03-08T12:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-03-05T00:00:00Z') });
      const insideWindow = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
      const outsideWindow = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      const rss = buildRss([
        makeRssItem({ title: 'Inside Window', guid: 'inside-guid', publishedAt: insideWindow }),
        makeRssItem({ title: 'Outside Window', guid: 'outside-guid', publishedAt: outsideWindow }),
      ]);

      const fetcher = createFetchMock(new Map([[feed.url, rss]]));

      const summary = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      expect(summary.results[0]).toEqual(
        expect.objectContaining({
          articlesCreated: 1,
          itemsWithinWindow: 1,
        }),
      );

      const storedArticles = await prisma.article.findMany();
      expect(storedArticles).toHaveLength(1);
      expect(storedArticles[0].title).toBe('Inside Window');
    });

    it('reports summary indicators for read, windowed, duplicate and invalid items', async () => {
      const now = new Date('2025-03-09T10:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-20T00:00:00Z') });

      const uniqueItem = makeRssItem({ title: 'Fresh', guid: 'fresh-guid', publishedAt: now });
      const duplicateOriginal = makeRssItem({
        title: 'Primary duplicate',
        guid: 'dup-guid',
        publishedAt: new Date(now.getTime() - 60 * 1000),
      });
      const duplicateCopy = makeRssItem({
        title: 'Secondary duplicate',
        guid: 'dup-guid',
        publishedAt: new Date(now.getTime() - 30 * 1000),
      });
      const oldDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const outsideWindow = makeRssItem({ title: 'Too Old', guid: 'old-guid', publishedAt: oldDate });
      const invalidItem = '<item><title>Invalid</title></item>';

      const rss = buildRss([uniqueItem, duplicateOriginal, duplicateCopy, outsideWindow, invalidItem]);
      const fetcher = createFetchMock(new Map([[feed.url, rss]]));

      const result = await refreshUserFeeds({ ownerKey: '1', now, fetcher });
      const summary = result.results[0];

      expect(summary.itemsRead).toBe(5);
      expect(summary.itemsWithinWindow).toBe(3);
      expect(summary.articlesCreated).toBe(2);
      expect(summary.duplicates).toBe(1);
      expect(summary.invalidItems).toBe(1);

      const articles = await prisma.article.findMany({ where: { feedId: feed.id } });
      expect(articles).toHaveLength(2);
      expect(articles.some((article) => article.guid === 'fresh-guid')).toBe(true);
      expect(articles.some((article) => article.guid === 'dup-guid')).toBe(true);
      for (const article of articles) {
        expect(article.articleHtml).toMatch(/<p>/);
      }
    });

    it('is idempotent for items that provide guid values', async () => {
      const now = new Date('2025-03-01T12:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const rss = buildRss([makeRssItem({ title: 'Guid', guid: 'item-guid', publishedAt: now })]);
      const fetcher = createFetchMock(new Map([[feed.url, rss]]));

      const firstRun = await refreshUserFeeds({ ownerKey: '1', now, fetcher });
      const secondRun = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      expect(firstRun.results[0].articlesCreated).toBe(1);
      expect(secondRun.results[0].articlesCreated).toBe(0);
      const articles = await prisma.article.findMany();
      const posts = await prisma.post.findMany();
      expect(articles).toHaveLength(1);
      expect(posts).toHaveLength(1);
      expect(posts[0].status).toBe('PENDING');
      expect(posts[0].content).toBeNull();
      expect(posts[0].attemptCount).toBe(0);
    });

    it('is idempotent when guid is missing but link is provided', async () => {
      const now = new Date('2025-03-01T13:00:00Z');
      const feed = await createFeed({ url: 'https://example.com/link-feed.xml', lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const rss = buildRss([makeRssItem({ title: 'Link Item', link: 'https://news.example.com/item', publishedAt: now })]);
      const fetcher = createFetchMock(new Map([[feed.url, rss]]));

      await refreshUserFeeds({ ownerKey: '1', now, fetcher });
      const secondRun = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      const articles = await prisma.article.findMany();
      const posts = await prisma.post.findMany();

      expect(articles).toHaveLength(1);
      expect(posts).toHaveLength(1);
      expect(posts[0].status).toBe('PENDING');
      expect(posts[0].content).toBeNull();
      expect(posts[0].attemptCount).toBe(0);
      expect(secondRun.results[0].articlesCreated).toBe(0);
    });

    it('derives a dedupe key when guid and link are missing', async () => {
      const now = new Date('2025-03-02T10:00:00Z');
      const feed = await createFeed({ url: 'https://example.com/derived.xml', lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const rss = buildRss([makeRssItem({ title: 'Derived Item', description: 'Content body', publishedAt: now })]);
      const fetcher = createFetchMock(new Map([[feed.url, rss]]));

      const firstRun = await refreshUserFeeds({ ownerKey: '1', now, fetcher });
      const secondRun = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      const articles = await prisma.article.findMany();
      const posts = await prisma.post.findMany();

      expect(firstRun.results[0].articlesCreated).toBe(1);
      expect(secondRun.results[0].articlesCreated).toBe(0);
      expect(articles).toHaveLength(1);
      expect(posts).toHaveLength(1);
      expect(posts[0].status).toBe('PENDING');
      expect(posts[0].content).toBeNull();
      expect(posts[0].attemptCount).toBe(0);
    });

    it('continues processing other feeds when a fetch fails', async () => {
      const now = new Date('2025-03-03T09:00:00Z');
      const feedA = await createFeed({ url: 'https://example.com/fail.xml', lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const feedB = await createFeed({ url: 'https://example.com/ok.xml', lastFetchedAt: new Date('2025-02-01T00:00:00Z') });

      const rss = buildRss([makeRssItem({ title: 'Success', guid: 'ok-1', publishedAt: now })]);
      const fetcher = createFetchMock(
        new Map([
          [feedA.url, { reject: new Error('Network failure') }],
          [feedB.url, rss],
        ])
      );

      const result = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      const summaryByFeed = new Map(result.results.map((entry) => [entry.feedId, entry]));

      expect(summaryByFeed.get(feedA.id).error).toEqual({ message: 'Network failure' });
      expect(summaryByFeed.get(feedA.id).articlesCreated).toBe(0);

      expect(summaryByFeed.get(feedB.id).error).toBeNull();
      expect(summaryByFeed.get(feedB.id).articlesCreated).toBe(1);

      const articles = await prisma.article.findMany();
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('Success');
      expect(articles[0].articleHtml).toMatch(/<p>/);
    });

    it('counts invalid items that cannot be normalized', async () => {
      const now = new Date('2025-03-04T12:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const invalidRss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Invalid</title><item><title>Missing Date</title></item></channel></rss>`;
      const fetcher = createFetchMock(new Map([[feed.url, invalidRss]]));

      const result = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      expect(result.results[0].invalidItems).toBe(1);
      expect(result.results[0].articlesCreated).toBe(0);

      const articles = await prisma.article.findMany();
      expect(articles).toHaveLength(0);
    });

    it('caps stored title and snippet length to configured limits', async () => {
      const now = new Date('2025-03-05T08:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const longTitle = 'T'.repeat(postsConstants.MAX_ARTICLE_TITLE_LENGTH + 200);
      const longDescription = 'D'.repeat(postsConstants.MAX_ARTICLE_CONTENT_LENGTH + 500);
      const rss = buildRss([
        makeRssItem({
          title: longTitle,
          guid: 'truncate-guid',
          description: longDescription,
          publishedAt: now,
        }),
      ]);

      const fetcher = createFetchMock(new Map([[feed.url, rss]]));
      await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      const [article] = await prisma.article.findMany();
      expect(article).toBeDefined();
      expect(article.title.length).toBeLessThanOrEqual(postsConstants.MAX_ARTICLE_TITLE_LENGTH);
      expect(article.contentSnippet.length).toBeLessThanOrEqual(postsConstants.MAX_ARTICLE_CONTENT_LENGTH);
      expect(article.articleHtml).toMatch(/<p>/);
    });

    it('processes items missing guid, link and title by deriving a fallback dedupe key', async () => {
      const now = new Date('2025-03-05T09:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const rss = buildRss([
        makeRssItem({
          title: '   ',
          description: 'Useful summary of the article',
          publishedAt: now,
        }),
      ]);

      const fetcher = createFetchMock(new Map([[feed.url, rss]]));
      const firstRun = await refreshUserFeeds({ ownerKey: '1', now, fetcher });
      const secondRun = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      expect(firstRun.results[0].articlesCreated).toBe(1);
      expect(secondRun.results[0].articlesCreated).toBe(0);

      const [article] = await prisma.article.findMany();
      expect(article).toBeDefined();
      expect(article.title).toBe('Untitled');
      expect(article.contentSnippet).toBe('Useful summary of the article');
      expect(article.articleHtml).toMatch(/Useful summary of the article/);
    });

    it('handles malformed XML without aborting the refresh routine', async () => {
      const now = new Date('2025-03-05T10:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const fetcher = createFetchMock(new Map([[feed.url, '<']]));

      const result = await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      expect(result.results[0].error).toEqual({ message: 'Failed to parse feed XML' });
      const articles = await prisma.article.findMany();
      expect(articles).toHaveLength(0);
    });

    it('aborts slow fetches using the configured timeout', async () => {
      const now = new Date('2025-03-05T11:00:00Z');
      await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });

      const fetcher = createAbortableFetchMock();

      const result = await refreshUserFeeds({ ownerKey: '1', now, fetcher, timeoutMs: 10 });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result.results[0].error).toEqual({ message: 'Feed request timed out' });
    });

    it('reuses in-flight refreshes for the same owner to avoid duplicate work', async () => {
      const now = new Date('2025-03-05T12:00:00Z');
      await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const rss = buildRss([
        makeRssItem({ title: 'Concurrent', guid: 'concurrent-guid', publishedAt: now }),
      ]);

      const { fetcher, release } = createDeferredFetchMock(rss);

      const firstPromise = refreshUserFeeds({ ownerKey: '1', now, fetcher });
      const secondPromise = refreshUserFeeds({ ownerKey: '1', now, fetcher });

      await waitForImmediate();
      expect(typeof release).toBe('function');

      release();

      const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(firstResult).toBe(secondResult);
      expect(firstResult.results[0].articlesCreated).toBe(1);

      const articles = await prisma.article.findMany();
      expect(articles).toHaveLength(1);
    });
  });

  describe('cleanupOldArticles', () => {
    it('removes articles older than seven days along with their posts', async () => {
      const now = new Date('2025-03-10T09:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });

      const oldArticle = await prisma.article.create({
        data: {
          feedId: feed.id,
          title: 'Old',
          contentSnippet: 'Old content',
          publishedAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000),
          guid: 'old-guid',
          link: null,
          dedupeKey: 'guid:old-guid',
        },
      });
      await prisma.post.create({ data: { articleId: oldArticle.id, content: 'Old post' } });

      const recentArticle = await prisma.article.create({
        data: {
          feedId: feed.id,
          title: 'Recent',
          contentSnippet: 'Recent content',
          publishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          guid: 'recent-guid',
          link: null,
          dedupeKey: 'guid:recent-guid',
        },
      });
      await prisma.post.create({ data: { articleId: recentArticle.id, content: 'Recent post' } });

      const outcome = await cleanupOldArticles({ ownerKey: '1', now });

      expect(outcome).toEqual({ removedArticles: 1, removedPosts: 1 });

      const remainingArticles = await prisma.article.findMany();
      expect(remainingArticles).toHaveLength(1);
      expect(remainingArticles[0].title).toBe('Recent');

      const remainingPosts = await prisma.post.findMany();
      expect(remainingPosts).toHaveLength(1);
      expect(remainingPosts[0].content).toBe('Recent post');
    });
  });

  describe('listRecentArticles', () => {
    it('returns recent articles ordered by publishedAt desc with pagination', async () => {
      const now = new Date('2025-03-05T12:00:00Z');
      const feed = await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });

      const rss = buildRss([
        makeRssItem({ title: 'First', guid: 'a', publishedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) }),
        makeRssItem({ title: 'Second', guid: 'b', publishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) }),
        makeRssItem({ title: 'Third', guid: 'c', publishedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) }),
      ]);
      const fetcher = createFetchMock(new Map([[feed.url, rss]]));

      await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      const firstPage = await listRecentArticles({ ownerKey: '1', limit: 2, now });
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.items[0].title).toBe('First');
      expect(firstPage.items[1].title).toBe('Second');
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await listRecentArticles({ ownerKey: '1', cursor: firstPage.nextCursor, now });
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.items[0].title).toBe('Third');
      expect(secondPage.nextCursor).toBeNull();

      const posts = await prisma.post.findMany();
      expect(posts).toHaveLength(3);
      for (const post of posts) {
        expect(post.status).toBe('PENDING');
        expect(post.content).toBeNull();
        expect(post.attemptCount).toBe(0);
      }
    });

    it('filters out articles older than seven days and supports feed filtering', async () => {
      const now = new Date('2025-03-06T12:00:00Z');
      const feedA = await createFeed({ url: 'https://example.com/a.xml', lastFetchedAt: new Date('2025-02-01T00:00:00Z') });
      const feedB = await createFeed({ url: 'https://example.com/b.xml', lastFetchedAt: new Date('2025-02-01T00:00:00Z') });

      await prisma.article.create({
        data: {
          feedId: feedA.id,
          title: 'Too Old',
          contentSnippet: 'Old snippet',
          publishedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          guid: 'too-old',
          link: null,
          dedupeKey: 'guid:too-old',
        },
      });

      const rssA = buildRss([makeRssItem({ title: 'Fresh A', guid: 'fresh-a', publishedAt: now })]);
      const rssB = buildRss([makeRssItem({ title: 'Fresh B', guid: 'fresh-b', publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) })]);
      const fetcher = createFetchMock(
        new Map([
          [feedA.url, rssA],
          [feedB.url, rssB],
        ])
      );

      await refreshUserFeeds({ ownerKey: '1', now, fetcher });

      const listAll = await listRecentArticles({ ownerKey: '1', now });
      expect(listAll.items.map((item) => item.title)).toEqual(['Fresh A', 'Fresh B']);

      const listOnlyB = await listRecentArticles({ ownerKey: '1', feedId: feedB.id, now });
      expect(listOnlyB.items).toHaveLength(1);
      expect(listOnlyB.items[0].title).toBe('Fresh B');
    });

    it('throws an InvalidCursorError when the cursor cannot be decoded', async () => {
      const now = new Date('2025-03-07T12:00:00Z');
      await createFeed({ lastFetchedAt: new Date('2025-02-01T00:00:00Z') });

      await expect(listRecentArticles({ ownerKey: '1', cursor: 'not-base64', now })).rejects.toBeInstanceOf(InvalidCursorError);
    });
  });
});
