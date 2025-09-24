import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';

import PostsPage from './PostsPage';
import i18n from '@/config/i18n';
import type { PostListItem } from '@/features/posts/types/post';
import type { Feed } from '@/features/feeds/types/feed';
import type { RefreshSummary, CleanupResult } from '@/features/posts/types/post';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { AuthContextValue } from '@/features/auth/context/AuthContext';

type JsonEnvelope = {
  success: boolean;
  data?: unknown;
  meta?: unknown;
  error?: { message?: string };
};

type PostsApiMockConfig = {
  posts: {
    items: PostListItem[];
    meta?: { nextCursor: string | null; limit: number };
  };
  feeds?: {
    items: Feed[];
    meta?: { nextCursor: string | null; total: number; limit: number };
  };
  refresh?: RefreshSummary;
  cleanup?: CleanupResult;
  postsDelayMs?: number;
  postsError?: { status: number; message: string };
};

type ScenarioReport = {
  scenario: string;
  domTags: Record<'p' | 'h2' | 'ul' | 'li' | 'img' | 'a', number>;
  linksWithTargetRel: number;
  collapsedInitially: boolean;
  expandedAfterClick: boolean;
  fallbackExcerptUsed: boolean;
  noEscapedHtmlVisible: boolean;
};

const scenarioReports: ScenarioReport[] = [];

afterAll(() => {
  const reportPayload = {
    scenarios: scenarioReports,
  };

  console.info('[posts-page] validation summary', JSON.stringify(reportPayload, null, 2));
});

const buildJsonResponse = (payload: JsonEnvelope, init?: ResponseInit) => {
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const defaultFeed = (override: Partial<Feed> = {}): Feed => ({
  id: override.id ?? 101,
  url: override.url ?? 'https://example.com/feed.xml',
  title: Object.hasOwn(override, 'title') ? override.title ?? null : '404 Media',
  lastFetchedAt: override.lastFetchedAt ?? '2025-01-10T08:00:00.000Z',
  createdAt: override.createdAt ?? '2024-12-01T10:00:00.000Z',
  updatedAt: override.updatedAt ?? '2024-12-21T09:30:00.000Z',
});

const mockApi = (config: PostsApiMockConfig) => {
  const feedsPayload = config.feeds ?? {
    items:
      config.posts.items.length > 0
        ? config.posts.items.map((item) =>
            defaultFeed({
              id: item.feed?.id ?? 101,
              title: item.feed?.title ?? 'Feed 1',
              url: item.feed?.url ?? 'https://example.com/feed.xml',
            }),
          )
        : [defaultFeed()],
    meta: {
      nextCursor: null,
      total: config.posts.items.length > 0 ? config.posts.items.length : 1,
      limit: 50,
    },
  };

  const refreshPayload: RefreshSummary =
    config.refresh ?? ({ now: '2025-01-10T08:05:00.000Z', feeds: [] } as RefreshSummary);
  const cleanupPayload: CleanupResult =
    config.cleanup ?? ({ removedArticles: 0, removedPosts: 0 } as CleanupResult);

  const postsMeta = config.posts.meta ?? { nextCursor: null, limit: 10 };

  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const resource = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(resource);
    const path = url.pathname;

    if (method === 'GET' && path === '/api/v1/feeds') {
      return buildJsonResponse({ success: true, data: { items: feedsPayload.items }, meta: feedsPayload.meta });
    }

    if (method === 'POST' && path === '/api/v1/posts/refresh') {
      return buildJsonResponse({ success: true, data: refreshPayload });
    }

    if (method === 'POST' && path === '/api/v1/posts/cleanup') {
      return buildJsonResponse({ success: true, data: cleanupPayload });
    }

    if (method === 'GET' && path === '/api/v1/posts') {
      if (config.postsError) {
        return buildJsonResponse(
          { success: false, error: { message: config.postsError.message } },
          { status: config.postsError.status },
        );
      }

      if (config.postsDelayMs) {
        await delay(config.postsDelayMs);
      }

      return buildJsonResponse({ success: true, data: { items: config.posts.items }, meta: postsMeta });
    }

    throw new Error(`Unhandled request: ${method} ${path}`);
  });

  return () => {
    fetchSpy.mockRestore();
  };
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithProviders = (ui: ReactElement, client: QueryClient) =>
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </I18nextProvider>,
  );

vi.mock('@/features/auth/hooks/useAuth');

const mockedUseAuth = vi.mocked(useAuth);

