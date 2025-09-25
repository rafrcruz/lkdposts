import type { ChangeEvent, Dispatch, JSX, SetStateAction } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

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
import { useAuth } from '@/features/auth/hooks/useAuth';
import { HttpError } from '@/lib/api/http';
import { formatDate, formatNumber, useLocale } from '@/utils/formatters';
import { useAppParams } from '@/features/app-params/hooks/useAppParams';
import { usePostsDiagnostics } from '@/features/posts/hooks/usePostsDiagnostics';

const PAGE_SIZE = 10;
const FEED_OPTIONS_LIMIT = 50;

type ExpandedSections = Record<number, { post: boolean; article: boolean }>;
type SectionState = ExpandedSections[number];

type RefreshOptions = {
  resetPagination?: boolean;
};

type SyncPostsHandler = (options?: RefreshOptions) => Promise<{ shouldRefetchList: boolean }>;

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

const useDocumentTitle = (title: string) => {
  useEffect(() => {
    document.title = title;
  }, [title]);
};

const useInitialSync = (hasExecutedSequence: boolean, syncPosts: SyncPostsHandler) => {
  useEffect(() => {
    if (hasExecutedSequence) {
      return;
    }

    syncPosts().catch(() => {
      // state updates inside syncPosts handle errors
    });
  }, [hasExecutedSequence, syncPosts]);
};

const useRefreshSummaryReset = (
  refreshSummary: RefreshSummary | null,
  setIsSummaryDismissed: Dispatch<SetStateAction<boolean>>,
) => {
  useEffect(() => {
    if (!refreshSummary) {
      return;
    }

    setIsSummaryDismissed(false);
  }, [refreshSummary, setIsSummaryDismissed]);
};

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

const formatCooldownTime = ({
  secondsRemaining,
  locale,
  t,
}: {
  secondsRemaining: number;
  locale: string;
  t: TranslateFunction;
}) => {
  const normalizedSeconds = Math.max(0, Math.round(secondsRemaining));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return t(
      'posts.summary.cooldownTime.minutesSeconds',
      '{{minutes}} min {{seconds}} s',
      {
        minutes: formatNumber(minutes, locale),
        seconds: formatNumber(seconds, locale),
      },
    );
  }

  if (minutes > 0) {
    return t('posts.summary.cooldownTime.minutes', '{{minutes}} min', {
      minutes: formatNumber(minutes, locale),
    });
  }

  return t('posts.summary.cooldownTime.seconds', '{{seconds}} s', {
    seconds: formatNumber(seconds, locale),
  });
};

const ARTICLE_BLOCK_SELECTOR = 'p,div,img,h1,h2,h3,ul,ol,li,figure,pre,code,blockquote';
const ARTICLE_BLOCK_REGEX = /<(p|div|img|h1|h2|h3|ul|ol|li|figure|pre|code|blockquote)\b/gi;
const ARTICLE_WEAK_CONTENT_MIN_LENGTH = 160;
const ARTICLE_LONG_CONTENT_THRESHOLD = 1200;
const ARTICLE_COLLAPSED_MAX_HEIGHT = 480;
const ARTICLE_EXCERPT_MAX_LENGTH = 320;

type ArticleAnalysis = {
  text: string;
  textLength: number;
  blockCount: number;
  isWeak: boolean;
};

const EMPTY_ARTICLE_ANALYSIS: ArticleAnalysis = {
  text: '',
  textLength: 0,
  blockCount: 0,
  isWeak: true,
};

const normaliseWhitespace = (input: string) => input.replaceAll(/\s+/g, ' ').trim();

