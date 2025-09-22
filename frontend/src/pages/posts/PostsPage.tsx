import type { ChangeEvent, JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCleanupPosts, usePostList, useRefreshPosts } from '@/features/posts/hooks/usePosts';
import type {
  CleanupResult,
  PostListItem,
  RefreshFeedSummary,
  RefreshSummary,
} from '@/features/posts/types/post';
import { useFeedList } from '@/features/feeds/hooks/useFeeds';
import type { Feed } from '@/features/feeds/types/feed';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingSkeleton } from '@/components/feedback/LoadingSkeleton';
import { HttpError } from '@/lib/api/http';
import { formatDate, formatNumber, useLocale } from '@/utils/formatters';

const PAGE_SIZE = 10;
const FEED_OPTIONS_LIMIT = 50;

type ExpandedSections = Record<number, { post: boolean; article: boolean }>;
type SectionState = ExpandedSections[number];

type RefreshOptions = {
  resetPagination?: boolean;
};

type RefreshAggregates = {
  itemsRead: number;
  itemsWithinWindow: number;
  articlesCreated: number;
  duplicates: number;
  invalidItems: number;
  skippedFeeds: number;
  errorFeeds: number;
};

type TranslateFunction = ReturnType<typeof useTranslation>['t'];

const resolveFeedLabel = (feed: Feed, t: ReturnType<typeof useTranslation>['t']) => {
  if (feed.title) {
    return feed.title;
  }

  if (feed.url) {
    return feed.url;
  }

  return t('posts.filters.feedFallback', `Feed ${feed.id}`, { id: feed.id });
};

const resolveArticleFeedLabel = (feed: PostListItem['feed'], t: ReturnType<typeof useTranslation>['t']) => {
  if (!feed) {
    return t('posts.list.metadata.feedUnknown', 'Feed not available');
  }

  if (feed.title) {
    return feed.title;
  }

  if (feed.url) {
    return feed.url;
  }

  return t('posts.list.metadata.feedFallback', `Feed ${feed.id}`, { id: feed.id });
};

const buildSummaryTitle = (summary: RefreshFeedSummary, t: ReturnType<typeof useTranslation>['t']) => {
  if (summary.feedTitle) {
    return summary.feedTitle;
  }

  if (summary.feedUrl) {
    return summary.feedUrl;
  }

  return t('posts.summary.feedFallback', `Feed ${summary.feedId}`, { id: summary.feedId });
};

const NETWORK_ERROR_KEYWORDS = ['network', 'timeout', 'failed to fetch', 'load failed'];

const createDefaultSectionState = (): SectionState => ({ post: true, article: false });

const shouldRefetchPostsList = ({
  wasExecutedBefore,
  resetPagination,
  previousCursor,
  previousCursorCount,
}: {
  wasExecutedBefore: boolean;
  resetPagination: boolean;
  previousCursor: string | null;
  previousCursorCount: number;
}) => {
  if (!wasExecutedBefore) {
    return false;
  }

  if (!resetPagination) {
    return true;
  }

  return previousCursor === null && previousCursorCount === 0;
};

const resolveOperationErrorMessage = (error: unknown, t: ReturnType<typeof useTranslation>['t']) => {
  if (error instanceof HttpError) {
    return error.message;
  }

  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase();
    if (NETWORK_ERROR_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))) {
      return t('posts.errors.network', 'We could not connect. Check your network and try again.');
    }

    return error.message;
  }

  return t('posts.errors.generic', 'The operation failed. Try again.');
};

