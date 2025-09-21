process.env.NODE_ENV = 'test';
process.env.CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173';
process.env.ENABLE_METRICS = process.env.ENABLE_METRICS || 'false';

jest.mock('../src/lib/prisma', () => {
  const feeds = [];
  let idCounter = 1;

  const clone = (entity) => ({ ...entity });

  const filterFeeds = (where = {}) => {
    let result = feeds.slice();

    if (where.ownerKey) {
      result = result.filter((feed) => feed.ownerKey === where.ownerKey);
    }

    if (where.id != null) {
      result = result.filter((feed) => feed.id === where.id);
    }

    if (where.url) {
      if (Array.isArray(where.url.in)) {
        result = result.filter((feed) => where.url.in.includes(feed.url));
      } else if (typeof where.url === 'string') {
        result = result.filter((feed) => feed.url === where.url);
      }
    }

    return result;
  };

  const prisma = {
    feed: {
      findMany: async ({ where = {}, orderBy, take, skip, cursor } = {}) => {
        let result = filterFeeds(where);

        if (orderBy?.id === 'asc') {
          result = result.slice().sort((a, b) => a.id - b.id);
        }

        if (cursor?.id != null) {
          const index = result.findIndex((feed) => feed.id === cursor.id);
          if (index === -1) {
            result = [];
          } else {
            const skipCount = typeof skip === 'number' ? skip : 0;
            result = result.slice(index + skipCount);
          }
        }

        if (typeof take === 'number') {
          result = take >= 0 ? result.slice(0, take) : [];
        }

        return result.map(clone);
      },
      count: async ({ where = {} } = {}) => filterFeeds(where).length,
      findUnique: async ({ where }) => {
        if (where.id != null) {
          const found = feeds.find((feed) => feed.id === where.id);
          return found ? clone(found) : null;
        }

        if (where.ownerKey_url) {
          const { ownerKey, url } = where.ownerKey_url;
          const found = feeds.find((feed) => feed.ownerKey === ownerKey && feed.url === url);
          return found ? clone(found) : null;
        }

        return null;
      },
      create: async ({ data }) => {
        const now = new Date();
        const record = {
          id: idCounter++,
          ownerKey: data.ownerKey,
          url: data.url,
          title: data.title ?? null,
          lastFetchedAt: data.lastFetchedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };

        feeds.push(record);

        return clone(record);
      },
      update: async ({ where, data }) => {
        const index = feeds.findIndex((feed) => feed.id === where.id);

        if (index === -1) {
          throw new Error('Feed not found');
        }

        const now = new Date();
        feeds[index] = {
          ...feeds[index],
          ...data,
          updatedAt: now,
        };

        return clone(feeds[index]);
      },
      delete: async ({ where }) => {
        const index = feeds.findIndex((feed) => feed.id === where.id);

        if (index === -1) {
          throw new Error('Feed not found');
        }

        const [removed] = feeds.splice(index, 1);
        return clone(removed);
      },
    },
    helloMessage: {
      findFirst: async () => null,
    },
    __reset: () => {
      feeds.splice(0, feeds.length);
      idCounter = 1;
    },
  };

  return { prisma, disconnectDatabase: jest.fn() };
});