const analyseArticleHtml = (html: string): ArticleAnalysis => {
  if (!html.trim()) {
    return EMPTY_ARTICLE_ANALYSIS;
  }

  if (typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.innerHTML = html;
    const textContent = normaliseWhitespace(container.textContent ?? '');
    const blockElements = container.querySelectorAll(ARTICLE_BLOCK_SELECTOR);
    const blockCount = blockElements.length;
    const isWeak = blockCount === 0 || textContent.length < ARTICLE_WEAK_CONTENT_MIN_LENGTH;

    return {
      text: textContent,
      textLength: textContent.length,
      blockCount,
      isWeak,
    };
  }

  const textContent = normaliseWhitespace(html.replaceAll(/<[^>]+>/g, ' '));
  const blockMatches = html.match(ARTICLE_BLOCK_REGEX);
  const blockCount = blockMatches?.length ?? 0;
  const isWeak = blockCount === 0 || textContent.length < ARTICLE_WEAK_CONTENT_MIN_LENGTH;

  return {
    text: textContent,
    textLength: textContent.length,
    blockCount,
    isWeak,
  };
};

const createExcerpt = (text: string, fallback?: string | null) => {
  const primarySource = text && text.trim().length > 0 ? text.trim() : fallback?.trim() ?? '';

  if (!primarySource) {
    return '';
  }

  if (primarySource.length <= ARTICLE_EXCERPT_MAX_LENGTH) {
    return primarySource;
  }

  return `${primarySource.slice(0, ARTICLE_EXCERPT_MAX_LENGTH).trimEnd()}…`;
};

type ArticleContentProps = {
  id: string;
  postId: number;
  html?: string | null;
  fallbackSnippet?: string | null;
  isAdmin: boolean;
  readMoreLabel: string;
  readLessLabel: string;
  partialAdminNotice: string;
  unavailableLabel: string;
};

const ensureAnchorAttributes = (anchor: HTMLAnchorElement) => {
  if (!anchor.getAttribute('target')) {
    anchor.setAttribute('target', '_blank');
  }

  const currentRel = anchor.getAttribute('rel') ?? '';
  const relTokens = new Set(currentRel.split(/\s+/).filter(Boolean));
  relTokens.add('noopener');
  relTokens.add('noreferrer');
  anchor.setAttribute('rel', Array.from(relTokens).join(' '));
};

const ensureImageAttributes = (image: HTMLImageElement) => {
  if (!image.getAttribute('loading')) {
    image.setAttribute('loading', 'lazy');
  }

  if (!image.getAttribute('decoding')) {
    image.setAttribute('decoding', 'async');
  }

  if (!image.getAttribute('alt')) {
    image.setAttribute('alt', '');
  }

  image.style.maxWidth = '100%';
  image.style.height = 'auto';
};

const enhanceArticleContent = (element: HTMLDivElement) => {
  for (const anchor of element.querySelectorAll<HTMLAnchorElement>('a')) {
    ensureAnchorAttributes(anchor);
  }

  for (const image of element.querySelectorAll<HTMLImageElement>('img')) {
    ensureImageAttributes(image);
  }
};