const PostsPage = () => {
  const { t } = useTranslation();
  const locale = useLocale();

  useEffect(() => {
    document.title = t('posts.meta.title', 'lkdposts - Posts');
  }, [t]);

  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([]);
  const [hasExecutedSequence, setHasExecutedSequence] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [refreshSummary, setRefreshSummary] = useState<RefreshSummary | null>(null);
  const [isSummaryDismissed, setIsSummaryDismissed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>({});

  const feedList = useFeedList({ cursor: null, limit: FEED_OPTIONS_LIMIT });
  const feedListData = feedList.data;
  const feeds: Feed[] = feedListData?.items ?? [];
  const totalFeeds: number = feedListData?.meta.total ?? 0;
  const hasFeeds = totalFeeds > 0;

  const postListQuery = usePostList({ cursor, limit: PAGE_SIZE, feedId: selectedFeedId, enabled: hasExecutedSequence });
  const postListData = postListQuery.data;
  const posts = useMemo<PostListItem[]>(() => postListData?.items ?? [], [postListData?.items]);
  const nextCursor: string | null = postListData?.meta.nextCursor ?? null;
  const isLoading = postListQuery.isLoading && !postListQuery.isFetched;
  const isError = postListQuery.isError;
  const isFetching = postListQuery.isFetching;
  const currentPage = previousCursors.length + 1;

  const { mutateAsync: refreshPostsAsync } = useRefreshPosts();
  const { mutateAsync: cleanupPostsAsync } = useCleanupPosts();

  const handleRefreshSettled = useCallback(
    (result: PromiseSettledResult<RefreshSummary>) => {
      if (result.status === 'fulfilled') {
        setRefreshSummary(result.value);
        return;
      }

      setRefreshSummary(null);
      setRefreshError(resolveOperationErrorMessage(result.reason, t));
    },
    [t],
  );

  const handleCleanupSettled = useCallback(
    (result: PromiseSettledResult<CleanupResult>) => {
      if (result.status === 'fulfilled') {
        setCleanupResult(result.value);
        return;
      }

      setCleanupResult(null);
      setCleanupError(resolveOperationErrorMessage(result.reason, t));
    },
    [t],
  );

  const syncPosts = useCallback(
    async ({ resetPagination = false }: RefreshOptions = {}) => {
      setRefreshError(null);
      setCleanupError(null);

      const previousCursorValue = cursor;
      const previousCursorCount = previousCursors.length;

      setIsSyncing(true);

      const wasExecutedBefore = hasExecutedSequence;

      try {
        const [refreshResult, cleanupResultEntry] = await Promise.allSettled([
          refreshPostsAsync(),
          cleanupPostsAsync(),
        ]);

        handleRefreshSettled(refreshResult);
        handleCleanupSettled(cleanupResultEntry);

        if (resetPagination) {
          setCursor(null);
          setPreviousCursors([]);
        }

        setHasExecutedSequence(true);

        const shouldRefetchList = shouldRefetchPostsList({
          wasExecutedBefore,
          resetPagination,
          previousCursor: previousCursorValue,
          previousCursorCount,
        });

        return { shouldRefetchList };
      } finally {
        setIsSyncing(false);
      }
    },
    [
      cleanupPostsAsync,
      cursor,
      handleCleanupSettled,
      handleRefreshSettled,
      hasExecutedSequence,
      previousCursors.length,
      refreshPostsAsync,
    ],
  );

  useEffect(() => {
    if (hasExecutedSequence) {
      return;
    }

    syncPosts().catch(() => {
      // state updates inside syncPosts handle errors
    });
  }, [hasExecutedSequence, syncPosts]);

  useEffect(() => {
    if (refreshSummary) {
      setIsSummaryDismissed(false);
    }
  }, [refreshSummary]);

  const runSequence = ({ resetPagination = false }: RefreshOptions = {}) => {
    if (isSyncing) {
      return;
    }

    syncPosts({ resetPagination })
      .then(({ shouldRefetchList }) => {
        if (!shouldRefetchList) {
          return;
        }

        postListQuery
          .refetch()
          .catch(() => {
            // error handled by query state
          });
      })
      .catch(() => {
        // state updates inside syncPosts handle errors
      });
  };

  useEffect(() => {
    setExpandedSections((current) => {
      let hasChanges = false;
      const next: ExpandedSections = {};

      for (const item of posts) {
        const existing = current[item.id];
        if (existing) {
          next[item.id] = existing;
          continue;
        }

        hasChanges = true;
        next[item.id] = createDefaultSectionState();
      }

      if (hasChanges) {
        return next;
      }

      const currentIds = Object.keys(current);
      if (currentIds.length !== posts.length) {
        return next;
      }

      for (const id of currentIds) {
        if (!Object.hasOwn(next, id)) {
          return next;
        }
      }

      return current;
    });
  }, [posts]);

  const toggleSection = (id: number, section: 'post' | 'article') => {
    setExpandedSections((current) => {
      const currentEntry = current[id] ?? createDefaultSectionState();
      return {
        ...current,
        [id]: { ...currentEntry, [section]: !currentEntry[section] },
      };
    });
  };

  const handleFeedChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const nextFeedId = value ? Number.parseInt(value, 10) : null;

    const resolvedFeedId = Number.isNaN(nextFeedId) ? null : nextFeedId;

    if (resolvedFeedId === selectedFeedId) {
      return;
    }

    setSelectedFeedId(resolvedFeedId);
    setCursor(null);
    setPreviousCursors([]);
  };

  const handleNextPage = () => {
    if (!nextCursor) {
      return;
    }

    setPreviousCursors((current) => [...current, cursor]);
    setCursor(nextCursor);
  };

  const handlePreviousPage = () => {
    setPreviousCursors((current) => {
      if (current.length === 0) {
        return current;
      }

      const updated = [...current];
      const previousCursor = updated.pop() ?? null;
      setCursor(previousCursor);
      return updated;
    });
  };

  const listErrorMessage = postListQuery.error
    ? resolveOperationErrorMessage(postListQuery.error, t)
    : undefined;

  const summaryAggregates = useMemo<RefreshAggregates | null>(() => {
    if (!refreshSummary) {
      return null;
    }

    return refreshSummary.feeds.reduce<RefreshAggregates>(
      (accumulator, feedSummary) => {
        return {
          itemsRead: accumulator.itemsRead + feedSummary.itemsRead,
          itemsWithinWindow: accumulator.itemsWithinWindow + feedSummary.itemsWithinWindow,
          articlesCreated: accumulator.articlesCreated + feedSummary.articlesCreated,
          duplicates: accumulator.duplicates + feedSummary.duplicates,
          invalidItems: accumulator.invalidItems + feedSummary.invalidItems,
          skippedFeeds: accumulator.skippedFeeds + (feedSummary.skippedByCooldown ? 1 : 0),
          errorFeeds: accumulator.errorFeeds + (feedSummary.error ? 1 : 0),
        };
      },
      {
        itemsRead: 0,
        itemsWithinWindow: 0,
        articlesCreated: 0,
        duplicates: 0,
        invalidItems: 0,
        skippedFeeds: 0,
        errorFeeds: 0,
      },
    );
  }, [refreshSummary]);

  const summaryFeeds = refreshSummary?.feeds ?? [];
  const summaryHasPartialErrors = (summaryAggregates?.errorFeeds ?? 0) > 0;
  const summaryMetricCards = [
    {
      key: 'feedsProcessed',
      label: t('posts.summary.metrics.feedsProcessed', 'Feeds processed'),
      value: formatNumber(summaryFeeds.length, locale),
    },
    {
      key: 'feedsSkipped',
      label: t('posts.summary.metrics.feedsSkipped', 'Feeds skipped'),
      value: formatNumber(summaryAggregates?.skippedFeeds ?? 0, locale),
    },
    {
      key: 'feedsWithErrors',
      label: t('posts.summary.metrics.feedsWithErrors', 'Feeds with errors'),
      value: formatNumber(summaryAggregates?.errorFeeds ?? 0, locale),
    },
    {
      key: 'itemsRead',
      label: t('posts.summary.itemsRead', 'Items read'),
      value: formatNumber(summaryAggregates?.itemsRead ?? 0, locale),
    },
    {
      key: 'itemsWithinWindow',
      label: t('posts.summary.itemsWithinWindow', 'Items within window'),
      value: formatNumber(summaryAggregates?.itemsWithinWindow ?? 0, locale),
    },
    {
      key: 'articlesCreated',
      label: t('posts.summary.articlesCreated', 'Articles created'),
      value: formatNumber(summaryAggregates?.articlesCreated ?? 0, locale),
    },
    {
      key: 'duplicates',
      label: t('posts.summary.duplicates', 'Duplicates'),
      value: formatNumber(summaryAggregates?.duplicates ?? 0, locale),
    },
    {
      key: 'invalidItems',
      label: t('posts.summary.invalidItems', 'Invalid entries'),
      value: formatNumber(summaryAggregates?.invalidItems ?? 0, locale),
    },
  ];

  return (
    <div className="container-responsive space-y-6 py-10" id="conteudo">
      <div className="space-y-1">
        <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">
          {t('posts.heading', 'Recent posts')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('posts.subtitle', 'Review the generated posts alongside the original article excerpts.')}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-md border border-border bg-card px-6 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="feed-filter">
            {t('posts.filters.feedLabel', 'Filter by feed')}
          </label>
          <select
            id="feed-filter"
            className="w-full min-w-[16rem] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={selectedFeedId ?? ''}
            onChange={handleFeedChange}
            disabled={feedList.isLoading || feedList.isFetching || (!hasFeeds && feedList.isSuccess)}
          >
            <option value="">{t('posts.filters.feedAll', 'All feeds')}</option>
            {feeds.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {resolveFeedLabel(feed, t)}
              </option>
            ))}
          </select>
          {feedList.isError ? (
            <p className="text-xs text-danger">
              {t('posts.filters.error', 'Could not load your feeds. Try refreshing the page.')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {isSyncing || isFetching ? (
            <span className="text-xs text-muted-foreground">{t('posts.messages.syncing', 'Syncing...')}</span>
          ) : null}
          {refreshError || cleanupError ? (
            <span className="text-xs text-danger">
              {t('posts.errors.partial', 'Some operations finished with errors.')}
            </span>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => runSequence({ resetPagination: true })}
            disabled={isSyncing}
          >
            {isSyncing ? t('posts.actions.refreshing', 'Refreshing...') : t('posts.actions.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      {refreshError ? (
        <ErrorState
          title={t('posts.errors.refresh', 'Could not refresh your feeds.')}
          description={refreshError}
          action={
            <button
              type="button"
              className="mt-3 inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => runSequence()}
              disabled={isSyncing}
            >
              {t('actions.tryAgain', 'Try again')}
            </button>
          }
        />
      ) : null}

      {cleanupError ? (
        <ErrorState
          title={t('posts.errors.cleanup', 'Could not clean old articles.')}
          description={cleanupError}
          action={
            <button
              type="button"
              className="mt-3 inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => runSequence()}
              disabled={isSyncing}
            >
              {t('actions.tryAgain', 'Try again')}
            </button>
          }
        />
      ) : null}

      {cleanupResult ? (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          {t('posts.cleanup.description', 'Removed {{articles}} articles and {{posts}} posts older than seven days.', {
            articles: formatNumber(cleanupResult.removedArticles, locale),
            posts: formatNumber(cleanupResult.removedPosts, locale),
          })}
        </div>
      ) : null}

      {refreshSummary && !isSummaryDismissed ? (
        <section className="card space-y-4 px-6 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('posts.summary.title', 'Refresh summary')}</h2>
              <p className="text-xs text-muted-foreground">
                {t('posts.summary.executedAt', 'Executed at {{date}}', {
                  date: formatDate(refreshSummary.now, locale),
                })}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
              onClick={() => setIsSummaryDismissed(true)}
            >
              {t('posts.summary.dismiss', 'Dismiss summary')}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaryMetricCards.map((metric) => (
              <div key={metric.key} className="rounded-md border border-border/70 bg-muted/30 px-3 py-3">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {metric.label}
                </p>
                <p className="text-lg font-semibold text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>

          {summaryHasPartialErrors ? (
            <p className="text-xs text-warning">
              {t('posts.summary.partialError', 'Some feeds returned errors during the refresh.')}
            </p>
          ) : null}

          {summaryFeeds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('posts.summary.empty', 'No feed was processed during the latest refresh.')}
            </p>
          ) : (
            <ul className="space-y-4">
              {summaryFeeds.map((summary) => {
                let statusLabel: string;
                let statusClassName: string;

                if (summary.error) {
                  statusLabel = t('posts.summary.feedStatus.error', 'Error');
                  statusClassName = 'border-danger/40 bg-danger/10 text-danger';
                } else if (summary.skippedByCooldown) {
                  statusLabel = t('posts.summary.feedStatus.skipped', 'Skipped');
                  statusClassName = 'border-warning/40 bg-warning/10 text-warning';
                } else {
                  statusLabel = t('posts.summary.feedStatus.ok', 'Updated');
                  statusClassName = 'border-primary/40 bg-primary/10 text-primary';
                }
                const metrics = [
                  {
                    key: 'itemsRead',
                    label: t('posts.summary.itemsRead', 'Items read'),
                    value: formatNumber(summary.itemsRead, locale),
                  },
                  {
                    key: 'itemsWithinWindow',
                    label: t('posts.summary.itemsWithinWindow', 'Items within window'),
                    value: formatNumber(summary.itemsWithinWindow, locale),
                  },
                  {
                    key: 'articlesCreated',
                    label: t('posts.summary.articlesCreated', 'Articles created'),
                    value: formatNumber(summary.articlesCreated, locale),
                  },
                  {
                    key: 'duplicates',
                    label: t('posts.summary.duplicates', 'Duplicates'),
                    value: formatNumber(summary.duplicates, locale),
                  },
                  {
                    key: 'invalidItems',
                    label: t('posts.summary.invalidItems', 'Invalid entries'),
                    value: formatNumber(summary.invalidItems, locale),
                  },
                ];

                return (
                  <li key={summary.feedId} className="rounded-md border border-border px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">{buildSummaryTitle(summary, t)}</h3>
                {summary.skippedByCooldown ? (
                  <p className="text-xs text-warning">
                    {t('posts.summary.skippedByCooldown', 'Skipped by cooldown window.')}
                    {summary.cooldownSecondsRemaining === null || summary.cooldownSecondsRemaining === undefined
                      ? ''
                      : ` ${t('posts.summary.cooldownRemaining', 'Cooldown remaining: {{seconds}}s', {
                          seconds: formatNumber(summary.cooldownSecondsRemaining, locale),
                        })}`}
                  </p>
                ) : null}
                      </div>
                      <span
                        className={`inline-flex items-center justify-center rounded-full border px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide ${statusClassName}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                      {metrics.map((metric) => (
                        <div
                          key={metric.key}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
                        >
                          <dt className="font-medium text-foreground">{metric.label}</dt>
                          <dd>{metric.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {summary.error ? (
                      <p className="mt-2 text-xs text-danger">
                        {t('posts.summary.error', 'Error: {{message}}', { message: summary.error })}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <PostListContent
        expandedSections={expandedSections}
        hasExecutedSequence={hasExecutedSequence}
        hasFeeds={hasFeeds}
        hasPreviousPage={previousCursors.length > 0}
        isError={isError}
        isLoading={isLoading}
        isSyncing={isSyncing}
        listErrorMessage={listErrorMessage}
        locale={locale}
        nextCursor={nextCursor}
        onNextPage={handleNextPage}
        onPreviousPage={handlePreviousPage}
        onToggleSection={toggleSection}
        onTryAgain={() => runSequence()}
        posts={posts}
        selectedFeedId={selectedFeedId}
        t={t}
        currentPage={currentPage}
        feedListIsSuccess={feedList.isSuccess}
      />
    </div>
  );
};

type PostListContentProps = {
  expandedSections: ExpandedSections;
  hasExecutedSequence: boolean;
  hasFeeds: boolean;
  hasPreviousPage: boolean;
  isError: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  listErrorMessage?: string;
  locale: ReturnType<typeof useLocale>;
  nextCursor: string | null;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onToggleSection: (id: number, section: 'post' | 'article') => void;
  onTryAgain: () => void;
  posts: PostListItem[];
  selectedFeedId: number | null;
  t: TranslateFunction;
  currentPage: number;
  feedListIsSuccess: boolean;
};

const PostListContent = ({
  expandedSections,
  hasExecutedSequence,
  hasFeeds,
  isError,
  isLoading,
  isSyncing,
  hasPreviousPage,
  listErrorMessage,
  locale,
  nextCursor,
  onNextPage,
  onPreviousPage,
  onToggleSection,
  onTryAgain,
  posts,
  selectedFeedId,
  t,
  currentPage,
  feedListIsSuccess,
}: PostListContentProps): JSX.Element => {
  if (!hasExecutedSequence) {
    return (
      <div className="card space-y-3 px-6 py-6">
        <LoadingSkeleton className="h-5" />
        <LoadingSkeleton className="h-5" />
        <LoadingSkeleton className="h-5" />
      </div>
    );
  }

  if (!hasFeeds && feedListIsSuccess) {
    return (
      <EmptyState
        title={t('posts.filters.empty.title', 'No feed available yet.')}
        description={t(
          'posts.filters.empty.description',
          'Add feeds on the Feeds page to start generating posts.',
        )}
        action={
          <a
            href="/feeds"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            {t('posts.filters.empty.cta', 'Manage feeds')}
          </a>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <div className="card space-y-3 px-6 py-6">
        <LoadingSkeleton className="h-5" />
        <LoadingSkeleton className="h-5" />
        <LoadingSkeleton className="h-5" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t('posts.errors.list', 'Could not load posts. Try again later.')}
        description={listErrorMessage}
        action={
          <button
            type="button"
            className="mt-4 inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onTryAgain}
            disabled={isSyncing}
          >
            {t('actions.tryAgain', 'Try again')}
          </button>
        }
      />
    );
  }

  if (posts.length === 0) {
    const emptyTitleKey = selectedFeedId
      ? 'posts.list.empty.filtered.title'
      : 'posts.list.empty.default.title';
    const emptyDescriptionKey = selectedFeedId
      ? 'posts.list.empty.filtered.description'
      : 'posts.list.empty.default.description';

    return (
      <EmptyState
        title={t(emptyTitleKey, selectedFeedId ? 'No posts for this feed.' : 'No recent posts.')}
        description={t(
          emptyDescriptionKey,
          selectedFeedId
            ? 'Select another feed or refresh to get new posts.'
            : 'Posts from the last seven days will appear here after a refresh.',
        )}
      />
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((item) => {
        const sectionState = expandedSections[item.id] ?? createDefaultSectionState();
        const postContentId = `post-content-${item.id}`;
        const articleContentId = `article-content-${item.id}`;
        const feedLabel = resolveArticleFeedLabel(item.feed, t);

        return (
          <article key={item.id} className="card space-y-4 px-6 py-6">
            <header className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
              <p className="text-xs text-muted-foreground">
                {t('posts.list.metadata.publishedAt', 'Published {{date}}', {
                  date: formatDate(item.publishedAt, locale),
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('posts.list.metadata.feed', 'Feed: {{feed}}', { feed: feedLabel })}
              </p>
              {item.post?.createdAt ? (
                <p className="text-xs text-muted-foreground">
                  {t('posts.list.metadata.createdAt', 'Generated {{date}}', {
                    date: formatDate(item.post.createdAt, locale),
                  })}
                </p>
              ) : null}
            </header>
            <section className="space-y-2">
              <button
                type="button"
                aria-expanded={sectionState.post}
                aria-controls={postContentId}
                className="flex w-full items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted"
                onClick={() => onToggleSection(item.id, 'post')}
              >
                {t('posts.list.sections.post', 'Post')}
                <span aria-hidden="true">{sectionState.post ? '−' : '+'}</span>
              </button>
              {sectionState.post ? (
                <div id={postContentId} className="rounded-md border border-border bg-background px-4 py-4 text-sm text-foreground">
                  {item.post?.content ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{item.post.content}</p>
                  ) : (
                    <p className="text-muted-foreground">{t('posts.list.postUnavailable', 'Post not available yet.')}</p>
                  )}
                </div>
              ) : null}
            </section>
            <section className="space-y-2">
              <button
                type="button"
                aria-expanded={sectionState.article}
                aria-controls={articleContentId}
                className="flex w-full items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted"
                onClick={() => onToggleSection(item.id, 'article')}
              >
                {t('posts.list.sections.article', 'Article')}
                <span aria-hidden="true">{sectionState.article ? '−' : '+'}</span>
              </button>
              {sectionState.article ? (
                <div
                  id={articleContentId}
                  className="rounded-md border border-border bg-background px-4 py-4 text-sm leading-relaxed text-foreground"
                >
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.contentSnippet}</p>
                </div>
              ) : null}
            </section>
          </article>
        );
      })}

      <div className="flex items-center justify-between rounded-md border border-border bg-card px-6 py-4 text-sm text-muted-foreground">
        <div>{t('posts.pagination.page', 'Page {{page}}', { page: currentPage })}</div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onPreviousPage}
            disabled={!hasPreviousPage || isLoading || isSyncing}
          >
            {t('posts.pagination.previous', 'Previous')}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onNextPage}
            disabled={!nextCursor || isLoading || isSyncing}
          >
            {t('posts.pagination.next', 'Next')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostsPage;
