import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useNewsPostList } from '@/features/posts/hooks/useNewsPosts';
import { PostCard } from '@/features/posts/components/PostCard';
import { PostCardSkeleton } from '@/features/posts/components/PostCardSkeleton';

const SKELETON_COUNT = 6;

const buildSkeletons = () => Array.from({ length: SKELETON_COUNT }, (_, index) => <PostCardSkeleton key={index} />);

const NewsListPage = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t('news.list.metaTitle', 'lkdposts - Notícias');
  }, [t]);

  const postListQuery = useNewsPostList({ cursor: null, limit: 12, feedId: null });

  if (postListQuery.isLoading) {
    return (
      <section className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">
            {t('news.list.heading', 'Novidades geradas')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('news.list.subtitle', 'Veja os destaques das notícias processadas recentemente.')}
          </p>
        </header>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{buildSkeletons()}</div>
      </section>
    );
  }

  if (postListQuery.isError) {
    return (
      <section className="space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">
            {t('news.list.heading', 'Novidades geradas')}
          </h1>
        </header>
        <div className="rounded-3xl border border-border bg-card p-8 text-center">
          <p className="text-lg font-semibold text-foreground">
            {t('news.list.error.title', 'Não foi possível carregar os posts.')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('news.list.error.description', 'Verifique sua conexão e tente novamente.')}
          </p>
          <button
            type="button"
            onClick={() => {
              postListQuery.refetch().catch(() => {
                // erro tratado pelo estado da query
              });
            }}
            className="mt-6 inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            {t('news.list.error.retry', 'Tentar novamente')}
          </button>
        </div>
      </section>
    );
  }

  const items = postListQuery.data?.items ?? [];

  if (items.length === 0) {
    return (
      <section className="space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">
            {t('news.list.heading', 'Novidades geradas')}
          </h1>
        </header>
        <div className="rounded-3xl border border-border bg-card p-8 text-center">
          <p className="text-lg font-semibold text-foreground">
            {t('news.list.empty.title', 'Nenhum post encontrado.')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('news.list.empty.description', 'Atualize seus feeds para gerar novos posts.')}
          </p>
          <button
            type="button"
            onClick={() => {
              postListQuery.refetch().catch(() => {
                // erro tratado pelo estado da query
              });
            }}
            className="mt-6 inline-flex items-center rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
          >
            {t('news.list.empty.cta', 'Atualizar lista')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">
          {t('news.list.heading', 'Novidades geradas')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('news.list.subtitle', 'Veja os destaques das notícias processadas recentemente.')}
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <PostCard
            key={item.id}
            post={{
              id: item.id,
              title: item.title,
              noticia: item.html,
              contentSnippet: item.contentSnippet,
              link: item.link ?? undefined,
              publishedAt: item.publishedAt,
              author: item.author ?? undefined,
            }}
            detailHref={`/news/${item.id}`}
          />
        ))}
      </div>
    </section>
  );
};

export default NewsListPage;