const ArticleContentComponent = ({
  id,
  postId,
  html,
  fallbackSnippet,
  isAdmin,
  readMoreLabel,
  readLessLabel,
  partialAdminNotice,
  unavailableLabel,
}: ArticleContentProps) => {
  const htmlValue = typeof html === 'string' ? html : '';
  const hasHtml = htmlValue.trim().length > 0;
  const analysis = useMemo(() => (hasHtml ? analyseArticleHtml(htmlValue) : EMPTY_ARTICLE_ANALYSIS), [htmlValue, hasHtml]);
  const shouldShowFallback = !hasHtml || analysis.isWeak;
  const excerpt = useMemo(() => createExcerpt(analysis.text, fallbackSnippet), [analysis.text, fallbackSnippet]);
  const shouldCollapse = useMemo(
    () =>
      !shouldShowFallback &&
      (analysis.textLength > ARTICLE_LONG_CONTENT_THRESHOLD || analysis.blockCount > 12),
    [analysis.blockCount, analysis.textLength, shouldShowFallback],
  );
  const [isCollapsed, setIsCollapsed] = useState(shouldCollapse);
  useEffect(() => {
    setIsCollapsed(shouldCollapse);
  }, [shouldCollapse, htmlValue]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isLoading = html === undefined;

  useEffect(() => {
    if (shouldShowFallback || isLoading) {
      return;
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    enhanceArticleContent(element);
  }, [htmlValue, isLoading, shouldShowFallback]);

  const htmlContainerId = `${id}-html`;

  if (isLoading) {
    return (
      <div
        id={id}
        data-post-id={postId}
        className="rounded-md border border-border bg-background px-4 py-4 text-sm leading-relaxed text-foreground"
      >
        <div className="space-y-3" aria-busy="true">
          <LoadingSkeleton className="h-4 w-1/3" />
          <LoadingSkeleton className="h-4 w-full" />
          <LoadingSkeleton className="h-4 w-5/6" />
          <LoadingSkeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (shouldShowFallback) {
    return (
      <div
        id={id}
        data-post-id={postId}
        className="rounded-md border border-border bg-background px-4 py-4 text-sm leading-relaxed text-foreground"
      >
        <div className="space-y-2">
          {excerpt ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">{excerpt}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{unavailableLabel}</p>
          )}
          {isAdmin ? <p className="text-xs text-muted-foreground">{partialAdminNotice}</p> : null}
        </div>
      </div>
    );
  }

  const collapsedStyle =
    shouldCollapse && isCollapsed
      ? {
          maxHeight: `${ARTICLE_COLLAPSED_MAX_HEIGHT}px`,
        }
      : undefined;

  const toggleButton = shouldCollapse ? (
    <div className="flex justify-end pt-2">
      <button
        type="button"
        className="text-xs font-semibold uppercase tracking-wide text-primary transition hover:text-primary/80"
        onClick={() => setIsCollapsed((current) => !current)}
        aria-expanded={!isCollapsed}
        aria-controls={htmlContainerId}
      >
        {isCollapsed ? readMoreLabel : readLessLabel}
      </button>
    </div>
  ) : null;

  return (
    <div
      id={id}
      data-post-id={postId}
      className="rounded-md border border-border bg-background px-4 py-4 text-sm leading-relaxed text-foreground"
    >
      <div className="space-y-3">
        <div
          id={htmlContainerId}
          ref={containerRef}
          className={clsx('article-content', {
            'article-content--collapsed': shouldCollapse && isCollapsed,
          })}
          style={collapsedStyle}
          dangerouslySetInnerHTML={{ __html: htmlValue }}
        />
        {toggleButton}
      </div>
    </div>
  );
};

const ArticleContent = memo(
  ArticleContentComponent,
  (previous, next) =>
    previous.id === next.id &&
    previous.postId === next.postId &&
    previous.html === next.html &&
    previous.fallbackSnippet === next.fallbackSnippet &&
    previous.isAdmin === next.isAdmin &&
    previous.readMoreLabel === next.readMoreLabel &&
    previous.readLessLabel === next.readLessLabel &&
    previous.partialAdminNotice === next.partialAdminNotice &&
    previous.unavailableLabel === next.unavailableLabel,
);

ArticleContent.displayName = 'ArticleContent';

const NETWORK_ERROR_KEYWORDS = ['network', 'timeout', 'failed to fetch', 'load failed'];

const createDefaultSectionState = (): SectionState => ({ post: true, article: false });

const mergeExpandedSections = (
  posts: PostListItem[],
  current: ExpandedSections,
): ExpandedSections => {
  const next = posts.reduce<ExpandedSections>((accumulator, item) => {
    accumulator[item.id] = current[item.id] ?? createDefaultSectionState();
    return accumulator;
  }, {});

  if (posts.some((item) => !Object.hasOwn(current, item.id))) {
    return next;
  }

  const currentIds = Object.keys(current);
  if (currentIds.length !== posts.length) {
    return next;
  }

  if (currentIds.some((id) => !Object.hasOwn(next, id))) {
    return next;
  }

  return current;
};

const shouldRefetchPostsList = ({
  wasExecutedBefore,
  resetPagination,
  previousCursor,
  previousCursorCount,
  windowChanged,
}: {
  wasExecutedBefore: boolean;
  resetPagination: boolean;
  previousCursor: string | null;
  previousCursorCount: number;
  windowChanged: boolean;
}) => {
  if (windowChanged) {
    return true;
  }

  if (!wasExecutedBefore) {
    return false;
  }

  if (!resetPagination) {
    return true;
  }

  return previousCursor === null && previousCursorCount === 0;
};

const aggregateRefreshSummary = (summary: RefreshSummary | null): RefreshAggregates | null => {
  if (!summary) {
    return null;
  }

  return summary.feeds.reduce<RefreshAggregates>(
    (accumulator, feedSummary) => ({
      itemsRead: accumulator.itemsRead + feedSummary.itemsRead,
      itemsWithinWindow: accumulator.itemsWithinWindow + feedSummary.itemsWithinWindow,
      articlesCreated: accumulator.articlesCreated + feedSummary.articlesCreated,
      duplicates: accumulator.duplicates + feedSummary.duplicates,
      invalidItems: accumulator.invalidItems + feedSummary.invalidItems,
      skippedFeeds: accumulator.skippedFeeds + (feedSummary.skippedByCooldown ? 1 : 0),
      errorFeeds: accumulator.errorFeeds + (feedSummary.error ? 1 : 0),
    }),
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { params: appParams } = useAppParams();
  const postsTimeWindowDays = appParams?.posts_time_window_days ?? 7;
  const refreshCooldownSeconds = appParams?.posts_refresh_cooldown_seconds ?? 3600;
  const pageTitle = t('posts.meta.title', 'lkdposts - Posts');

  useDocumentTitle(pageTitle);

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
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [cooldownRemainingSeconds, setCooldownRemainingSeconds] = useState(0);
  const [listWindowDays, setListWindowDays] = useState(postsTimeWindowDays);
  const [cooldownNotice, setCooldownNotice] = useState<string | null>(null);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

  const cooldownNoticeTimeoutRef = useRef<number | null>(null);
  const cooldownIntervalRef = useRef<number | null>(null);
  const fetchStartTimeRef = useRef<number | null>(null);

  const { metrics: diagnosticsMetrics, recordRefresh, recordCooldownBlock, recordFetchSuccess } = usePostsDiagnostics();
  const diagnosticsPanelId = 'posts-diagnostics-panel';

  useEffect(() => {
    Sentry.addBreadcrumb({
      category: 'posts',
      level: 'info',
      message: 'posts:view_opened',
    });
  }, []);

  const feedList = useFeedList({ cursor: null, limit: FEED_OPTIONS_LIMIT });
  const feedListData = feedList.data;
  const feeds: Feed[] = feedListData?.items ?? [];
  const totalFeeds: number = feedListData?.meta.total ?? 0;
  const hasFeeds = totalFeeds > 0;

  const postListQuery = usePostList({
    cursor,
    limit: PAGE_SIZE,
    feedId: selectedFeedId,
    windowDays: listWindowDays,
    enabled: hasExecutedSequence,
  });
  const postListData = postListQuery.data;
  const posts = useMemo<PostListItem[]>(() => postListData?.items ?? [], [postListData?.items]);
  const nextCursor: string | null = postListData?.meta.nextCursor ?? null;
  const isLoading = postListQuery.isLoading && !postListQuery.isFetched;
  const isError = postListQuery.isError;
  const isFetching = postListQuery.isFetching;
  const currentPage = previousCursors.length + 1;
  const isWindowPending = listWindowDays !== postsTimeWindowDays;

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
          windowChanged: isWindowPending,
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
      isWindowPending,
      previousCursors.length,
      refreshPostsAsync,
    ],
  );

  useInitialSync(hasExecutedSequence, syncPosts);

  useRefreshSummaryReset(refreshSummary, setIsSummaryDismissed);

  useEffect(() => {
    if (!hasExecutedSequence) {
      setListWindowDays(postsTimeWindowDays);
    }
  }, [hasExecutedSequence, postsTimeWindowDays]);

  useEffect(() => {
    if (!refreshSummary?.now) {
      return;
    }

    const timestamp = new Date(refreshSummary.now).getTime();
    if (Number.isNaN(timestamp)) {
      setLastRefreshAt(Date.now());
      return;
    }

    setLastRefreshAt(timestamp);
  }, [refreshSummary?.now]);

  useEffect(() => {
    if (cooldownIntervalRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }

    if (!lastRefreshAt || refreshCooldownSeconds <= 0) {
      setCooldownRemainingSeconds(0);
      return;
    }

    const computeRemaining = () => {
      const elapsedSeconds = (Date.now() - lastRefreshAt) / 1000;
      const remaining = Math.ceil(refreshCooldownSeconds - elapsedSeconds);
      const next = remaining > 0 ? remaining : 0;
      setCooldownRemainingSeconds(next);
      return next;
    };

    const initialRemaining = computeRemaining();

    if (initialRemaining <= 0 || typeof window === 'undefined') {
      return;
    }

    const intervalId = window.setInterval(() => {
      const next = computeRemaining();
      if (next <= 0 && cooldownIntervalRef.current !== null && typeof window !== 'undefined') {
        window.clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    }, 1000);

    cooldownIntervalRef.current = intervalId;

    return () => {
      if (cooldownIntervalRef.current !== null && typeof window !== 'undefined') {
        window.clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, [lastRefreshAt, refreshCooldownSeconds]);

  useEffect(() => {
    return () => {
      if (cooldownNoticeTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(cooldownNoticeTimeoutRef.current);
      }

      if (cooldownIntervalRef.current !== null && typeof window !== 'undefined') {
        window.clearInterval(cooldownIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!cooldownNotice) {
      if (cooldownNoticeTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(cooldownNoticeTimeoutRef.current);
        cooldownNoticeTimeoutRef.current = null;
      }
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    if (cooldownNoticeTimeoutRef.current !== null) {
      window.clearTimeout(cooldownNoticeTimeoutRef.current);
    }

    const timeoutId = window.setTimeout(() => {
      setCooldownNotice(null);
      cooldownNoticeTimeoutRef.current = null;
    }, 4000);

    cooldownNoticeTimeoutRef.current = timeoutId;

    return () => {
      if (typeof window !== 'undefined') {
        window.clearTimeout(timeoutId);
      }
      cooldownNoticeTimeoutRef.current = null;
    };
  }, [cooldownNotice]);

  const isCooldownActive = cooldownRemainingSeconds > 0;

  useEffect(() => {
    if (!isCooldownActive) {
      setCooldownNotice(null);
    }
  }, [isCooldownActive]);

  const runSequence = ({ resetPagination = false }: RefreshOptions = {}) => {
    if (isSyncing) {
      return;
    }

    const shouldForceReset = resetPagination || isWindowPending;
    const canBypassCooldown = !hasExecutedSequence;

    if (isCooldownActive && !canBypassCooldown) {
      recordCooldownBlock();

      Sentry.addBreadcrumb({
        category: 'posts',
        level: 'info',
        message: 'posts:cooldown_blocked',
        data: { remaining_seconds: cooldownRemainingSeconds },
      });

      const timeLabel = formatCooldownTime({
        secondsRemaining: cooldownRemainingSeconds,
        locale,
        t,
      });

      setCooldownNotice(
        t('posts.actions.refreshCooldown', 'Wait {{time}} before refreshing again.', {
          time: timeLabel,
        }),
      );

      return;
    }

    Sentry.addBreadcrumb({
      category: 'posts',
      level: 'info',
      message: 'posts:refresh_clicked',
      data: {
        reset_pagination: shouldForceReset,
        window_days: postsTimeWindowDays,
      },
    });

    recordRefresh();

    syncPosts({ resetPagination: shouldForceReset })
      .then(({ shouldRefetchList }) => {
        if (isWindowPending) {
          setListWindowDays(postsTimeWindowDays);
          return;
        }

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
    if (postListQuery.isFetching) {
      if (fetchStartTimeRef.current === null) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        fetchStartTimeRef.current = now;
      }
      return;
    }

    if (fetchStartTimeRef.current === null) {
      return;
    }

    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duration = Math.max(0, Math.round(endTime - fetchStartTimeRef.current));
    fetchStartTimeRef.current = null;

    if (postListQuery.isSuccess && postListQuery.data) {
      recordFetchSuccess(duration);
      Sentry.addBreadcrumb({
        category: 'posts',
        level: 'info',
        message: 'posts:fetch_success',
        data: {
          duration_ms: duration,
          item_count: postListQuery.data.items.length,
          window_days: listWindowDays,
        },
      });
      return;
    }

    if (postListQuery.isError && postListQuery.error) {
      Sentry.addBreadcrumb({
        category: 'posts',
        level: 'error',
        message: 'posts:fetch_error',
        data: {
          status: postListQuery.error.status ?? null,
          message: postListQuery.error.message,
        },
      });
    }
  }, [
    listWindowDays,
    postListQuery.data,
    postListQuery.error,
    postListQuery.isError,
    postListQuery.isFetching,
    postListQuery.isSuccess,
    recordFetchSuccess,
  ]);

  useEffect(() => {
    setExpandedSections((current) => mergeExpandedSections(posts, current));
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

  const summaryAggregates = useMemo<RefreshAggregates | null>(
    () => aggregateRefreshSummary(refreshSummary),
    [refreshSummary],
  );

  const formattedTimeWindowDays = useMemo(
    () => formatNumber(postsTimeWindowDays, locale),
    [locale, postsTimeWindowDays],
  );

  const itemsWithinWindowLabel = useMemo(
    () =>
      t('posts.summary.itemsWithinWindow', 'Items within < {{days}}d', {
        days: formattedTimeWindowDays,
      }),
    [formattedTimeWindowDays, t],
  );

  const cooldownMessage = useMemo(() => {
    if (!isCooldownActive) {
      return null;
    }

    const time = formatCooldownTime({
      secondsRemaining: cooldownRemainingSeconds,
      locale,
      t,
    });

    return t('posts.actions.refreshCooldown', 'Wait {{time}} before refreshing again.', {
      time,
    });
  }, [cooldownRemainingSeconds, isCooldownActive, locale, t]);

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
      label: itemsWithinWindowLabel,
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
            className={clsx(
              'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60',
              !isSyncing && isCooldownActive ? 'cursor-not-allowed opacity-60' : null,
            )}
            onClick={() => runSequence({ resetPagination: true })}
            disabled={isSyncing}
            aria-disabled={isSyncing || isCooldownActive}
          >
            {isSyncing ? t('posts.actions.refreshing', 'Refreshing...') : t('posts.actions.refresh', 'Refresh')}
          </button>
          {cooldownNotice ? (
            <span className="text-xs text-warning" role="status">
              {cooldownNotice}
            </span>
          ) : cooldownMessage ? (
            <span className="text-xs text-muted-foreground">{cooldownMessage}</span>
          ) : null}
        </div>
      </div>

      {refreshError ? (
        <ErrorState
          title={t('posts.errors.refresh', 'Could not refresh your feeds.')}
          description={refreshError}
          action={
            <button
              type="button"
              className={clsx(
                'mt-3 inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
                !isSyncing && isCooldownActive ? 'cursor-not-allowed opacity-60' : null,
              )}
              onClick={() => runSequence()}
              disabled={isSyncing}
              aria-disabled={isSyncing || isCooldownActive}
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
              className={clsx(
                'mt-3 inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
                !isSyncing && isCooldownActive ? 'cursor-not-allowed opacity-60' : null,
              )}
              onClick={() => runSequence()}
              disabled={isSyncing}
              aria-disabled={isSyncing || isCooldownActive}
            >
              {t('actions.tryAgain', 'Try again')}
            </button>
          }
        />
      ) : null}

      {cleanupResult ? (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          {t('posts.cleanup.description', 'Removed {{articles}} articles and {{posts}} posts older than {{days}} days.', {
            articles: formatNumber(cleanupResult.removedArticles, locale),
            posts: formatNumber(cleanupResult.removedPosts, locale),
            days: formattedTimeWindowDays,
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
                    label: itemsWithinWindowLabel,
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
                      : ` ${t('posts.summary.cooldownRemaining', 'Cooldown remaining: {{time}}.', {
                          time: formatCooldownTime({
                            secondsRemaining: summary.cooldownSecondsRemaining,
                            locale,
                            t,
                          }),
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

      {isAdmin ? (
        <section className="rounded-md border border-dashed border-border/70 bg-muted/30 px-4 py-3">
          <button
            type="button"
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            onClick={() => setIsDiagnosticsOpen((current) => !current)}
            aria-expanded={isDiagnosticsOpen}
            aria-controls={diagnosticsPanelId}
          >
            <span>{t('posts.diagnostics.title', 'Diagnostics (admin)')}</span>
            <span aria-hidden="true" className="text-lg leading-none text-foreground">
              {isDiagnosticsOpen ? '−' : '+'}
            </span>
          </button>
          {isDiagnosticsOpen ? (
            <dl id={diagnosticsPanelId} className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background px-3 py-2">
                <dt className="font-medium text-muted-foreground">
                  {t('posts.diagnostics.refreshCount', 'Refreshes (session)')}
                </dt>
                <dd className="font-mono text-foreground">
                  {formatNumber(diagnosticsMetrics.refreshCount, locale)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background px-3 py-2">
                <dt className="font-medium text-muted-foreground">
                  {t('posts.diagnostics.cooldownBlocks', 'Cooldown blocks (session)')}
                </dt>
                <dd className="font-mono text-foreground">
                  {formatNumber(diagnosticsMetrics.cooldownBlocks, locale)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background px-3 py-2">
                <dt className="font-medium text-muted-foreground">
                  {t('posts.diagnostics.avgFetchDuration', 'Avg fetch duration (ms, session)')}
                </dt>
                <dd className="font-mono text-foreground">
                  {`${formatNumber(diagnosticsMetrics.avgFetchDurationMs, locale)} ms`}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>
      ) : null}

      <PostListContent
        expandedSections={expandedSections}
        hasExecutedSequence={hasExecutedSequence}
        hasFeeds={hasFeeds}
        isAdmin={isAdmin}
        hasPreviousPage={previousCursors.length > 0}
        isError={isError}
        isLoading={isLoading}
        isSyncing={isSyncing}
        isCooldownActive={isCooldownActive}
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
        formattedTimeWindowDays={formattedTimeWindowDays}
      />
    </div>
  );
};

type PostListContentProps = {
  expandedSections: ExpandedSections;
  hasExecutedSequence: boolean;
  hasFeeds: boolean;
  isAdmin: boolean;
  hasPreviousPage: boolean;
  isError: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  isCooldownActive: boolean;
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
  formattedTimeWindowDays: string;
};

const PostListContent = ({
  expandedSections,
  hasExecutedSequence,
  hasFeeds,
  isAdmin,
  isError,
  isLoading,
  isSyncing,
  isCooldownActive,
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
  formattedTimeWindowDays,
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
            className={clsx(
              'mt-4 inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
              isCooldownActive ? 'cursor-not-allowed opacity-60' : null,
            )}
            onClick={onTryAgain}
            disabled={isSyncing}
            aria-disabled={isSyncing || isCooldownActive}
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
            : 'Posts from the last {{days}} days will appear here after a refresh.',
          selectedFeedId ? undefined : { days: formattedTimeWindowDays },
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
                <ArticleContent
                  id={articleContentId}
                  postId={item.id}
                  html={item.noticia}
                  fallbackSnippet={item.contentSnippet}
                  isAdmin={isAdmin}
                  readMoreLabel={t('posts.list.article.readMore', 'See more')}
                  readLessLabel={t('posts.list.article.readLess', 'See less')}
                  partialAdminNotice={t(
                    'posts.list.article.partialAdminNotice',
                    'This article looks partial. Review the feed extraction.',
                  )}
                  unavailableLabel={t(
                    'posts.list.article.unavailable',
                    'News content not available yet.',
                  )}
                />
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
