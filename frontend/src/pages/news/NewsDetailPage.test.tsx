import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';

import NewsDetailPage from './NewsDetailPage';
import i18n from '@/config/i18n';
import { POSTS_QUERY_KEY } from '@/features/posts/api/posts';
import type { NewsPost } from '@/features/posts/types/news';

const wrapperWithProviders = (ui: ReactElement, queryClient: QueryClient) =>
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </I18nextProvider>,
  );

const buildPost = (override: Partial<NewsPost> = {}): NewsPost => ({
  id: override.id ?? 1,
  title: override.title ?? 'Título completo da notícia',
  html:
    override.html ??
    '<p>Conteúdo detalhado com <a href="https://example.com" data-testid="inner-link">link interno</a>.</p>',
  link: override.link ?? 'https://example.com/noticia',
  publishedAt: override.publishedAt ?? '2025-02-21T00:00:00.000Z',
  author: override.author ?? 'Equipe',
  contentSnippet: override.contentSnippet ?? 'Resumo da notícia',
});

describe('NewsDetailPage', () => {
  it('renders the article html when provided via navigation state', () => {
    const queryClient = new QueryClient();
    const post = buildPost();

    wrapperWithProviders(
      <MemoryRouter initialEntries={[{ pathname: '/news/1', state: { post } }]}> 
        <Routes>
          <Route path="/news/:postId" element={<NewsDetailPage />} />
        </Routes>
      </MemoryRouter>,
      queryClient,
    );

    expect(screen.getByText(/Conteúdo detalhado com/i)).toBeInTheDocument();
    expect(screen.getByText(/Equipe/)).toBeInTheDocument();
  });

  it('falls back to cached data when available', () => {
    const queryClient = new QueryClient();
    const post = buildPost({ id: 2, title: 'Post em cache' });
    queryClient.setQueryData([...POSTS_QUERY_KEY, { cursor: null, limit: 12, feedId: null }], { items: [post] });

    wrapperWithProviders(
      <MemoryRouter initialEntries={['/news/2']}>
        <Routes>
          <Route path="/news/:postId" element={<NewsDetailPage />} />
        </Routes>
      </MemoryRouter>,
      queryClient,
    );

    expect(screen.getByText('Post em cache')).toBeInTheDocument();
    expect(screen.getByTestId('inner-link')).toHaveAttribute('target', '_blank');
  });

  it('shows a fallback message when no data is available', () => {
    const queryClient = new QueryClient();

    wrapperWithProviders(
      <MemoryRouter initialEntries={['/news/99']}>
        <Routes>
          <Route path="/news/:postId" element={<NewsDetailPage />} />
        </Routes>
      </MemoryRouter>,
      queryClient,
    );

    expect(screen.getByText(/não encontramos os detalhes/i)).toBeInTheDocument();
  });
});