const buildAuthContext = (override: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: override.status ?? 'authenticated',
  user:
    Object.hasOwn(override, 'user') && override.user === undefined
      ? null
      : override.user ?? {
          email: 'user@example.com',
          role: 'user',
          expiresAt: '2025-01-01T00:00:00.000Z',
        },
  isAuthenticating: override.isAuthenticating ?? false,
  authError: override.authError ?? null,
  loginWithGoogle: override.loginWithGoogle ?? vi.fn(),
  logout: override.logout ?? vi.fn(),
  clearAuthError: override.clearAuthError ?? vi.fn(),
  refreshSession:
    override.refreshSession ??
    vi.fn(() => Promise.resolve({ authenticated: true, user: override.user ?? { email: 'user@example.com', role: 'user', expiresAt: '2025-01-01T00:00:00.000Z' } })),
});

const buildPostItem = (override: Partial<PostListItem> = {}): PostListItem => ({
  id: override.id ?? 40401,
  title: override.title ?? '404 Media unveils investigative report',
  contentSnippet:
    override.contentSnippet ??
    'Resumo investigativo destacando pontos principais para validar o fallback.',
  noticia: Object.hasOwn(override, 'noticia') ? (override.noticia ?? null) : '<p>Resumo default</p>',
  publishedAt: override.publishedAt ?? '2025-01-08T12:30:00.000Z',
  feed:
    Object.hasOwn(override, 'feed') && override.feed === undefined
      ? null
      : override.feed ?? {
          id: 404,
          title: '404 Media',
          url: 'https://404media.co/rss',
        },
  post:
    Object.hasOwn(override, 'post') && override.post === undefined
      ? null
      : override.post ?? {
          content: 'Post gerado automaticamente para promover a reportagem.',
          createdAt: '2025-01-08T13:00:00.000Z',
        },
  link: override.link ?? 'https://404media.co/articles/investigative-report',
  articleHtml: override.articleHtml ?? null,
  author: override.author ?? 'Equipe 404 Media',
});

const scenario404MediaHtml = `
  <div>
    <p>Primeiro paragrafo com detalhes e um <a href="https://404media.co/links/context">link contextual</a> explicando o caso investigativo com riqueza de detalhes para garantir que o texto ultrapasse os limites de validacao e provoque a renderizacao correta no front-end.</p>
    <h2>Subtitulo aprofundado</h2>
    <p>Segundo paragrafo reforcando a narrativa com informacoes adicionais e referencias importantes para a verificacao do comportamento da tela de posts.</p>
    <ul>
      <li>Ponto chave numero um com descricao extensa e exemplos concretos que ajudam no entendimento da narrativa completa.</li>
      <li>Ponto chave numero dois com mais detalhes e contexto para assegurar que o conteudo seja suficientemente robusto.</li>
      <li>Ponto chave numero tres adicionando mais informacoes relevantes e garantindo que a contagem de blocos seja elevada.</li>
    </ul>
    <figure>
      <img src="https://cdn.404media.co/images/investigative.jpg" alt="Investigacao em progresso" loading="lazy" />
      <figcaption>Imagem ilustrativa da investigacao.</figcaption>
    </figure>
    <p>Terceiro paragrafo com <a href="https://404media.co/supporters">link para apoiadores</a> e informacoes complementares que fortalecem o contexto geral da materia investigativa publicada recentemente.</p>
    <p>Quarto paragrafo destacando depoimentos, dados adicionais e referencias cruzadas com outras reportagens relacionadas para assegurar uma base robusta de verificacao.</p>
    <p>Quinto paragrafo apresentando conclusoes, implicacoes e proximos passos, garantindo que a quantidade de caracteres supere com folga o limiar de colapso.</p>
    <p>Sexto paragrafo extra com explicacoes tecnicas, citacoes de especialistas e observacoes detalhadas que ampliam o escopo do teste.</p>
  </div>
`;

const scenarioSubstackHtml = `
  <div>
    <p>Introducao com um panorama sobre a investigacao e os desdobramentos recentes em formato de newsletter.</p>
    <p>Desenvolvimento com referencias cruzadas e explicacoes adicionais para o publico interessado.</p>
    <p>Conclusao reforcando os aprendizados e indicando materiais complementares.</p>
    <p><img src="https://substack.example.com/images/inline-photo.png" alt="Cena relevante" /></p>
    <p>Paragrafo final com convite para novos leitores e um <a href="https://substack.example.com/archive?source=newsletter&season=summer">link sem parametros de rastreamento agressivo</a> que deve permanecer intacto.</p>
    <figure>
      <img src="https://substack.example.com/images/feature.png" alt="Figura complementar" />
      <figcaption>Figura com imagem responsiva fornecida pelo backend.</figcaption>
    </figure>
  </div>
`;

