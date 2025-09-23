import { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import type { NewsPost, NewsPostList } from '@/features/posts/types/news';
import type { PostListResponse } from '@/features/posts/api/posts';
import { POSTS_QUERY_KEY } from '@/features/posts/api/posts';
import { mapToNewsPost } from '@/features/posts/types/news';

type LocationState = {
  post?: NewsPost;
};

const formatDate = (input?: string | null) => {
  if (!input) {
    return undefined;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.valueOf())) {
    return undefined;
  }

  return parsed.toISOString().slice(0, 10);
};

const isNewsPostList = (value: unknown): value is NewsPostList => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Array.isArray((value as NewsPostList).items);
};

const isPostListResponse = (value: unknown): value is PostListResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Array.isArray((value as PostListResponse).items);
};

const NewsDetailPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ postId: string }>();
  const queryClient = useQueryClient();
  const articleRef = useRef<HTMLDivElement | null>(null);

  const location = useLocation();
  const locationState = (location.state as LocationState | undefined)?.post;

  const postId = useMemo(() => {
    const raw = params.postId;
    if (!raw) {
      return null;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.postId]);

  const cachedPost = useMemo(() => {
    if (locationState) {
      return locationState;
    }

    const queries = queryClient.getQueriesData<unknown>({ queryKey: POSTS_QUERY_KEY });
    for (const [, data] of queries) {
      if (!data) {
        continue;
      }

      if (isNewsPostList(data)) {
        const match = data.items.find((item) => item.id === postId);
        if (match) {
          return match;
        }
        continue;
      }

      if (isPostListResponse(data)) {
        const match = data.items.find((item) => item.id === postId);
        if (match) {
          return mapToNewsPost(match);
        }
      }
    }

    return undefined;
  }, [locationState, postId, queryClient]);

  useEffect(() => {
    if (cachedPost?.title) {
      document.title = `${cachedPost.title} - lkdposts`;
    } else {
      document.title = t('news.detail.metaTitle', 'lkdposts - Notícia');
    }
  }, [cachedPost?.title, t]);

  useEffect(() => {
    const container = articleRef.current;
    if (!container) {
      return;
    }

    const anchors = container.querySelectorAll('a');
    anchors.forEach((anchor) => {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    });
  }, [cachedPost?.html]);

  if (!postId) {
    return (
      <section className="space-y-4">
        <p className="text-lg font-semibold text-foreground">
          {t('news.detail.invalid', 'Endereço inválido para a notícia.')}
        </p>
        <Link to="/news" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
          {t('news.detail.backToList', 'Voltar para a lista de posts')}
        </Link>
      </section>
    );
  }

  if (!cachedPost || !cachedPost.html) {
    return (
      <section className="space-y-4">
        <p className="text-lg font-semibold text-foreground">
          {t('news.detail.missing', 'Não encontramos os detalhes desta notícia.')}
        </p>
        <Link to="/news" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
          {t('news.detail.backToList', 'Voltar para a lista de posts')}
        </Link>
      </section>
    );
  }

  const publishedDate = formatDate(cachedPost.publishedAt);

  return (
    <section className="space-y-6">
      <button
        type="button"
        className="inline-flex items-center text-sm font-medium text-primary hover:underline"
        onClick={() => navigate(-1)}
      >
        {t('news.detail.back', 'Voltar')}
      </button>

      <header className="space-y-2">
        <h1 className="text-3xl font-display font-semibold leading-tight text-foreground">{cachedPost.title}</h1>
        {(publishedDate || cachedPost.author) && (
          <p className="text-sm text-muted-foreground">
            {publishedDate ? t('news.detail.publishedAt', 'Publicado em {{date}}', { date: publishedDate }) : null}
            {publishedDate && cachedPost.author ? ' • ' : null}
            {cachedPost.author ?? ''}
          </p>
        )}
        {cachedPost.link ? (
          <a
            href={cachedPost.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            {t('news.detail.original', 'Abrir notícia original')}
          </a>
        ) : null}
      </header>

      <div
        ref={articleRef}
        className="space-y-4 text-base leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_figure]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_p]:my-4"
        dangerouslySetInnerHTML={{ __html: cachedPost.html }}
      />
    </section>
  );
};

export default NewsDetailPage;

