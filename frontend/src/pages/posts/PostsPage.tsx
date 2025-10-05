import type { ChangeEvent, Dispatch, JSX, MutableRefObject, SetStateAction } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import * as Sentry from '@sentry/react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

import { useCleanupPosts, usePostList, useRefreshPosts } from '@/features/posts/hooks/usePosts';
import type { PostListResponse } from '@/features/posts/api/posts';
import type {
  CleanupResult,
  PostGenerationProgress,
  PostListItem,
  RefreshFeedSummary,
  RefreshSummary,
} from '@/features/posts/types/post';
import { usePostRequestPreview } from '@/features/posts/hooks/usePostRequestPreview';
import type { PostRequestPreview } from '@/features/posts/types/post-preview';
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
import { fetchAdminOpenAiPreviewRaw, fetchRefreshProgress } from '@/features/posts/api/posts';

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

type CopyFeedback = { type: 'success' | 'error'; message: string } | null;

type PreviewRequestSummary = {
  status: number | 'network_error' | null;
  durationMs: number;
};

const PROGRESS_PHASE_FALLBACKS: Record<PostGenerationProgress['phase'], string> = {
  initializing: 'Preparing generation...',
  resolving_params: 'Loading configuration...',
  loading_prompts: 'Loading prompts...',
  collecting_articles: 'Collecting eligible news...',
  generating_posts: 'Generating posts...',
  finalizing: 'Finalizing generation...',
  completed: 'Generation completed.',
  failed: 'Generation failed.',
};

const RATE_LIMIT_ERROR_CODES = new Set(['rate_limit', 'rate_limit_exceeded']);
const RATE_LIMIT_BASE_DELAY_MS = 1500;
const RATE_LIMIT_MAX_DELAY_MS = 12000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

const extractRateLimitCode = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return RATE_LIMIT_ERROR_CODES.has(value) ? value : null;
  }

  if (value && typeof value === 'object') {
    const nested = value as Record<string, unknown>;
    for (const key of ['code', 'type', 'error']) {
      const match = extractRateLimitCode(nested[key]);
      if (match) {
        return match;
      }
    }
  }

  return null;
};

const hasRateLimitError = (record: Record<string, unknown>) => {
  for (const key of ['error', 'code', 'type']) {
    const match = extractRateLimitCode(record[key]);
    if (match) {
      return true;
    }
  }

  return false;
};

const parseRateLimitPayload = (payload: unknown): boolean => {
  if (!payload) {
    return false;
  }

  if (typeof payload === 'string') {
    try {
      return parseRateLimitPayload(JSON.parse(payload));
    } catch {
      return false;
    }
  }

  if (typeof payload !== 'object') {
    return false;
  }

  return hasRateLimitError(payload as Record<string, unknown>);
};

const isRateLimitHttpError = (error: HttpError) => {
  if (error.status === 429) {
    return true;
  }

  return parseRateLimitPayload(error.payload);
};

const getTimestamp = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  return false;
};

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
    if (refreshSummary === null) {
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

const parseDateValue = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
};