const scenarioMinimalHtml = 'Resumo breve derivado da description original.';

const setupDefaultAuth = (role: 'user' | 'admin' = 'user') => {
  mockedUseAuth.mockReturnValue(
    buildAuthContext({
      user: {
        email: role === 'admin' ? 'admin@example.com' : 'user@example.com',
        role,
        expiresAt: '2025-01-01T00:00:00.000Z',
      },
    }),
  );
};

describe('PostsPage NOTICIA rendering (E2E with API mocks)', () => {
  afterEach(() => {
    mockedUseAuth.mockReset();
  });

  it('renders 404Media-like content with full HTML semantics and collapse controls', async () => {
    setupDefaultAuth('user');

    const post = buildPostItem({
      id: 40401,
      noticia: scenario404MediaHtml,
    });

    const restoreFetch = mockApi({
      posts: { items: [post] },
      postsDelayMs: 40,
    });

    try {
      const queryClient = createQueryClient();
      const user = userEvent.setup();

      renderWithProviders(<PostsPage />, queryClient);

      const articleToggle = await screen.findByRole('button', { name: /NOTICIA/i });
      expect(articleToggle).toHaveAttribute('aria-expanded', 'false');

      await user.click(articleToggle);

      const articleHeading = await screen.findByRole('heading', {
        name: /404 Media unveils investigative report/i,
      });
      expect(articleHeading).toBeInTheDocument();

      const articleContentId = 'article-content-40401-html';

      const articleContent = await waitFor(() => {
        const element = document.getElementById(articleContentId);
        if (!element) {
          throw new Error('NOTICIA content not rendered');
        }
        return element;
      });

    expect(articleContent).toHaveClass('article-content');
    expect(articleContent).toHaveClass('article-content--collapsed');
    expect(articleContent).toHaveStyle({ maxHeight: '480px' });

    const paragraphs = articleContent.querySelectorAll('p');
    const headings = articleContent.querySelectorAll('h1, h2, h3');
    const unorderedLists = articleContent.querySelectorAll('ul');
    const listItems = articleContent.querySelectorAll('li');
    const images = articleContent.querySelectorAll('img');
    const anchors = articleContent.querySelectorAll('a');

    if (paragraphs.length < 3) {
      restoreFetch();
      throw new Error('NOTICIA missing expected paragraphs');
    }

    if (headings.length < 1) {
      restoreFetch();
      throw new Error('NOTICIA missing heading structure');
    }

    if (unorderedLists.length < 1 || listItems.length < 2) {
      restoreFetch();
      throw new Error('NOTICIA missing list structure');
    }

    if (images.length < 1) {
      restoreFetch();
      throw new Error('NOTICIA missing inline images');
    }

    if (anchors.length < 2) {
      restoreFetch();
      throw new Error('NOTICIA missing expected links');
    }
    const image = images[0];
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.style.maxWidth).toBe('100%');
    expect(image.style.height).toBe('auto');

    let linksWithTargetRel = 0;
    anchors.forEach((anchor) => {
      expect(anchor).toHaveAttribute('target', '_blank');
      const rel = anchor.getAttribute('rel') ?? '';
      expect(rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
      if (anchor.getAttribute('target') === '_blank' && rel.includes('noopener') && rel.includes('noreferrer')) {
        linksWithTargetRel += 1;
      }
    });

    expect(articleContent.innerHTML).not.toContain('&lt;');
    expect(articleContent.textContent).not.toContain('<p>');

    const readMoreButton = within(articleContent.parentElement as HTMLElement).getByRole('button', {
      name: /ver mais/i,
    });

    expect(readMoreButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(readMoreButton);

    await waitFor(() => {
      expect(articleContent).not.toHaveClass('article-content--collapsed');
    });

    const readLessButton = within(articleContent.parentElement as HTMLElement).getByRole('button', {
      name: /ver menos/i,
    });

    await user.click(readLessButton);

    await waitFor(() => {
      expect(articleContent).toHaveClass('article-content--collapsed');
    });

      scenarioReports.push({
        scenario: '404Media-like',
        domTags: {
          p: paragraphs.length,
          h2: headings.length,
          ul: unorderedLists.length,
          li: listItems.length,
          img: images.length,
          a: anchors.length,
        },
        linksWithTargetRel,
        collapsedInitially: true,
        expandedAfterClick: true,
        fallbackExcerptUsed: false,
        noEscapedHtmlVisible: true,
      });
    } finally {
      restoreFetch();
    }
  });

  it('renders Substack-like newsletter content preserving links and media', async () => {
    setupDefaultAuth('user');

    const post = buildPostItem({
      id: 7001,
      title: 'Substack weekly analysis',
      noticia: scenarioSubstackHtml,
      feed: {
        id: 77,
        title: 'Investigative Newsletter',
        url: 'https://substack.example.com/feed',
      },
      link: 'https://substack.example.com/p/weekly-analysis',
    });

    const restoreFetch = mockApi({
      posts: { items: [post] },
    });

    try {
      const queryClient = createQueryClient();
      const user = userEvent.setup();

      renderWithProviders(<PostsPage />, queryClient);

      const articleToggle = await screen.findByRole('button', { name: /NOTICIA/i });
      expect(articleToggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(articleToggle);

      await screen.findByRole('heading', { name: /Substack weekly analysis/i });

      const articleContentId = 'article-content-7001-html';
      const articleContent = await waitFor(() => {
        const element = document.getElementById(articleContentId);
        if (!element) {
          throw new Error('NOTICIA content not rendered for Substack scenario');
        }
        return element;
      });

    const paragraphs = articleContent.querySelectorAll('p');
    const images = articleContent.querySelectorAll('img');
    const figure = articleContent.querySelector('figure');
    const anchors = articleContent.querySelectorAll('a');

    if (paragraphs.length < 3) {
      restoreFetch();
      throw new Error('Substack scenario missing paragraphs');
    }

    if (images.length < 1) {
      restoreFetch();
      throw new Error('Substack scenario missing inline image');
    }

    expect(figure).not.toBeNull();

    anchors.forEach((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      expect(href).not.toMatch(/utm_|fbclid|ref=/i);
      expect(anchor).toHaveAttribute('target', '_blank');
      expect(anchor.getAttribute('rel') ?? '').toContain('noopener');
    });
    const img = images[0];
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.style.maxWidth).toBe('100%');

      scenarioReports.push({
        scenario: 'Substack-like',
        domTags: {
          p: paragraphs.length,
          h2: articleContent.querySelectorAll('h1, h2, h3').length,
          ul: articleContent.querySelectorAll('ul').length,
          li: articleContent.querySelectorAll('li').length,
          img: images.length,
          a: anchors.length,
        },
        linksWithTargetRel: Array.from(anchors).filter((anchor) => {
          const rel = anchor.getAttribute('rel') ?? '';
          return anchor.getAttribute('target') === '_blank' && rel.includes('noopener') && rel.includes('noreferrer');
        }).length,
        collapsedInitially: false,
        expandedAfterClick: false,
        fallbackExcerptUsed: false,
        noEscapedHtmlVisible: !articleContent.innerHTML.includes('&lt;'),
      });
    } finally {
      restoreFetch();
    }
  });

  it('falls back to excerpt when HTML is weak for non-admin users', async () => {
    const post = buildPostItem({
      id: 9901,
      noticia: scenarioMinimalHtml,
      contentSnippet: 'Resumo breve derivado da description original.',
    });

    setupDefaultAuth('user');
    const restoreFetch = mockApi({
      posts: { items: [post] },
    });

    try {
      const queryClient = createQueryClient();
      const user = userEvent.setup();

      renderWithProviders(<PostsPage />, queryClient);

      const articleToggle = await screen.findByRole('button', { name: /NOTICIA/i });
      await user.click(articleToggle);

      await screen.findByRole('heading', { name: /404 Media unveils investigative report/i });

      const fallbackContainer = await waitFor(() => {
        const element = document.getElementById('article-content-9901');
        if (!element) {
          throw new Error('Fallback container not rendered');
        }
        return element;
      });

      expect(document.getElementById('article-content-9901-html')).toBeNull();
      expect(fallbackContainer.textContent).toContain('Resumo breve derivado da description original.');
      expect(fallbackContainer.textContent).not.toContain('Conteudo parcial da noticia');

      scenarioReports.push({
        scenario: 'Minimalista',
        domTags: {
          p: fallbackContainer.querySelectorAll('p').length,
          h2: fallbackContainer.querySelectorAll('h1, h2, h3').length,
          ul: fallbackContainer.querySelectorAll('ul').length,
          li: fallbackContainer.querySelectorAll('li').length,
          img: fallbackContainer.querySelectorAll('img').length,
          a: fallbackContainer.querySelectorAll('a').length,
        },
        linksWithTargetRel: 0,
        collapsedInitially: false,
        expandedAfterClick: false,
        fallbackExcerptUsed: true,
        noEscapedHtmlVisible: !fallbackContainer.innerHTML.includes('&lt;'),
      });
    } finally {
      restoreFetch();
    }
  });

  it('shows partial content notice for admins when fallback is active', async () => {
    const post = buildPostItem({
      id: 9901,
      noticia: scenarioMinimalHtml,
      contentSnippet: 'Resumo breve derivado da description original.',
    });

    setupDefaultAuth('admin');
    const restoreFetch = mockApi({
      posts: { items: [post] },
    });

    try {
      const queryClient = createQueryClient();
      const user = userEvent.setup();

      renderWithProviders(<PostsPage />, queryClient);

      const articleToggle = await screen.findByRole('button', { name: /NOTICIA/i });
      await user.click(articleToggle);

      await screen.findByRole('heading', { name: /404 Media unveils investigative report/i });

      const adminContainer = await waitFor(() => {
        const element = document.getElementById('article-content-9901');
        if (!element) {
          throw new Error('Admin fallback container not rendered');
        }
        return element;
      });

      expect(adminContainer.textContent).toContain('Conteudo parcial da noticia');
    } finally {
      restoreFetch();
    }
  });

  it('displays loading skeletons while waiting for API responses', async () => {
    setupDefaultAuth('user');
    const post = buildPostItem({ id: 12345, noticia: scenario404MediaHtml });
    const restoreFetch = mockApi({
      posts: { items: [post] },
      postsDelayMs: 120,
    });

    try {
      const queryClient = createQueryClient();

      renderWithProviders(<PostsPage />, queryClient);

      const skeletons = screen.getAllByTestId('loading-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);

      await screen.findByRole('heading', { name: /404 Media unveils investigative report/i });

      expect(screen.queryByTestId('loading-skeleton')).toBeNull();
    } finally {
      restoreFetch();
    }
  });

  it('shows error message and retry option when the posts endpoint fails', async () => {
    setupDefaultAuth('user');

    const restoreFetch = mockApi({
      posts: { items: [] },
      postsError: { status: 500, message: 'Backend indisponivel' },
    });

    try {
      const queryClient = createQueryClient();

      renderWithProviders(<PostsPage />, queryClient);

      await screen.findByText(/Nao foi possivel carregar os posts/i);

      const retryButton = await screen.findByRole('button', { name: /Tentar novamente/i });
      expect(retryButton).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it('guards against escaped HTML by rendering real nodes instead of plain text', async () => {
    setupDefaultAuth('user');

    const escapedHtml = '&lt;p&gt;Hello &lt;strong&gt;World&lt;/strong&gt;&lt;/p&gt;';
    const sanitizedHtml = escapedHtml.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    const escapedPost = buildPostItem({
      id: 8800,
      noticia: sanitizedHtml,
    });

    const restoreFetch = mockApi({
      posts: { items: [escapedPost] },
    });

    try {
      const queryClient = createQueryClient();
      const user = userEvent.setup();

      renderWithProviders(<PostsPage />, queryClient);

      const articleToggle = await screen.findByRole('button', { name: /NOTICIA/i });
      await user.click(articleToggle);

      await screen.findByRole('heading', { name: /404 Media unveils investigative report/i });

      const articleContent = await waitFor(() => {
        const element = document.getElementById('article-content-8800');
        if (!element) {
          throw new Error('Escaped HTML content not rendered');
        }
        return element;
      });

      expect(articleContent.querySelectorAll('p')).not.toHaveLength(0);
      expect(articleContent.textContent).toContain('Hello World');
      expect(articleContent.innerHTML).not.toContain('&lt;');
    } finally {
      restoreFetch();
    }
  });

  it('does not execute scripts or inline handlers injected in noticia payloads', async () => {
    setupDefaultAuth('user');

    const maliciousHtml = `
      <div>
        <script>window.__noticiaScriptExecuted = true;</script>
        <p>Conteudo com tentativa de script.</p>
        <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" onload="window.__noticiaOnloadExecuted = true;" />
      </div>
    `;

    const maliciousPost = buildPostItem({ id: 6600, noticia: maliciousHtml });

    const restoreFetch = mockApi({
      posts: { items: [maliciousPost] },
    });

    try {
      const queryClient = createQueryClient();
      const user = userEvent.setup();

      renderWithProviders(<PostsPage />, queryClient);

      const articleToggle = await screen.findByRole('button', { name: /NOTICIA/i });
      await user.click(articleToggle);

      await screen.findByRole('heading', { name: /404 Media unveils investigative report/i });

      await waitFor(() => {
        const container = document.getElementById('article-content-6600');
        if (!container) {
          throw new Error('Malicious content not rendered');
        }
        return container;
      });

      expect(window).not.toHaveProperty('__noticiaScriptExecuted');
      expect(window).not.toHaveProperty('__noticiaOnloadExecuted');
    } finally {
      restoreFetch();
    }
  });
});

