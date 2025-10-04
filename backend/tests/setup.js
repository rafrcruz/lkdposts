process.env.NODE_ENV = 'test';
process.env.CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173';
process.env.ENABLE_METRICS = process.env.ENABLE_METRICS || 'false';

jest.mock('../src/lib/prisma', () => {
  const { randomUUID } = require('node:crypto');
  const feeds = [];
  const articles = [];
  const posts = [];
  const allowedUsers = [];
  const appParams = [];
  const prompts = [];

  let feedIdCounter = 1;
  let articleIdCounter = 1;
  let postIdCounter = 1;
  let allowedUserIdCounter = 1;

  const clone = (entity) => {
    if (entity == null) {
      return entity;
    }

    const copy = { ...entity };
    for (const key of Object.keys(copy)) {
      if (copy[key] instanceof Date) {
        copy[key] = new Date(copy[key]);
      }
    }
    return copy;
  };

  const matchesScalar = (actual, condition) => {
    if (condition == null) {
      return true;
    }

    if (typeof condition === 'object' && condition !== null) {
      if (Array.isArray(condition.in)) {
        return condition.in.includes(actual);
      }

      if (condition.equals !== undefined) {
        return actual === condition.equals;
      }

      if (condition.not !== undefined) {
        return !matchesScalar(actual, condition.not);
      }

      if (condition.gt !== undefined && actual <= condition.gt) {
        return false;
      }

      if (condition.gte !== undefined && actual < condition.gte) {
        return false;
      }

      if (condition.lt !== undefined && actual >= condition.lt) {
        return false;
      }

      if (condition.lte !== undefined && actual > condition.lte) {
        return false;
      }

      return true;
    }

    return actual === condition;
  };

  const toDate = (value) => {
    if (value instanceof Date) {
      return value;
    }
    return new Date(value);
  };

  const normalizeActualDate = (value) => {
    if (value instanceof Date) {
      const numericValue = value.valueOf();
      return Number.isNaN(numericValue) ? null : new Date(numericValue);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  };

  const evaluateDateRange = (date, condition) => {
    const timestamp = date.valueOf();

    if (condition.lt !== undefined && timestamp >= toDate(condition.lt).valueOf()) {
      return false;
    }

    if (condition.lte !== undefined && timestamp > toDate(condition.lte).valueOf()) {
      return false;
    }

    if (condition.gt !== undefined && timestamp <= toDate(condition.gt).valueOf()) {
      return false;
    }

    if (condition.gte !== undefined && timestamp < toDate(condition.gte).valueOf()) {
      return false;
    }

    if (condition.equals !== undefined) {
      return matchDateCondition(date, condition.equals);
    }

    return true;
  };

  const matchDateCondition = (actual, condition) => {
    const date = normalizeActualDate(actual);
    if (!date) {
      return false;
    }

    if (condition == null) {
      return true;
    }

    if (condition instanceof Date || typeof condition === 'string' || typeof condition === 'number') {
      const target = toDate(condition);
      return date.valueOf() === target.valueOf();
    }

    if (typeof condition === 'object') {
      return evaluateDateRange(date, condition);
    }

    return date.valueOf() === toDate(condition).valueOf();
  };

  const matchNullableDateField = (actual, expected) => {
    if (expected === undefined) {
      return true;
    }

    if (expected === null) {
      return actual === null;
    }

    if (typeof expected === 'object' && expected !== null) {
      if (Object.hasOwn(expected, 'not')) {
        const negated = expected.not;
        return !matchNullableDateField(actual, negated);
      }

      return matchDateCondition(actual, expected);
    }

    return matchDateCondition(actual, expected);
  };

  const matchesUrlCondition = (feed, urlCondition) => {
    if (!urlCondition) {
      return true;
    }

    if (Array.isArray(urlCondition.in)) {
      return urlCondition.in.includes(feed.url);
    }

    if (typeof urlCondition === 'string') {
      return feed.url === urlCondition;
    }

    return true;
  };

  const matchFeedWhere = (feed, where = {}) => {
    if (where == null) {
      return true;
    }

    if (!matchesScalar(feed.id, where.id)) {
      return false;
    }

    if (where.ownerKey !== undefined && feed.ownerKey !== where.ownerKey) {
      return false;
    }

    if (!matchesUrlCondition(feed, where.url)) {
      return false;
    }

    if (!matchNullableDateField(feed.lastFetchedAt, where.lastFetchedAt)) {
      return false;
    }

    if (!matchesLogicalGroup(feed, where.AND, 'AND')) {
      return false;
    }

    if (where.OR && !matchesLogicalGroup(feed, where.OR, 'OR')) {
      return false;
    }

    if (!matchesNotGroup(feed, where.NOT)) {
      return false;
    }

    return true;
  };

  function matchesLogicalGroup(feed, conditions, predicate) {
    if (!Array.isArray(conditions) || conditions.length === 0) {
      return true;
    }

    if (predicate === 'AND') {
      return conditions.every((condition) => matchFeedWhere(feed, condition));
    }

    return conditions.some((condition) => matchFeedWhere(feed, condition));
  }

  function matchesNotGroup(feed, notConditions) {
    if (notConditions === undefined) {
      return true;
    }

    const conditions = Array.isArray(notConditions) ? notConditions : [notConditions];
    return !conditions.some((condition) => matchFeedWhere(feed, condition));
  }

  const filterFeeds = (where = {}) => feeds.filter((feed) => matchFeedWhere(feed, where));

  const matchPromptWhere = (prompt, where = {}) => {
    if (where == null) {
      return true;
    }

    if (!matchesScalar(prompt.id, where.id)) {
      return false;
    }

    if (!matchesScalar(prompt.userId, where.userId)) {
      return false;
    }

    if (!matchesScalar(prompt.position, where.position)) {
      return false;
    }

    if (!matchesScalar(prompt.enabled, where.enabled)) {
      return false;
    }

    if (Array.isArray(where.AND) && where.AND.length > 0) {
      if (!where.AND.every((condition) => matchPromptWhere(prompt, condition))) {
        return false;
      }
    }

    if (Array.isArray(where.OR) && where.OR.length > 0) {
      if (!where.OR.some((condition) => matchPromptWhere(prompt, condition))) {
        return false;
      }
    }

    if (Array.isArray(where.NOT) && where.NOT.length > 0) {
      if (where.NOT.some((condition) => matchPromptWhere(prompt, condition))) {
        return false;
      }
    } else if (where.NOT && typeof where.NOT === 'object') {
      if (matchPromptWhere(prompt, where.NOT)) {
        return false;
      }
    }

    return true;
  };

  const filterPrompts = (where = {}) => prompts.filter((prompt) => matchPromptWhere(prompt, where));

  const matchAllowedUserWhere = (user, where = {}) => {
    if (where == null) {
      return true;
    }

    if (!matchesScalar(user.id, where.id)) {
      return false;
    }

    if (where.email !== undefined && user.email !== where.email) {
      return false;
    }

    if (where.role !== undefined && user.role !== where.role) {
      return false;
    }

    return true;
  };

  const filterAllowedUsers = (where = {}) => allowedUsers.filter((user) => matchAllowedUserWhere(user, where));

  const getAppParamsRecord = () => (appParams.length > 0 ? appParams[0] : null);

  const matchesNullableField = (actual, expected) => {
    if (expected === undefined) {
      return true;
    }

    if (expected === null) {
      return actual === null;
    }

    return actual === expected;
  };

  const matchesAllConditions = (article, conditions) => {
    if (!Array.isArray(conditions) || conditions.length === 0) {
      return true;
    }

    return conditions.every((condition) => matchArticleWhere(article, condition));
  };

  const matchesAnyCondition = (article, conditions) => {
    if (!Array.isArray(conditions)) {
      return true;
    }

    if (conditions.length === 0) {
      return false;
    }

    return conditions.some((condition) => matchArticleWhere(article, condition));
  };

  const matchArticleWhere = (article, where = {}) => {
    if (!where) {
      return true;
    }

    if (!matchesScalar(article.id, where.id)) {
      return false;
    }

    if (!matchesScalar(article.feedId, where.feedId)) {
      return false;
    }

    if (!matchesScalar(article.dedupeKey, where.dedupeKey)) {
      return false;
    }

    if (!matchesNullableField(article.guid, where.guid)) {
      return false;
    }

    if (!matchesNullableField(article.link, where.link)) {
      return false;
    }

    if (where.publishedAt !== undefined && !matchDateCondition(article.publishedAt, where.publishedAt)) {
      return false;
    }

    if (where.feed) {
      const feed = feeds.find((entry) => entry.id === article.feedId) ?? {};
      if (!matchFeedWhere(feed, where.feed)) {
        return false;
      }
    }

    if (!matchesAllConditions(article, where.AND)) {
      return false;
    }

    if (!matchesAnyCondition(article, where.OR)) {
      return false;
    }

    return true;
  };

  const filterArticles = (where = {}) => articles.filter((article) => matchArticleWhere(article, where));

  const matchPostWhere = (post, where = {}) => {
    if (where == null) {
      return true;
    }

    if (!matchesScalar(post.id, where.id)) {
      return false;
    }

    if (!matchesScalar(post.articleId, where.articleId)) {
      return false;
    }

    if (!matchesScalar(post.status, where.status)) {
      return false;
    }

    return true;
  };

  const filterPosts = (where = {}) => posts.filter((post) => matchPostWhere(post, where));

  const findPostRecord = (where = {}) => {
    if (where == null) {
      return null;
    }

    if (where.id !== undefined) {
      return posts.find((post) => post.id === where.id) ?? null;
    }

    if (where.articleId !== undefined) {
      return posts.find((post) => post.articleId === where.articleId) ?? null;
    }

    return null;
  };

  const applyPostData = (record, data = {}) => {
    if (data.content !== undefined) {
      record.content = data.content;
    }

    if (data.modelUsed !== undefined) {
      record.modelUsed = data.modelUsed;
    }

    if (data.generatedAt !== undefined) {
      record.generatedAt = data.generatedAt ? new Date(data.generatedAt) : null;
    }

    if (data.status !== undefined) {
      record.status = data.status;
    }

    if (data.errorReason !== undefined) {
      record.errorReason = data.errorReason;
    }

    if (data.tokensInput !== undefined) {
      record.tokensInput = data.tokensInput;
    }

    if (data.tokensOutput !== undefined) {
      record.tokensOutput = data.tokensOutput;
    }

    if (data.promptBaseHash !== undefined) {
      record.promptBaseHash = data.promptBaseHash;
    }

    if (data.attemptCount !== undefined) {
      record.attemptCount = data.attemptCount;
    }
  };

  const orderByComparator = (orderBy) => {
    const fields = Array.isArray(orderBy) ? orderBy : [orderBy];
    return (a, b) => {
      for (const entry of fields) {
        const [field, direction] = Object.entries(entry)[0];
        const multiplier = direction === 'desc' ? -1 : 1;

        let aValue = a[field];
        let bValue = b[field];

        if (aValue instanceof Date) {
          aValue = aValue.valueOf();
        }
        if (bValue instanceof Date) {
          bValue = bValue.valueOf();
        }

        if (aValue < bValue) {
          return -1 * multiplier;
        }
        if (aValue > bValue) {
          return 1 * multiplier;
        }
      }
      return 0;
    };
  };

  const selectFields = (record, select) => {
    if (!select || typeof select !== 'object') {
      return clone(record);
    }

    const result = {};
    for (const key of Object.keys(select)) {
      if (!select[key]) {
        continue;
      }

      const value = record[key];
      if (value instanceof Date) {
        result[key] = new Date(value);
        continue;
      }

      if (Array.isArray(value)) {
        result[key] = value.map((item) => (item && typeof item === 'object' ? clone(item) : item));
        continue;
      }

      if (value && typeof value === 'object') {
        result[key] = clone(value);
        continue;
      }

      result[key] = value;
    }

    return result;
  };

  const pickRelatedEntity = (entity, includeConfig) => {
    if (!entity) {
      return null;
    }

    if (includeConfig && typeof includeConfig === 'object' && includeConfig.select) {
      return selectFields(entity, includeConfig.select);
    }

    return clone(entity);
  };

  const includeRelations = (article, include) => {
    if (!include) {
      return clone(article);
    }

    const result = clone(article);

    if (include.post) {
      const relatedPost = posts.find((entry) => entry.articleId === article.id) || null;
      result.post = pickRelatedEntity(relatedPost, include.post);
    }

    if (include.feed) {
      const relatedFeed = feeds.find((entry) => entry.id === article.feedId) || null;
      result.feed = pickRelatedEntity(relatedFeed, include.feed);
    }

    return result;
  };

  const uniqueConstraintError = (target) => {
    const error = new Error(`Unique constraint failed on the fields: (${target})`);
    error.code = 'P2002';
    error.meta = { target };
    return error;
  };

  const prisma = {
    appParams: {
      findUnique: async ({ where, select } = {}) => {
        const record = getAppParamsRecord();

        if (!record) {
          return null;
        }

        if (where?.id != null && record.id !== where.id) {
          return null;
        }

        return select ? selectFields(record, select) : clone(record);
      },
      findFirst: async () => {
        const record = getAppParamsRecord();
        return record ? clone(record) : null;
      },
      create: async ({ data }) => {
        const now = new Date();
        const record = {
          id: data.id ?? 1,
          postsRefreshCooldownSeconds: data.postsRefreshCooldownSeconds,
          postsTimeWindowDays: data.postsTimeWindowDays,
          openAiModel: data.openAiModel ?? 'gpt-5-nano',
          updatedBy: data.updatedBy ?? null,
          createdAt: now,
          updatedAt: now,
        };

        appParams[0] = record;

        return clone(record);
      },
      update: async ({ where = {}, data = {} } = {}) => {
        const record = getAppParamsRecord();

        if (!record || (where.id != null && record.id !== where.id)) {
          throw new Error('AppParams record not found');
        }

        const now = new Date();
        const updated = { ...record };

        if (data.postsRefreshCooldownSeconds !== undefined) {
          updated.postsRefreshCooldownSeconds = data.postsRefreshCooldownSeconds;
        }

        if (data.postsTimeWindowDays !== undefined) {
          updated.postsTimeWindowDays = data.postsTimeWindowDays;
        }

        if (data.openAiModel !== undefined) {
          updated.openAiModel = data.openAiModel;
        }

        if (data.updatedBy !== undefined) {
          updated.updatedBy = data.updatedBy ?? null;
        }

        updated.updatedAt = now;
        appParams[0] = updated;

        return clone(updated);
      },
    },
    feed: {
      findMany: async ({ where = {}, orderBy, take, skip, cursor } = {}) => {
        let result = filterFeeds(where);

        if (orderBy) {
          result = result.slice().sort(orderByComparator(orderBy));
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
      findUnique: async ({ where, select }) => {
        let found = null;

        if (where.id != null) {
          found = feeds.find((feed) => feed.id === where.id) || null;
        } else if (where.ownerKey_url) {
          const { ownerKey, url } = where.ownerKey_url;
          found = feeds.find((feed) => feed.ownerKey === ownerKey && feed.url === url) || null;
        }

        if (!found) {
          return null;
        }

        return select ? selectFields(found, select) : clone(found);
      },
      create: async ({ data }) => {
        const now = new Date();
        const record = {
          id: feedIdCounter++,
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
      updateMany: async ({ where = {}, data = {} } = {}) => {
        const matching = filterFeeds(where);

        if (matching.length === 0) {
          return { count: 0 };
        }

        const ids = new Set(matching.map((feed) => feed.id));
        const now = new Date();

        for (let index = 0; index < feeds.length; index += 1) {
          if (!ids.has(feeds[index].id)) {
            continue;
          }

          feeds[index] = {
            ...feeds[index],
            ...data,
            updatedAt: Object.hasOwn(data, 'updatedAt') ? data.updatedAt : now,
          };
        }

        return { count: matching.length };
      },
      delete: async ({ where }) => {
        const index = feeds.findIndex((feed) => feed.id === where.id);

        if (index === -1) {
          throw new Error('Feed not found');
        }

        const [removed] = feeds.splice(index, 1);
        const removedArticleIds = new Set(
          articles.filter((article) => article.feedId === removed.id).map((article) => article.id),
        );

        for (let i = articles.length - 1; i >= 0; i -= 1) {
          if (articles[i].feedId === removed.id) {
            articles.splice(i, 1);
          }
        }

        for (let i = posts.length - 1; i >= 0; i -= 1) {
          if (removedArticleIds.has(posts[i].articleId)) {
            posts.splice(i, 1);
          }
        }

        return clone(removed);
      },
    },
    prompt: {
      findMany: async ({ where = {}, orderBy, take, skip } = {}) => {
        let result = filterPrompts(where);

        if (orderBy) {
          result = result.slice().sort(orderByComparator(orderBy));
        } else {
          result = result.slice();
        }

        if (typeof skip === 'number' && skip > 0) {
          result = result.slice(skip);
        }

        if (typeof take === 'number') {
          result = take >= 0 ? result.slice(0, take) : [];
        }

        return result.map(clone);
      },
      count: async ({ where = {} } = {}) => filterPrompts(where).length,
      findUnique: async ({ where, select }) => {
        if (!where || where.id == null) {
          return null;
        }

        const prompt = prompts.find((entry) => entry.id === where.id) || null;

        if (!prompt) {
          return null;
        }

        return select ? selectFields(prompt, select) : clone(prompt);
      },
      findFirst: async ({ where = {}, orderBy, select } = {}) => {
        let result = filterPrompts(where);

        if (orderBy) {
          result = result.slice().sort(orderByComparator(orderBy));
        }

        const first = result[0] ?? null;

        if (!first) {
          return null;
        }

        return select ? selectFields(first, select) : clone(first);
      },
      create: async ({ data }) => {
        const conflict = prompts.some(
          (entry) => entry.userId === data.userId && entry.position === data.position
        );

        if (conflict) {
          throw uniqueConstraintError('Prompt_userId_position_key');
        }

        const now = new Date();
        const record = {
          id: data.id ?? randomUUID(),
          userId: data.userId,
          title: data.title,
          content: data.content,
          position: data.position,
          enabled: data.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        };

        prompts.push(record);

        return clone(record);
      },
      update: async ({ where, data }) => {
        if (!where || where.id == null) {
          throw new Error('Mock prompt.update requires an id in where clause');
        }

        const index = prompts.findIndex((entry) => entry.id === where.id);

        if (index === -1) {
          throw new Error('Prompt not found');
        }

        const current = prompts[index];

        if (Object.hasOwn(data, 'position')) {
          const targetPosition = data.position;
          const duplicate = prompts.some(
            (entry) => entry.id !== current.id && entry.userId === current.userId && entry.position === targetPosition
          );

          if (duplicate) {
            throw uniqueConstraintError('Prompt_userId_position_key');
          }
        }

        prompts[index] = {
          ...current,
          ...data,
          enabled: Object.hasOwn(data, 'enabled') ? data.enabled : current.enabled,
          updatedAt: new Date(),
        };

        return clone(prompts[index]);
      },
      delete: async ({ where }) => {
        if (!where || where.id == null) {
          throw new Error('Mock prompt.delete requires an id in where clause');
        }

        const index = prompts.findIndex((entry) => entry.id === where.id);

        if (index === -1) {
          throw new Error('Prompt not found');
        }

        const [removed] = prompts.splice(index, 1);

        return clone(removed);
      },
      aggregate: async ({ where = {}, _max } = {}) => {
        const items = filterPrompts(where);
        const response = {};

        if (_max) {
          const maxResult = {};

          if (_max.position) {
            maxResult.position = items.length === 0 ? null : Math.max(...items.map((item) => item.position));
          }

          response._max = maxResult;
        } else {
          response._max = {};
        }

        return response;
      },
    },
    allowedUser: {
      upsert: async ({ where, update, create }) => {
        const index = allowedUsers.findIndex((user) => user.email === where.email);

        if (index === -1) {
          const now = new Date();
          const record = {
            id: allowedUserIdCounter++,
            email: create.email,
            role: create.role,
            createdAt: now,
            updatedAt: now,
          };

          allowedUsers.push(record);
          return clone(record);
        }

        const now = new Date();
        allowedUsers[index] = {
          ...allowedUsers[index],
          ...update,
          updatedAt: now,
        };

        return clone(allowedUsers[index]);
      },
      findUnique: async ({ where }) => {
        let found = null;

        if (where.id != null) {
          found = allowedUsers.find((user) => user.id === where.id) || null;
        } else if (where.email != null) {
          found = allowedUsers.find((user) => user.email === where.email) || null;
        }

        return found ? clone(found) : null;
      },
      findMany: async ({ where = {}, orderBy, take, skip, cursor } = {}) => {
        let result = filterAllowedUsers(where);

        if (orderBy) {
          result = result.slice().sort(orderByComparator(orderBy));
        }

        if (cursor?.id != null) {
          const index = result.findIndex((user) => user.id === cursor.id);
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
      count: async ({ where = {} } = {}) => filterAllowedUsers(where).length,
      create: async ({ data }) => {
        const now = new Date();
        const record = {
          id: allowedUserIdCounter++,
          email: data.email,
          role: data.role,
          createdAt: now,
          updatedAt: now,
        };

        allowedUsers.push(record);
        return clone(record);
      },
      update: async ({ where, data }) => {
        const index = allowedUsers.findIndex((user) => user.id === where.id);

        if (index === -1) {
          throw new Error('Allowed user not found');
        }

        const now = new Date();
        allowedUsers[index] = {
          ...allowedUsers[index],
          ...data,
          updatedAt: now,
        };

        return clone(allowedUsers[index]);
      },
      delete: async ({ where }) => {
        const index = allowedUsers.findIndex((user) => user.id === where.id);

        if (index === -1) {
          throw new Error('Allowed user not found');
        }

        const [removed] = allowedUsers.splice(index, 1);
        return clone(removed);
      },
      deleteMany: async ({ where = {} }) => {
        const matching = filterAllowedUsers(where);
        const ids = new Set(matching.map((user) => user.id));

        for (let i = allowedUsers.length - 1; i >= 0; i -= 1) {
          if (ids.has(allowedUsers[i].id)) {
            allowedUsers.splice(i, 1);
          }
        }

        return { count: matching.length };
      },
    },
    article: {
      findMany: async ({ where = {}, orderBy, take, skip, cursor, include, select } = {}) => {
        let result = filterArticles(where);

        if (orderBy) {
          result = result.slice().sort(orderByComparator(orderBy));
        }

        if (cursor?.id != null) {
          const index = result.findIndex((article) => article.id === cursor.id);
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

        if (select) {
          return result.map((item) => selectFields(item, select));
        }

        if (include) {
          return result.map((item) => includeRelations(item, include));
        }

        return result.map(clone);
      },
      findFirst: async ({ where = {}, orderBy, cursor, include, select } = {}) => {
        const [first] = await prisma.article.findMany({ where, orderBy, take: 1, cursor, include, select });
        return first ?? null;
      },
      findUnique: async ({ where, select }) => {
        let found = null;

        if (where.id != null) {
          found = articles.find((article) => article.id === where.id) || null;
        } else if (where.feedId_dedupeKey) {
          const { feedId, dedupeKey } = where.feedId_dedupeKey;
          found = articles.find((article) => article.feedId === feedId && article.dedupeKey === dedupeKey) || null;
        } else if (where.feedId_guid) {
          const { feedId, guid } = where.feedId_guid;
          found = articles.find((article) => article.feedId === feedId && article.guid === guid) || null;
        } else if (where.feedId_link) {
          const { feedId, link } = where.feedId_link;
          found = articles.find((article) => article.feedId === feedId && article.link === link) || null;
        }

        if (!found) {
          return null;
        }

        return select ? selectFields(found, select) : clone(found);
      },
      create: async ({ data }) => {
        if (data.guid != null) {
          const duplicateGuid = articles.some((article) => article.feedId === data.feedId && article.guid === data.guid);
          if (duplicateGuid) {
            throw uniqueConstraintError('Article_feedId_guid_key');
          }
        }

        if (data.link != null) {
          const duplicateLink = articles.some((article) => article.feedId === data.feedId && article.link === data.link);
          if (duplicateLink) {
            throw uniqueConstraintError('Article_feedId_link_key');
          }
        }

        const duplicateKey = articles.some((article) => article.feedId === data.feedId && article.dedupeKey === data.dedupeKey);
        if (duplicateKey) {
          throw uniqueConstraintError('Article_feedId_dedupeKey_key');
        }

        const now = new Date();
        const record = {
          id: articleIdCounter++,
          feedId: data.feedId,
          title: data.title,
          contentSnippet: data.contentSnippet,
          articleHtml: data.articleHtml ?? null,
          publishedAt: new Date(data.publishedAt),
          guid: data.guid ?? null,
          link: data.link ?? null,
          dedupeKey: data.dedupeKey,
          createdAt: now,
          updatedAt: now,
        };

        articles.push(record);

        return clone(record);
      },
      update: async ({ where, data }) => {
        if (!where || where.id == null) {
          throw new Error('Mock article.update requires an id in where clause');
        }

        const article = articles.find((entry) => entry.id === where.id);
        if (!article) {
          throw new Error('Record not found');
        }

        if (Object.hasOwn(data, 'articleHtml')) {
          article.articleHtml = data.articleHtml ?? null;
        }

        article.updatedAt = new Date();

        return clone(article);
      },
      deleteMany: async ({ where = {} } = {}) => {
        const matching = filterArticles(where);
        const ids = new Set(matching.map((article) => article.id));

        for (let i = articles.length - 1; i >= 0; i -= 1) {
          if (ids.has(articles[i].id)) {
            articles.splice(i, 1);
          }
        }

        for (let i = posts.length - 1; i >= 0; i -= 1) {
          if (ids.has(posts[i].articleId)) {
            posts.splice(i, 1);
          }
        }

        return { count: matching.length };
      },
    },
    post: {
      create: async ({ data }) => {
        const duplicate = posts.some((post) => post.articleId === data.articleId);
        if (duplicate) {
          throw uniqueConstraintError('Post_articleId_key');
        }

        const now = new Date();
        const record = {
          id: postIdCounter++,
          articleId: data.articleId,
          content: null,
          modelUsed: null,
          generatedAt: null,
          status: 'PENDING',
          errorReason: null,
          tokensInput: null,
          tokensOutput: null,
          promptBaseHash: null,
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        };

        applyPostData(record, data);

        posts.push(record);

        return clone(record);
      },
      findMany: async ({ where = {} } = {}) => filterPosts(where).map(clone),
      findUnique: async ({ where = {} } = {}) => {
        const record = findPostRecord(where);
        return record ? clone(record) : null;
      },
      update: async ({ where = {}, data = {} }) => {
        const record = findPostRecord(where);
        if (!record) {
          throw new Error('Record not found');
        }

        applyPostData(record, data);
        record.updatedAt = new Date();

        return clone(record);
      },
      upsert: async ({ where = {}, create, update }) => {
        const existing = findPostRecord(where);

        if (existing) {
          applyPostData(existing, update);
          existing.updatedAt = new Date();
          return clone(existing);
        }

        const payload = { ...create };
        if (payload.articleId === undefined && where.articleId !== undefined) {
          payload.articleId = where.articleId;
        }

        return prisma.post.create({ data: payload });
      },
      deleteMany: async ({ where = {} } = {}) => {
        const matching = filterPosts(where);
        const ids = new Set(matching.map((post) => post.id));

        for (let i = posts.length - 1; i >= 0; i -= 1) {
          if (ids.has(posts[i].id)) {
            posts.splice(i, 1);
          }
        }

        return { count: matching.length };
      },
    },
    helloMessage: {
      findFirst: async () => null,
    },
    $transaction: async (operations) => {
      if (typeof operations === 'function') {
        return operations(prisma);
      }

      if (Array.isArray(operations)) {
        const results = [];
        for (const operation of operations) {
          // eslint-disable-next-line no-await-in-loop
          results.push(await operation);
        }
        return results;
      }

      throw new Error('Unsupported transaction payload');
    },
    __reset: () => {
      feeds.splice(0, feeds.length);
      articles.splice(0, articles.length);
      posts.splice(0, posts.length);
      allowedUsers.splice(0, allowedUsers.length);
      appParams.splice(0, appParams.length);
      prompts.splice(0, prompts.length);
      feedIdCounter = 1;
      articleIdCounter = 1;
      postIdCounter = 1;
      allowedUserIdCounter = 1;
    },
  };

  return { prisma, disconnectDatabase: jest.fn() };
});

jest.mock('../src/lib/openai-client', () => {
  const responses = {
    create: jest.fn(async () => ({
      id: 'mock-openai-response',
      model: 'gpt-mock',
      output_text: 'Post gerado automaticamente (mock).',
      usage: { input_tokens: 120, output_tokens: 80 },
    })),
  };

  const client = {};
  client.responses = responses;
  client.withOptions = jest.fn(() => client);

  return {
    getOpenAIClient: jest.fn(() => client),
    resetOpenAIClient: jest.fn(),
    getOpenAIEnvironment: jest.fn(() => ({ baseUrl: 'https://api.openai.com/v1', timeoutMs: 30000 })),
    __mockClient: client,
  };
});