const resolvePostSortTimestamp = (item: PostListItem): number => {
  const candidates: Array<string | null | undefined> = [
    item.publishedAt,
    item.post?.createdAt ?? null,
    item.post?.generatedAt ?? null,
    item.post?.updatedAt ?? null,
  ];

  for (const candidate of candidates) {
    const timestamp = parseDateValue(candidate);

    if (timestamp !== null) {
      return timestamp;
    }
  }

  return 0;
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

const DEFAULT_PROGRESS_STATS = {
  totalEligible: null,
  processed: 0,
  percent: null,
  generated: 0,
  failed: 0,
  skipped: 0,
} as const;

const buildProgressStats = (progress: PostGenerationProgress | null) => {
  if (!progress) {
    return DEFAULT_PROGRESS_STATS;
  }

  const totalEligible = progress.eligibleCount ?? null;
  const processedRaw = progress.processedCount;
  const processed =
    totalEligible !== null && totalEligible >= 0 ? Math.min(processedRaw, totalEligible) : processedRaw;
  const percent =
    totalEligible && totalEligible > 0 ? Math.min(100, Math.round((processed / totalEligible) * 100)) : null;

  return {
    totalEligible,
    processed,
    percent,
    generated: progress.generatedCount,
    failed: progress.failedCount,
    skipped: progress.skippedCount,
  } as const;
};

const resolveProgressPhaseLabel = (progress: PostGenerationProgress | null, t: TranslateFunction) => {
  if (!progress) {
    return t('posts.progress.title', 'Generating posts');
  }

  const fallback = PROGRESS_PHASE_FALLBACKS[progress.phase];
  return t(`posts.progress.phase.${progress.phase}`, fallback);
};

const resolveProgressDetailText = ({
  progress,
  progressStats,
  t,
  locale,
}: {
  progress: PostGenerationProgress | null;
  progressStats: ReturnType<typeof buildProgressStats>;
  t: TranslateFunction;
  locale: ReturnType<typeof useLocale>;
}) => {
  if (!progress) {
    return t('posts.progress.waitingEligible', 'Waiting for eligible news...');
  }

  if (progressStats.totalEligible && progressStats.totalEligible > 0) {
    return t('posts.progress.processed', 'Processed {{processed}} of {{total}} news.', {
      processed: formatNumber(progressStats.processed, locale),
      total: formatNumber(progressStats.totalEligible, locale),
    });
  }

  if (progress.phase === 'collecting_articles') {
    return t('posts.progress.collecting', 'Collecting eligible news...');
  }

  if (
    progress.phase === 'resolving_params' ||
    progress.phase === 'loading_prompts' ||
    progress.phase === 'initializing'
  ) {
    return t('posts.progress.preparing', 'Preparing generation...');
  }

  return t('posts.progress.waitingEligible', 'Waiting for eligible news...');
};

const resolveProgressCurrentArticle = (progress: PostGenerationProgress | null, t: TranslateFunction) => {
  if (!progress?.currentArticleTitle) {
    return null;
  }

  return t('posts.progress.currentArticle', 'Current news: {{title}}', {
    title: progress.currentArticleTitle,
  });
};

const resolveProgressModelLabel = (progress: PostGenerationProgress | null, t: TranslateFunction) => {
  if (!progress?.modelUsed) {
    return null;
  }

  return t('posts.progress.model', 'Model: {{model}}', { model: progress.modelUsed });
};

type RateLimitState = {
  attempts: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
  active: boolean;
};

const clearRateLimitTimeout = (state: RateLimitState) => {
  if (state.timeoutId !== null) {
    globalThis.clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
};

const resetRateLimitState = (state: RateLimitState) => {
  state.active = false;
  state.attempts = 0;
  clearRateLimitTimeout(state);
};

const handleRateLimitFailure = ({
  state,
  t,
  setRefreshError,
  scheduleRetry,
}: {
  state: RateLimitState;
  t: TranslateFunction;
  setRefreshError: Dispatch<SetStateAction<string | null>>;
  scheduleRetry: () => void;
}) => {
  const nextAttempts = state.attempts + 1;
  state.attempts = nextAttempts;

  if (nextAttempts > RATE_LIMIT_MAX_ATTEMPTS) {
    resetRateLimitState(state);
    setRefreshError(
      t('posts.errors.rateLimited', 'OpenAI is receiving too many requests. Try again in a moment.'),
    );
    return 'exhausted' as const;
  }

  const delay = Math.min(RATE_LIMIT_BASE_DELAY_MS * 2 ** (nextAttempts - 1), RATE_LIMIT_MAX_DELAY_MS);
  state.active = true;

  setRefreshError(
    t('posts.errors.rateLimitedRetry', 'OpenAI is receiving too many requests. Trying again in {{seconds}}s.', {
      seconds: Math.max(1, Math.round(delay / 1000)),
    }),
  );

  clearRateLimitTimeout(state);
  state.timeoutId = globalThis.setTimeout(() => {
    state.timeoutId = null;
    scheduleRetry();
  }, delay);

  return 'scheduled' as const;
};

const clearIntervalRef = (ref: MutableRefObject<ReturnType<typeof setInterval> | null>) => {
  if (ref.current !== null) {
    globalThis.clearInterval(ref.current);
    ref.current = null;
  }
};

const clearTimeoutRef = (ref: MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
  if (ref.current !== null) {
    globalThis.clearTimeout(ref.current);
    ref.current = null;
  }
};

const abortControllerRef = (ref: MutableRefObject<AbortController | null>) => {
  if (ref.current) {
    ref.current.abort();
    ref.current = null;
  }
};

const handleListWindowReset = ({
  hasExecutedSequence,
  postsTimeWindowDays,
  setListWindowDays,
}: {
  hasExecutedSequence: boolean;
  postsTimeWindowDays: number;
  setListWindowDays: Dispatch<SetStateAction<number>>;
}) => {
  if (!hasExecutedSequence) {
    setListWindowDays(postsTimeWindowDays);
  }
};

const handleLastRefreshUpdate = ({
  refreshSummaryNow,
  setLastRefreshAt,
}: {
  refreshSummaryNow: string | null | undefined;
  setLastRefreshAt: Dispatch<SetStateAction<number | null>>;
}) => {
  if (!refreshSummaryNow) {
    return;
  }

  const timestamp = new Date(refreshSummaryNow).getTime();
  setLastRefreshAt(Number.isNaN(timestamp) ? Date.now() : timestamp);
};

const initializeCooldownTimer = ({
  lastRefreshAt,
  refreshCooldownSeconds,
  cooldownIntervalRef,
  setCooldownRemainingSeconds,
}: {
  lastRefreshAt: number | null;
  refreshCooldownSeconds: number;
  cooldownIntervalRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  setCooldownRemainingSeconds: Dispatch<SetStateAction<number>>;
}) => {
  clearIntervalRef(cooldownIntervalRef);

  if (!lastRefreshAt || refreshCooldownSeconds <= 0) {
    setCooldownRemainingSeconds(0);
    return undefined;
  }

  const computeRemaining = () => {
    const elapsedSeconds = (Date.now() - lastRefreshAt) / 1000;
    const remaining = Math.ceil(refreshCooldownSeconds - elapsedSeconds);
    const next = Math.max(remaining, 0);
    setCooldownRemainingSeconds(next);
    return next;
  };

  const initialRemaining = computeRemaining();
  if (initialRemaining <= 0) {
    return undefined;
  }

  const intervalId = globalThis.setInterval(() => {
    const next = computeRemaining();
    if (next <= 0) {
      clearIntervalRef(cooldownIntervalRef);
    }
  }, 1000);

  cooldownIntervalRef.current = intervalId;

  return () => {
    clearIntervalRef(cooldownIntervalRef);
  };
};

const handleCooldownCleanupOnUnmount = ({
  cooldownNoticeTimeoutRef,
  cooldownIntervalRef,
}: {
  cooldownNoticeTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  cooldownIntervalRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
}) => {
  clearTimeoutRef(cooldownNoticeTimeoutRef);
  clearIntervalRef(cooldownIntervalRef);
};

const handleCooldownNoticeEffect = ({
  cooldownNotice,
  cooldownNoticeTimeoutRef,
  setCooldownNotice,
}: {
  cooldownNotice: string | null;
  cooldownNoticeTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setCooldownNotice: Dispatch<SetStateAction<string | null>>;
}) => {
  if (cooldownNotice === null) {
    clearTimeoutRef(cooldownNoticeTimeoutRef);
    return undefined;
  }

  clearTimeoutRef(cooldownNoticeTimeoutRef);

  const timeoutId = globalThis.setTimeout(() => {
    setCooldownNotice(null);
    cooldownNoticeTimeoutRef.current = null;
  }, 4000);

  cooldownNoticeTimeoutRef.current = timeoutId;

  return () => {
    clearTimeoutRef(cooldownNoticeTimeoutRef);
  };
};

const clearCooldownNoticeWhenInactive = ({
  isCooldownActive,
  setCooldownNotice,
}: {
  isCooldownActive: boolean;
  setCooldownNotice: Dispatch<SetStateAction<string | null>>;
}) => {
  if (!isCooldownActive) {
    setCooldownNotice(null);
  }
};

const manageProgressPolling = ({
  isRefreshRunning,
  requestProgressUpdate,
  refreshProgressIntervalRef,
}: {
  isRefreshRunning: boolean;
  requestProgressUpdate: () => Promise<void>;
  refreshProgressIntervalRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
}) => {
  if (!isRefreshRunning) {
    clearIntervalRef(refreshProgressIntervalRef);
    return undefined;
  }

  let cancelled = false;

  const poll = async () => {
    if (cancelled) {
      return;
    }

    await requestProgressUpdate();
  };

  void poll();

  const intervalId = globalThis.setInterval(() => {
    void poll();
  }, 5000);

  refreshProgressIntervalRef.current = intervalId;

  return () => {
    cancelled = true;
    clearIntervalRef(refreshProgressIntervalRef);
  };
};

const handlePostListFetchEffect = ({
  postListQuery,
  fetchStartTimeRef,
  recordFetchSuccess,
  listWindowDays,
}: {
  postListQuery: UseQueryResult<PostListResponse, HttpError>;
  fetchStartTimeRef: MutableRefObject<number | null>;
  recordFetchSuccess: (duration: number) => void;
  listWindowDays: number;
}) => {
  if (postListQuery.isFetching) {
    if (fetchStartTimeRef.current === null) {
      const now = typeof globalThis.performance?.now === 'function'
        ? globalThis.performance.now()
        : Date.now();
      fetchStartTimeRef.current = now;
    }
    return;
  }

  if (fetchStartTimeRef.current === null) {
    return;
  }

  const endTime =
    typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now()
      : Date.now();
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
};

const handleCooldownBlocked = ({
  recordCooldownBlock,
  cooldownRemainingSeconds,
  locale,
  t,
  setCooldownNotice,
}: {
  recordCooldownBlock: () => void;
  cooldownRemainingSeconds: number;
  locale: ReturnType<typeof useLocale>;
  t: TranslateFunction;
  setCooldownNotice: Dispatch<SetStateAction<string | null>>;
}) => {
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
};

const resolveOperationErrorMessage = (error: unknown, t: ReturnType<typeof useTranslation>['t']) => {
  if (error instanceof HttpError) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('posts.refresh.error', {
        status: error.status,
        message: error.message,
        payload: error.payload,
      });
    }

    if (isRateLimitHttpError(error)) {
      return t('posts.errors.rateLimited', 'OpenAI is receiving too many requests. Try again in a moment.');
    }

    if (error.status === 422) {
      return t(
        'posts.errors.modelInvalid',
        'Select a supported model in Settings before trying again.',
      );
    }

    if (error.status === 504) {
      return t('posts.errors.timeout', 'The AI request timed out. Try again shortly.');
    }

    if ([500, 502, 503].includes(error.status)) {
      return t(
        'posts.errors.serviceUnavailable',
        'Our AI service is temporarily unavailable. Try again in a moment.',
      );
    }

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

const resolvePreviewErrorMessage = (error: unknown, t: ReturnType<typeof useTranslation>['t']) => {
  if (error instanceof HttpError) {
    return error.message;
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (NETWORK_ERROR_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      return t('posts.preview.errors.network', 'We could not load the preview. Check your connection and try again.');
    }

    return error.message;
  }

  return t('posts.preview.errors.generic', 'We could not load the preview. Try again.');
};

const PostsPage = () => {
  // NOSONAR: This page aggregates numerous data fetching, telemetry, and UX states; we plan a
  // dedicated effort to modularize it into focused hooks and subcomponents without altering
  // current behavior.
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
  const [isRefreshRunning, setIsRefreshRunning] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [refreshSummary, setRefreshSummary] = useState<RefreshSummary | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<PostGenerationProgress | null>(null);
  const [isSummaryDismissed, setIsSummaryDismissed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>({});
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [cooldownRemainingSeconds, setCooldownRemainingSeconds] = useState(0);
  const [listWindowDays, setListWindowDays] = useState(postsTimeWindowDays);
  const [cooldownNotice, setCooldownNotice] = useState<string | null>(null);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const previewMutation = usePostRequestPreview();
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewCopyFeedback, setPreviewCopyFeedback] = useState<CopyFeedback>(null);
  const [postCopyFeedbacks, setPostCopyFeedbacks] = useState<Record<number, CopyFeedback>>({});
  const [lastPreviewRequest, setLastPreviewRequest] = useState<number | null>(null);
  const [openAiPreviewRaw, setOpenAiPreviewRaw] = useState<string | null>(null);
  const [openAiPreviewError, setOpenAiPreviewError] = useState<string | null>(null);
  const [isOpenAiPreviewLoading, setIsOpenAiPreviewLoading] = useState(false);
  const [isOpenAiPrettyPrintEnabled, setIsOpenAiPrettyPrintEnabled] = useState(false);
  const [previewRequestSummary, setPreviewRequestSummary] = useState<PreviewRequestSummary | null>(null);

  const cooldownNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchStartTimeRef = useRef<number | null>(null);
  const previewRequestStartTimeRef = useRef<number | null>(null);
  const openAiPreviewControllerRef = useRef<AbortController | null>(null);
  const refreshProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProgressRequestInFlightRef = useRef(false);
  const rateLimitBackoffRef = useRef<{
    attempts: number;
    timeoutId: ReturnType<typeof setTimeout> | null;
    active: boolean;
  }>({
    attempts: 0,
    timeoutId: null,
    active: false,
  });

  const { metrics: diagnosticsMetrics, recordRefresh, recordCooldownBlock, recordFetchSuccess } = usePostsDiagnostics();
  const diagnosticsPanelId = 'posts-diagnostics-panel';

  useEffect(() => {
    Sentry.addBreadcrumb({
      category: 'posts',
      level: 'info',
      message: 'posts:view_opened',
    });
  }, []);

    useEffect(() => () => clearRateLimitTimeout(rateLimitBackoffRef.current), []);

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
  const posts = useMemo<PostListItem[]>(() => {
    if (!postListData?.items) {
      return [];
    }

    return [...postListData.items].sort(
      (first, second) => resolvePostSortTimestamp(second) - resolvePostSortTimestamp(first),
    );
  }, [postListData?.items]);
  const nextCursor: string | null = postListData?.meta.nextCursor ?? null;
  const isLoading = postListQuery.isLoading && !postListQuery.isFetched;
  const isError = postListQuery.isError;
  const isFetching = postListQuery.isFetching;
  const currentPage = previousCursors.length + 1;
  const isWindowPending = listWindowDays !== postsTimeWindowDays;

  const { mutateAsync: refreshPostsAsync } = useRefreshPosts();
  const { mutateAsync: cleanupPostsAsync } = useCleanupPosts();
  const progressStats = useMemo(() => buildProgressStats(refreshProgress), [refreshProgress]);

  const progressPhaseLabel = useMemo(
    () => resolveProgressPhaseLabel(refreshProgress, t),
    [refreshProgress, t],
  );

  const progressDetailText = useMemo(
    () => resolveProgressDetailText({ progress: refreshProgress, progressStats, t, locale }),
    [locale, progressStats, refreshProgress, t],
  );

  const progressCurrentArticle = useMemo(
    () => resolveProgressCurrentArticle(refreshProgress, t),
    [refreshProgress, t],
  );

  const progressModelLabel = useMemo(
    () => resolveProgressModelLabel(refreshProgress, t),
    [refreshProgress, t],
  );

  const progressMessage = refreshProgress?.message ?? null;
  const previewData: PostRequestPreview | null = previewMutation.data ?? null;
  const previewNewsPayload = previewData?.news_payload ?? null;
  const previewPrefix = previewData?.prompt_base ?? '';
  const previewHash = previewData?.prompt_base_hash ?? '';
  const previewModel = previewData?.model ?? null;
  const previewContext = previewNewsPayload?.context ?? '';
  const previewArticle = previewNewsPayload?.article ?? null;
  const previewFeedLabel = previewArticle ? resolveArticleFeedLabel(previewArticle.feed, t) : null;
  const previewPublishedAt = previewArticle?.publishedAt ? formatDate(previewArticle.publishedAt, locale) : null;
  const previewCombinedText = [previewPrefix, previewContext]
    .filter((segment) => typeof segment === 'string' && segment.trim().length > 0)
    .join('\n\n');
  const previewErrorMessage = previewMutation.error
    ? resolvePreviewErrorMessage(previewMutation.error, t)
    : null;
  const previewIsLoading = previewMutation.isPending;
  const previewRequestStatusLabel = useMemo(() => {
    if (!previewRequestSummary) {
      return null;
    }

    if (previewRequestSummary.status === 'network_error') {
      return 'Network error';
    }

    if (typeof previewRequestSummary.status === 'number') {
      return String(previewRequestSummary.status);
    }

    return '—';
  }, [previewRequestSummary]);
  const resetOpenAiPreviewState = useCallback(() => {
    setOpenAiPreviewRaw(null);
    setOpenAiPreviewError(null);
    setIsOpenAiPreviewLoading(false);
    setIsOpenAiPrettyPrintEnabled(false);
    setPreviewRequestSummary(null);
  }, []);
  const previewArticleId = previewArticle?.id;
  const previewRequestNewsId = useMemo(() => {
    if (typeof previewArticleId === 'number') {
      return previewArticleId;
    }

    if (typeof lastPreviewRequest === 'number') {
      return lastPreviewRequest;
    }

    return null;
  }, [lastPreviewRequest, previewArticleId]);
  const previewNewsIdLabel = useMemo(() => {
    if (typeof previewRequestNewsId === 'number') {
      return String(previewRequestNewsId);
    }

    if (lastPreviewRequest === null) {
      return t('posts.preview.newsIdAutomatic', 'Automatic selection');
    }

    return String(lastPreviewRequest);
  }, [lastPreviewRequest, previewRequestNewsId, t]);
  const openAiPreviewParsed = useMemo(() => {
    if (typeof openAiPreviewRaw !== 'string' || openAiPreviewRaw.length === 0) {
      return null;
    }

    try {
      return JSON.parse(openAiPreviewRaw);
    } catch {
      return null;
    }
  }, [openAiPreviewRaw]);
  const openAiPreviewDisplay = useMemo(() => {
    if (typeof openAiPreviewRaw !== 'string') {
      return '';
    }

    if (isOpenAiPrettyPrintEnabled && openAiPreviewParsed !== null) {
      return JSON.stringify(openAiPreviewParsed, null, 2);
    }

    return openAiPreviewRaw;
  }, [isOpenAiPrettyPrintEnabled, openAiPreviewParsed, openAiPreviewRaw]);
  const canPrettyPrintOpenAiPreview = openAiPreviewParsed !== null;
  const canRequestOpenAiPreview = typeof previewRequestNewsId === 'number';
  const openAiPreviewPlaceholder = isOpenAiPreviewLoading
    ? t('posts.preview.request.loading', 'Loading request...')
    : t(
        'posts.preview.request.placeholder',
        'Load the request preview to inspect the raw payload.',
      );

  useEffect(() => {
    if (canPrettyPrintOpenAiPreview || !isOpenAiPrettyPrintEnabled) {
      return;
    }

    setIsOpenAiPrettyPrintEnabled(false);
  }, [canPrettyPrintOpenAiPreview, isOpenAiPrettyPrintEnabled]);

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

  const handleOpenPreview = useCallback(
    async (newsId?: number) => {
      if (!isAdmin) {
        return;
      }

      setPreviewCopyFeedback(null);
      setLastPreviewRequest(typeof newsId === 'number' ? newsId : null);
      if (openAiPreviewControllerRef.current) {
        openAiPreviewControllerRef.current.abort();
        openAiPreviewControllerRef.current = null;
      }
      resetOpenAiPreviewState();
      previewMutation.reset();
      setIsPreviewModalOpen(true);

      try {
        await previewMutation.mutateAsync({ newsId });
      } catch (error) {
        if (error instanceof Error && process.env.NODE_ENV !== 'test') {
          console.warn('Failed to load post request preview', error);
        }
      }
    },
    [isAdmin, previewMutation, resetOpenAiPreviewState],
  );

  const handleClosePreview = useCallback(() => {
    setIsPreviewModalOpen(false);
    setPreviewCopyFeedback(null);
    if (openAiPreviewControllerRef.current) {
      openAiPreviewControllerRef.current.abort();
      openAiPreviewControllerRef.current = null;
    }
    resetOpenAiPreviewState();
    previewMutation.reset();
  }, [previewMutation, resetOpenAiPreviewState]);

  const schedulePostCopyFeedbackClear = useCallback((postId: number, feedback: CopyFeedback) => {
    if (feedback === null) {
      setPostCopyFeedbacks((previous) => {
        if (!(postId in previous)) {
          return previous;
        }

        const { [postId]: _removed, ...rest } = previous;
        return rest;
      });
      return;
    }

    const feedbackReference = feedback;
    setTimeout(() => {
      setPostCopyFeedbacks((previous) => {
        if (previous[postId] !== feedbackReference) {
          return previous;
        }

        const { [postId]: _ignored, ...rest } = previous;
        return rest;
      });
    }, 3000);
  }, []);

  const handleCopyPostContent = useCallback(
    async (postId: number, value: string | null | undefined) => {
      if (!value || value.trim().length === 0) {
        const feedback: CopyFeedback = {
          type: 'error',
          message: t('posts.preview.copyEmpty', 'Nothing to copy.'),
        };
        setPostCopyFeedbacks((previous) => ({ ...previous, [postId]: feedback }));
        schedulePostCopyFeedbackClear(postId, feedback);
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        const feedback: CopyFeedback = {
          type: 'error',
          message: t('posts.preview.copyUnsupported', 'Copy is not available in this browser.'),
        };
        setPostCopyFeedbacks((previous) => ({ ...previous, [postId]: feedback }));
        schedulePostCopyFeedbackClear(postId, feedback);
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        const feedback: CopyFeedback = {
          type: 'success',
          message: t('posts.preview.copySuccess', 'Copied to clipboard.'),
        };
        setPostCopyFeedbacks((previous) => ({ ...previous, [postId]: feedback }));
        schedulePostCopyFeedbackClear(postId, feedback);
      } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
          console.error('Failed to copy post content', error);
        }
        const feedback: CopyFeedback = {
          type: 'error',
          message: t('posts.preview.copyError', 'Copy failed. Copy manually.'),
        };
        setPostCopyFeedbacks((previous) => ({ ...previous, [postId]: feedback }));
        schedulePostCopyFeedbackClear(postId, feedback);
      }
    },
    [schedulePostCopyFeedbackClear, t],
  );

  const handleCopyPreviewContent = useCallback(
    async (value: string, successMessage: string) => {
      if (!value) {
        setPreviewCopyFeedback({
          type: 'error',
          message: t('posts.preview.copyEmpty', 'Nothing to copy.'),
        });
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        setPreviewCopyFeedback({
          type: 'error',
          message: t('posts.preview.copyUnsupported', 'Copy is not available in this browser.'),
        });
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        setPreviewCopyFeedback({ type: 'success', message: successMessage });
      } catch {
        setPreviewCopyFeedback({
          type: 'error',
          message: t('posts.preview.copyError', 'Copy failed. Copy manually.'),
        });
      }
    },
    [t],
  );

  const handleLoadOpenAiPreview = useCallback(async () => {
    if (!canRequestOpenAiPreview || typeof previewRequestNewsId !== 'number') {
      return;
    }

    const requestNewsId = previewRequestNewsId;
    const controller = new AbortController();
    if (openAiPreviewControllerRef.current) {
      openAiPreviewControllerRef.current.abort();
    }

    openAiPreviewControllerRef.current = controller;
    setIsOpenAiPreviewLoading(true);
    setOpenAiPreviewError(null);
    setOpenAiPreviewRaw(null);
    setIsOpenAiPrettyPrintEnabled(false);
    setPreviewRequestSummary(null);

    previewRequestStartTimeRef.current = getTimestamp();
    Sentry.addBreadcrumb({
      category: 'preview-request',
      level: 'info',
      message: 'Preview request started',
      data: { newsId: requestNewsId },
    });

    const resolveDuration = () => {
      const endTime = getTimestamp();
      const startTime = previewRequestStartTimeRef.current ?? endTime;
      previewRequestStartTimeRef.current = null;
      return Math.max(0, Math.round(endTime - startTime));
    };

    try {
      const raw = await fetchAdminOpenAiPreviewRaw({
        newsId: requestNewsId,
        signal: controller.signal,
      });
      const durationMs = resolveDuration();
      setPreviewRequestSummary({ status: 200, durationMs });
      Sentry.addBreadcrumb({
        category: 'preview-request',
        level: 'info',
        message: 'Preview request success',
        data: { status: 200, durationMs },
      });
      setOpenAiPreviewRaw(raw);
    } catch (error) {
      if (isAbortError(error)) {
        previewRequestStartTimeRef.current = null;
        return;
      }

      if (error instanceof HttpError) {
        const durationMs = resolveDuration();
        setPreviewRequestSummary({ status: error.status ?? null, durationMs });
        Sentry.addBreadcrumb({
          category: 'preview-request',
          level: 'error',
          message: 'Preview request error',
          data: { status: error.status ?? null, durationMs },
        });
        let payload = '';
        if (typeof error.payload === 'string') {
          payload = error.payload;
        } else if (error.payload !== undefined) {
          payload = JSON.stringify(error.payload);
        }
        setOpenAiPreviewRaw(payload);
      } else {
        const durationMs = resolveDuration();
        setPreviewRequestSummary({ status: 'network_error', durationMs });
        Sentry.addBreadcrumb({
          category: 'preview-request',
          level: 'error',
          message: 'Preview request network error',
          data: { durationMs },
        });
        const message = t(
          'posts.preview.request.errors.network',
          'Failed to call the API. Check the console for details.',
        );
        setOpenAiPreviewError(message);
        console.error('Failed to load OpenAI preview request', error);
      }
    } finally {
      if (openAiPreviewControllerRef.current === controller) {
        openAiPreviewControllerRef.current = null;
      }

      setIsOpenAiPreviewLoading(false);
    }
  }, [canRequestOpenAiPreview, previewRequestNewsId, t]);

  const requestProgressUpdate = useCallback(async () => {
    if (isProgressRequestInFlightRef.current) {
      return;
    }

    isProgressRequestInFlightRef.current = true;

    try {
      const status = await fetchRefreshProgress();
      setRefreshProgress(status);

      const rateLimitState = rateLimitBackoffRef.current;
      clearRateLimitTimeout(rateLimitState);

      if (rateLimitState.active) {
        rateLimitState.active = false;
        rateLimitState.attempts = 0;
        setRefreshError(null);
      } else {
        rateLimitState.attempts = 0;
      }
    } catch (error) {
      console.error('posts.refresh.progress.error', error);

      if (error instanceof HttpError && isRateLimitHttpError(error)) {
        const rateLimitState = rateLimitBackoffRef.current;
        const outcome = handleRateLimitFailure({
          state: rateLimitState,
          t,
          setRefreshError,
          scheduleRetry: () => {
            requestProgressUpdate().catch((retryError) => {
              console.error('posts.refresh.progress.retry.error', retryError);
            });
          },
        });

        if (outcome === 'scheduled') {
          return;
        }
      }

      const rateLimitState = rateLimitBackoffRef.current;
      resetRateLimitState(rateLimitState);
    } finally {
      isProgressRequestInFlightRef.current = false;
    }
  }, [t]);

  const syncPosts = useCallback(
    async ({ resetPagination = false }: RefreshOptions = {}) => {
      setRefreshError(null);
      setCleanupError(null);

      const previousCursorValue = cursor;
      const previousCursorCount = previousCursors.length;

      setIsSyncing(true);

      const wasExecutedBefore = hasExecutedSequence;

      try {
        setIsRefreshRunning(true);
        setRefreshProgress(null);
        requestProgressUpdate().catch((error) => {
          console.error("Failed to request progress update", error);
        });

        const refreshPromise = refreshPostsAsync();
        const cleanupPromise = cleanupPostsAsync();

        const [refreshResult, cleanupResultEntry] = await Promise.allSettled([
          refreshPromise,
          cleanupPromise,
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
        setIsRefreshRunning(false);
        setRefreshProgress(null);
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
      requestProgressUpdate,
      refreshPostsAsync,
    ],
  );

  useInitialSync(hasExecutedSequence, syncPosts);
    useEffect(
      () =>
        () => {
          abortControllerRef(openAiPreviewControllerRef);
          clearIntervalRef(refreshProgressIntervalRef);
        },
      [],
    );

  useRefreshSummaryReset(refreshSummary, setIsSummaryDismissed);

    useEffect(() => {
      handleListWindowReset({ hasExecutedSequence, postsTimeWindowDays, setListWindowDays });
    }, [hasExecutedSequence, postsTimeWindowDays]);

    useEffect(
      () =>
        manageProgressPolling({
          isRefreshRunning,
          requestProgressUpdate,
          refreshProgressIntervalRef,
        }),
      [isRefreshRunning, requestProgressUpdate],
    );

    useEffect(() => {
      handleLastRefreshUpdate({ refreshSummaryNow: refreshSummary?.now, setLastRefreshAt });
    }, [refreshSummary?.now]);

    useEffect(
      () =>
        initializeCooldownTimer({
          lastRefreshAt,
          refreshCooldownSeconds,
          cooldownIntervalRef,
          setCooldownRemainingSeconds,
        }),
      [lastRefreshAt, refreshCooldownSeconds],
    );

    useEffect(
      () =>
        () =>
          handleCooldownCleanupOnUnmount({
            cooldownNoticeTimeoutRef,
            cooldownIntervalRef,
          }),
      [],
    );

    useEffect(
      () =>
        handleCooldownNoticeEffect({
          cooldownNotice,
          cooldownNoticeTimeoutRef,
          setCooldownNotice,
        }),
      [cooldownNotice],
    );

    const isCooldownActive = cooldownRemainingSeconds > 0;

    useEffect(() => {
      clearCooldownNoticeWhenInactive({ isCooldownActive, setCooldownNotice });
    }, [isCooldownActive]);

    const runSequence = ({ resetPagination = false }: RefreshOptions = {}) => {
      if (isSyncing) {
        return;
      }

      const shouldForceReset = resetPagination || isWindowPending;
      const canBypassCooldown = hasExecutedSequence === false;

      if (isCooldownActive && !canBypassCooldown) {
        handleCooldownBlocked({
          recordCooldownBlock,
          cooldownRemainingSeconds,
          locale,
          t,
          setCooldownNotice,
        });
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

        if (shouldRefetchList) {
          postListQuery
            .refetch()
            .catch(() => {
              // error handled by query state
            });
        }
      })
      .catch(() => {
        // state updates inside syncPosts handle errors
      });
  };

      useEffect(() => {
        handlePostListFetchEffect({
          postListQuery,
          fetchStartTimeRef,
          recordFetchSuccess,
          listWindowDays,
        });
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
    if (nextCursor === null) {
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
    if (isCooldownActive === false) {
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

  const cooldownIndicator = useMemo<JSX.Element | null>(() => {
    if (cooldownNotice) {
      return (
        <output className="text-xs text-warning" aria-live="polite" aria-atomic="true">
          {cooldownNotice}
        </output>
      );
    }

    if (cooldownMessage) {
      return <span className="text-xs text-muted-foreground">{cooldownMessage}</span>;
    }

    return null;
  }, [cooldownMessage, cooldownNotice]);

  let previewContent: JSX.Element;
  if (previewIsLoading) {
    previewContent = (
      <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        {t('posts.preview.loading', 'Loading preview...')}
      </div>
    );
  } else if (previewErrorMessage) {
    previewContent = (
      <div className="space-y-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-4 text-sm text-danger">
        <p>{previewErrorMessage}</p>
        <div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
            onClick={() => handleOpenPreview(lastPreviewRequest ?? undefined)}
          >
            {t('posts.preview.retry', 'Try again')}
          </button>
        </div>
      </div>
    );
  } else {
    previewContent = (
      <>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t('posts.preview.prefixTitle', 'Prompts concatenated (prefix)')}
          </h3>
          <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
            {previewPrefix ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">{previewPrefix}</pre>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('posts.preview.prefixEmpty', 'No prompts enabled for this preview.')}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t('posts.preview.newsTitle', 'News payload')}
          </h3>
          {previewNewsPayload ? (
            <div className="space-y-3">
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('posts.preview.article.titleLabel', 'Title')}
                  </dt>
                  <dd className="mt-1 text-foreground">{previewArticle?.title ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('posts.preview.article.feedLabel', 'Feed')}
                  </dt>
                  <dd className="mt-1 text-foreground">{previewFeedLabel ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('posts.preview.article.publishedAt', 'Published at')}
                  </dt>
                  <dd className="mt-1 text-foreground">{previewPublishedAt ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('posts.preview.article.linkLabel', 'Link')}
                  </dt>
                  <dd className="mt-1 break-all text-foreground">
                    {previewArticle?.link ? (
                      <a
                        href={previewArticle.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {previewArticle.link}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('posts.preview.article.snippetLabel', 'Summary')}
                  </dt>
                  <dd className="mt-1 text-foreground">{previewArticle?.contentSnippet ?? '—'}</dd>
                </div>
              </dl>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
                {previewContext ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">{previewContext}</pre>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('posts.preview.newsEmpty', 'News content is not available for this preview.')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              {t('posts.preview.empty', 'No eligible news item is available for preview.')}
            </p>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t('posts.preview.request.title', 'OpenAI request payload')}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  checked={isOpenAiPrettyPrintEnabled && canPrettyPrintOpenAiPreview}
                  onChange={(event) => {
                    if (canPrettyPrintOpenAiPreview === false) {
                      return;
                    }

                    setIsOpenAiPrettyPrintEnabled(event.target.checked);
                  }}
                  disabled={!canPrettyPrintOpenAiPreview || !openAiPreviewRaw}
                />
                <span
                  className={
                    !canPrettyPrintOpenAiPreview || !openAiPreviewRaw ? 'text-muted-foreground' : undefined
                  }
                >
                  {t('posts.preview.request.prettyToggle', 'Pretty print (visual)')}
                </span>
              </label>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() =>
                  handleCopyPreviewContent(
                    openAiPreviewRaw ?? '',
                    t('posts.preview.request.copySuccess', 'Copied raw JSON to clipboard.'),
                  )
                }
                disabled={!openAiPreviewRaw || isOpenAiPreviewLoading}
              >
                {t('posts.preview.request.copyButton', 'Copy raw JSON')}
              </button>
            </div>
          </div>
          {openAiPreviewError ? (
            <p className="text-xs text-danger">{openAiPreviewError}</p>
          ) : null}
          {previewRequestSummary ? (
            <p className="text-xs text-gray-500">
              Status: {previewRequestStatusLabel} • Tempo: {previewRequestSummary.durationMs} ms
            </p>
          ) : null}
          <textarea
            value={openAiPreviewDisplay}
            readOnly
            aria-label={t('posts.preview.request.textareaLabel', 'OpenAI raw response')}
            placeholder={openAiPreviewPlaceholder}
            className="min-h-[15rem] w-full resize-none rounded-md border border-border bg-muted/20 p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </section>
      </>
    );
  }

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

      <div className="flex flex-col gap-4 rounded-md border border-border bg-card px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="feed-filter">
            {t('posts.filters.feedLabel', 'Filter by feed')}
          </label>
          <select
            id="feed-filter"
            className="w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:min-w-[16rem]"
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
        <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
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
              'inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto',
              !isSyncing && isCooldownActive ? 'cursor-not-allowed opacity-60' : null,
            )}
            onClick={() => runSequence({ resetPagination: true })}
            disabled={isSyncing}
            aria-disabled={isSyncing || isCooldownActive}
          >
            {isSyncing ? t('posts.actions.refreshing', 'Refreshing...') : t('posts.actions.refresh', 'Refresh')}
          </button>
          {isAdmin ? (
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              onClick={() => handleOpenPreview()}
              disabled={previewIsLoading}
              aria-disabled={previewIsLoading}
            >
              {previewIsLoading
                ? t('posts.preview.loadingShort', 'Loading preview...')
                : t('posts.preview.openButton', 'Post Request Preview')}
            </button>
          ) : null}
          {cooldownIndicator}
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
                'mt-3 inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto',
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
                'mt-3 inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto',
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

      {isRefreshRunning ? (
        <section className="card space-y-4 px-6 py-5">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('posts.progress.title', 'Generating posts')}
            </h2>
            <p className="text-base font-semibold text-foreground">{progressPhaseLabel}</p>
            {progressMessage ? (
              <p className="text-xs text-muted-foreground">{progressMessage}</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={clsx(
                  'h-full rounded-full bg-primary transition-all',
                  progressStats.percent === null ? 'w-1/3 animate-pulse' : null,
                )}
                style={
                  progressStats.percent === null
                    ? undefined
                    : { width: `${progressStats.percent}%` }
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">{progressDetailText}</p>
            {progressCurrentArticle ? (
              <p className="text-xs text-muted-foreground">{progressCurrentArticle}</p>
            ) : null}
            {progressModelLabel ? (
              <p className="text-xs text-muted-foreground">{progressModelLabel}</p>
            ) : null}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                {t('posts.progress.generatedCount', 'Generated: {{formattedCount}}', {
                  count: progressStats.generated,
                  formattedCount: formatNumber(progressStats.generated, locale),
                })}
              </span>
              <span>
                {t('posts.progress.failedCount', 'Failed: {{formattedCount}}', {
                  count: progressStats.failed,
                  formattedCount: formatNumber(progressStats.failed, locale),
                })}
              </span>
              <span>
                {t('posts.progress.skippedCount', 'Skipped (cooldown): {{formattedCount}}', {
                  count: progressStats.skipped,
                  formattedCount: formatNumber(progressStats.skipped, locale),
                })}
              </span>
            </div>
          </div>
        </section>
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
        onPreviewRequest={handleOpenPreview}
        isPreviewLoading={previewIsLoading}
        onCopyPostContent={handleCopyPostContent}
        copyFeedbacks={postCopyFeedbacks}
        posts={posts}
        selectedFeedId={selectedFeedId}
        t={t}
        currentPage={currentPage}
        feedListIsSuccess={feedList.isSuccess}
        formattedTimeWindowDays={formattedTimeWindowDays}
      />

      {isPreviewModalOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
              <div className="fixed inset-0 bg-background/80 backdrop-blur" aria-hidden="true" />
              <dialog
                aria-labelledby="post-request-preview-title"
                className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-4 overflow-hidden rounded-lg border border-border bg-background p-6 shadow-lg"
                aria-modal="true"
                open
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <h2 id="post-request-preview-title" className="text-lg font-semibold text-foreground">
                      {t('posts.preview.modalTitle', 'Post Request Preview')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'posts.preview.modalDescription',
                        'Inspect the concatenated prompts and the news payload before triggering OpenAI.',
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClosePreview}
                    className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    {t('posts.preview.close', 'Close')}
                  </button>
                </div>

                <dl className="grid gap-3 rounded-md border border-border px-4 py-3 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-muted-foreground">prompt_base_hash</dt>
                    <dd className="mt-1 font-mono break-all text-foreground">{previewHash || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('posts.preview.modelLabel', 'Model')}
                    </dt>
                    <dd className="mt-1 font-mono text-foreground">{previewModel ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('posts.preview.newsIdLabel', 'News ID')}
                    </dt>
                    <dd className="mt-1 font-mono text-foreground">{previewNewsIdLabel}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    {previewCopyFeedback?.type === 'success' ? (
                      <p className="text-primary">{previewCopyFeedback.message}</p>
                    ) : null}
                    {previewCopyFeedback?.type === 'error' ? (
                      <p className="text-danger">{previewCopyFeedback.message}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleLoadOpenAiPreview}
                      disabled={!canRequestOpenAiPreview || isOpenAiPreviewLoading}
                      aria-disabled={!canRequestOpenAiPreview || isOpenAiPreviewLoading}
                    >
                      {isOpenAiPreviewLoading ? (
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                          />
                          {t('posts.preview.request.loading', 'Loading request...')}
                        </span>
                      ) : (
                        t('posts.preview.request.button', 'Preview Request')
                      )}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => handleCopyPreviewContent(previewCombinedText, t('posts.preview.copySuccess', 'Copied to clipboard.'))}
                      disabled={previewIsLoading || previewCombinedText.length === 0}
                    >
                      {t('posts.preview.copyAll', 'Copy all')}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => handleCopyPreviewContent(previewPrefix, t('posts.preview.copySuccess', 'Copied to clipboard.'))}
                      disabled={previewIsLoading || previewPrefix.trim().length === 0}
                    >
                      {t('posts.preview.copyPrefix', 'Copy prefix')}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => handleCopyPreviewContent(previewContext, t('posts.preview.copySuccess', 'Copied to clipboard.'))}
                      disabled={previewIsLoading || previewContext.trim().length === 0}
                    >
                      {t('posts.preview.copyNews', 'Copy news')}
                    </button>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">{previewContent}</div>
              </dialog>
            </div>,
            document.body,
          )
        : null}
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
  onPreviewRequest?: (newsId?: number) => void;
  isPreviewLoading: boolean;
  onCopyPostContent: (postId: number, value: string | null | undefined) => void;
  copyFeedbacks: Record<number, CopyFeedback>;
  posts: PostListItem[];
  selectedFeedId: number | null;
  t: TranslateFunction;
  currentPage: number;
  feedListIsSuccess: boolean;
  formattedTimeWindowDays: string;
};

const renderSkeletonCard = () => (
  <div className="card space-y-3 px-6 py-6">
    <LoadingSkeleton className="h-5" />
    <LoadingSkeleton className="h-5" />
    <LoadingSkeleton className="h-5" />
  </div>
);

const renderListFallbackContent = ({
  hasExecutedSequence,
  feedListIsSuccess,
  hasFeeds,
  isLoading,
  isError,
  postsLength,
  t,
  listErrorMessage,
  isCooldownActive,
  isSyncing,
  onTryAgain,
  selectedFeedId,
  formattedTimeWindowDays,
}: {
  hasExecutedSequence: boolean;
  feedListIsSuccess: boolean;
  hasFeeds: boolean;
  isLoading: boolean;
  isError: boolean;
  postsLength: number;
  t: TranslateFunction;
  listErrorMessage?: string;
  isCooldownActive: boolean;
  isSyncing: boolean;
  onTryAgain: () => void;
  selectedFeedId: number | null;
  formattedTimeWindowDays: string;
}) => {
  const state = resolveListFallbackState({
    hasExecutedSequence,
    feedListIsSuccess,
    hasFeeds,
    isLoading,
    isError,
    postsLength,
  });

  switch (state) {
    case 'initial':
    case 'loading':
      return renderSkeletonCard();
    case 'no-feeds':
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
    case 'error':
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
    case 'empty':
      return renderEmptyListState({
        t,
        selectedFeedId,
        formattedTimeWindowDays,
      });
    default:
      return null;
  }
};

const resolveListFallbackState = ({
  hasExecutedSequence,
  feedListIsSuccess,
  hasFeeds,
  isLoading,
  isError,
  postsLength,
}: {
  hasExecutedSequence: boolean;
  feedListIsSuccess: boolean;
  hasFeeds: boolean;
  isLoading: boolean;
  isError: boolean;
  postsLength: number;
}) => {
  if (!hasExecutedSequence) {
    return 'initial' as const;
  }

  if (feedListIsSuccess && !hasFeeds) {
    return 'no-feeds' as const;
  }

  if (isLoading) {
    return 'loading' as const;
  }

  if (isError) {
    return 'error' as const;
  }

  if (postsLength === 0) {
    return 'empty' as const;
  }

  return 'none' as const;
};

const renderEmptyListState = ({
  t,
  selectedFeedId,
  formattedTimeWindowDays,
}: {
  t: TranslateFunction;
  selectedFeedId: number | null;
  formattedTimeWindowDays: string;
}) => {
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
};

type PostListItemCardProps = {
  item: PostListItem;
  sectionState: SectionState;
  postContentId: string;
  articleContentId: string;
  t: TranslateFunction;
  locale: ReturnType<typeof useLocale>;
  isAdmin: boolean;
  onPreviewRequest?: (newsId?: number) => void;
  isPreviewLoading: boolean;
  onToggleSection: (id: number, section: 'post' | 'article') => void;
  onCopyPostContent: (postId: number, value: string | null | undefined) => void;
  copyFeedback: CopyFeedback | null;
};

const PostListItemCard = ({
  item,
  sectionState,
  postContentId,
  articleContentId,
  t,
  locale,
  isAdmin,
  onPreviewRequest,
  isPreviewLoading,
  onToggleSection,
  onCopyPostContent,
  copyFeedback,
}: PostListItemCardProps) => {
  const feedLabel = resolveArticleFeedLabel(item.feed, t);

  return (
    <article key={item.id} className="card space-y-4 px-6 py-6">
      <header className="space-y-2 sm:flex sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-1">
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
        </div>
        {isAdmin && onPreviewRequest ? (
          <button
            type="button"
            className="mt-2 inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:mt-0"
            onClick={() => onPreviewRequest(item.id)}
            disabled={isPreviewLoading}
            aria-disabled={isPreviewLoading}
          >
            {t('posts.preview.rowAction', 'Preview')}
          </button>
        ) : null}
      </header>
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
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
          {item.post?.content ? (
            <button
              type="button"
              onClick={() => onCopyPostContent(item.id, item.post?.content)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background p-2 text-muted-foreground transition hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label={t('posts.list.copyPost', 'Copy post')}
              title={t('posts.list.copyPost', 'Copy post')}
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M9 9.75V6.75C9 5.64543 9.89543 4.75 11 4.75H17C18.1046 4.75 19 5.64543 19 6.75V16C19 17.1046 18.1046 18 17 18H14.25"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 8.25H13C14.1046 8.25 15 9.14543 15 10.25V18.25C15 19.3546 14.1046 20.25 13 20.25H7C5.89543 20.25 5 19.3546 5 18.25V10.25C5 9.14543 5.89543 8.25 7 8.25Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
        {sectionState.post ? (
          <div id={postContentId} className="rounded-md border border-border bg-background px-4 py-4 text-sm text-foreground">
            {item.post?.content ? (
              <p className="whitespace-pre-wrap leading-relaxed">{item.post.content}</p>
            ) : (
              <p className="text-muted-foreground">{t('posts.list.postUnavailable', 'Post not available yet.')}</p>
            )}
          </div>
        ) : null}
        {copyFeedback ? (
          <output
            aria-live="polite"
            aria-atomic="true"
            className={clsx('text-xs', copyFeedback.type === 'success' ? 'text-primary' : 'text-danger')}
          >
            {copyFeedback.message}
          </output>
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
            unavailableLabel={t('posts.list.article.unavailable', 'News content not available yet.')}
          />
        ) : null}
      </section>
    </article>
  );
};

type PostListPaginationProps = {
  currentPage: number;
  hasPreviousPage: boolean;
  nextCursor: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  t: TranslateFunction;
};

const PostListPagination = ({
  currentPage,
  hasPreviousPage,
  nextCursor,
  isLoading,
  isSyncing,
  onPreviousPage,
  onNextPage,
  t,
}: PostListPaginationProps) => (
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
);

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
  onPreviewRequest,
  isPreviewLoading,
  onCopyPostContent,
  copyFeedbacks,
  posts,
  selectedFeedId,
  t,
  currentPage,
  feedListIsSuccess,
  formattedTimeWindowDays,
}: PostListContentProps): JSX.Element => {
    const fallback = renderListFallbackContent({
      hasExecutedSequence,
      feedListIsSuccess,
      hasFeeds,
      isLoading,
      isError,
      postsLength: posts.length,
      t,
      listErrorMessage,
      isCooldownActive,
      isSyncing,
      onTryAgain,
      selectedFeedId,
      formattedTimeWindowDays,
    });

    if (fallback) {
      return fallback;
    }

    return (
      <div className="space-y-4">
        {posts.map((item) => {
          const sectionState = expandedSections[item.id] ?? createDefaultSectionState();
          const postContentId = `post-content-${item.id}`;
          const articleContentId = `article-content-${item.id}`;

          return (
            <PostListItemCard
              key={item.id}
              item={item}
              sectionState={sectionState}
              postContentId={postContentId}
              articleContentId={articleContentId}
              t={t}
              locale={locale}
              isAdmin={isAdmin}
              onPreviewRequest={onPreviewRequest}
              isPreviewLoading={isPreviewLoading}
              onToggleSection={onToggleSection}
              onCopyPostContent={onCopyPostContent}
              copyFeedback={copyFeedbacks[item.id] ?? null}
            />
          );
        })}

        <PostListPagination
          currentPage={currentPage}
          hasPreviousPage={hasPreviousPage}
          nextCursor={nextCursor}
          isLoading={isLoading}
          isSyncing={isSyncing}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
          t={t}
        />
      </div>
    );
  };

export default PostsPage;
