import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

import { usePostPreview } from '../hooks/usePostPreview';

export type PostCardData = {
  id: number;
  title: string;
  noticia?: string | null;
  articleHtml?: string | null;
  contentSnippet?: string | null;
  link?: string | null;
  publishedAt?: string | null;
  author?: string | null;
};

type PostCardProps = {
  post: PostCardData;
  detailHref?: string;
};

const resolveInitials = (title: string, link?: string | null) => {
  if (link) {
    try {
      const hostname = new URL(link).hostname.replace(/^www\./, '');
      const segments = hostname.split('.');
      if (segments.length === 1) {
        return segments[0].slice(0, 3).toUpperCase();
      }

      const [first, second] = segments;
      return `${first.charAt(0)}${second?.charAt(0) ?? ''}`.toUpperCase();
    } catch {
      // ignore URL parsing failure and fallback to title
    }
  }

  const words = title.trim().split(/\s+/);
  if (words.length === 0) {
    return 'NP';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
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

export const PostCard = ({ post, detailHref }: PostCardProps) => {
  const preview = usePostPreview(post);
  const initials = resolveInitials(post.title, post.link);
  const publishedDate = formatDate(post.publishedAt);

  const TitleComponent = post.link
    ? (
        <a
          href={post.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lg font-semibold text-foreground transition hover:text-primary"
        >
          {post.title}
        </a>
      )
    : (
        <span className="text-lg font-semibold text-foreground">{post.title}</span>
      );

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:shadow-md">
      <div className="relative">
        {preview.imageUrl ? (
          <img
            src={preview.imageUrl}
            alt={`${post.title} - capa`}
            loading="lazy"
            decoding="async"
            className="aspect-video w-full rounded-3xl object-cover"
          />
        ) : (
          <div className="aspect-video w-full rounded-3xl bg-gradient-to-br from-muted via-muted/70 to-muted/40">
            <div className="flex h-full items-center justify-center">
              <span className="text-4xl font-bold tracking-wide text-muted-foreground/80">{initials}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-6">
        <h3 className="text-lg font-semibold text-foreground">{TitleComponent}</h3>
        <p
          className={clsx(
            'text-sm text-muted-foreground',
            '[display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden',
          )}
        >
          {preview.excerpt}
        </p>

        {(publishedDate || post.author) && (
          <div className="text-xs text-muted-foreground">
            <span>{publishedDate ?? ''}</span>
            {publishedDate && post.author ? <span className="mx-1">•</span> : null}
            {post.author ? <span>{post.author}</span> : null}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between">
          {detailHref ? (
            <Link
              to={detailHref}
              state={{ post }}
              className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
            >
              Ver notícia
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
};

