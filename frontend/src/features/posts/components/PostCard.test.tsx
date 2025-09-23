import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { PostCard, type PostCardData } from './PostCard';

const createPost = (override: Partial<PostCardData> = {}): PostCardData => ({
  id: override.id ?? 1,
  title: override.title ?? 'Título da notícia',
  noticia:
    override.noticia ??
    '<p>Primeiro parágrafo com conteúdo relevante.</p><figure><img src="https://example.com/image.jpg" /></figure>',
  contentSnippet: override.contentSnippet ?? 'Resumo alternativo da notícia.',
  link: override.link ?? 'https://example.com/article',
  publishedAt: override.publishedAt ?? '2025-02-18T00:00:00.000Z',
  author: override.author ?? 'Redação',
});

describe('PostCard', () => {
  it('renders the preview image when available', () => {
    const post = createPost();

    render(
      <MemoryRouter>
        <PostCard post={post} detailHref="/news/1" />
      </MemoryRouter>,
    );

    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    expect(image).toHaveAttribute('alt', expect.stringContaining(post.title));
  });

  it('falls back to initials when no image is available', () => {
    const post = createPost({ noticia: '<p>Conteúdo sem imagens.</p>', link: 'https://site.com/noticia' });

    render(
      <MemoryRouter>
        <PostCard post={post} detailHref="/news/1" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('SC')).toBeInTheDocument();
  });

  it('opens the canonical link in a new tab when clicking the title', () => {
    const post = createPost();

    render(
      <MemoryRouter>
        <PostCard post={post} detailHref="/news/1" />
      </MemoryRouter>,
    );

    const titleLink = screen.getByRole('link', { name: post.title });
    expect(titleLink).toHaveAttribute('href', post.link);
    expect(titleLink).toHaveAttribute('target', '_blank');
    expect(titleLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders metadata when available', () => {
    const post = createPost({ publishedAt: '2025-03-01T12:00:00.000Z', author: 'Equipe' });

    render(
      <MemoryRouter>
        <PostCard post={post} detailHref="/news/1" />
      </MemoryRouter>,
    );

    expect(screen.getByText('2025-03-01')).toBeInTheDocument();
    expect(screen.getByText('Equipe')).toBeInTheDocument();
  });
});

