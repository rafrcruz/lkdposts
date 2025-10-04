import type { ReactElement } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import type { SpyInstance } from 'vitest';

import PostsPage from './PostsPage';
import i18n from '@/config/i18n';
import type {
  PostListItem,
  RefreshSummary,
  CleanupResult,
  PostGenerationProgress,
} from '@/features/posts/types/post';
import type { Feed } from '@/features/feeds/types/feed';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { AuthContextValue } from '@/features/auth/context/AuthContext';
import { useAppParams } from '@/features/app-params/hooks/useAppParams';
import type { AppParams } from '@/features/app-params/types/appParams';

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
  refreshProgress?: PostGenerationProgress | null;
  cleanup?: CleanupResult;
  postsDelayMs?: number;
  postsError?: { status: number; message: string };
};

type MockApiRestore = (() => void) & { fetchSpy: SpyInstance };

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

describe('PostsPage parameter workflows (E2E with API mocks)', () => {
  const renderPage = (client: QueryClient) => render(wrapWithProviders(<PostsPage />, client));

  const resolveRequestDetails = (input: RequestInfo | URL, init?: RequestInit) => {
    let resource: string;
    if (typeof input === 'string') {
      resource = input;
    } else if (input instanceof URL) {
      resource = input.toString();
    } else {
      resource = input.url;
    }

    const url = new URL(resource, 'http://localhost');
    let method = init?.method;
    if (!method && input instanceof Request) {
      method = input.method;
    }

    return { pathname: url.pathname, method: (method ?? 'GET').toUpperCase() };
  };

  const countRequests = (spy: SpyInstance, pathname: string, method: string) =>
    spy.mock.calls.filter(([input, init]) => {
      const details = resolveRequestDetails(input as RequestInfo | URL, init as RequestInit | undefined);
      return details.pathname === pathname && details.method === method.toUpperCase();
    }).length;

  afterEach(() => {
    vi.useRealTimers();
    mockedUseAuth.mockReset();
    mockedUseAppParams.mockReset();
  });

  it('Scenario A: applies default cooldown and window labels', async () => {
    setupDefaultAuth('user');

    const nowIso = new Date().toISOString();
    const restoreFetch = mockApi({
      posts: {
        items: [
          buildPostItem({ id: 1201, title: 'Default window item', post: { content: 'Conteudo padrao', createdAt: nowIso } }),
        ],
      },
      refresh: { now: nowIso, feeds: [] },
    });

    mockedUseAppParams.mockReturnValue(buildAppParamsContextValue());

    try {
      const queryClient = createQueryClient();
      const user = userEvent.setup();
      renderPage(queryClient);

      await screen.findByRole('heading', { name: /Default window item/i });
      expect(screen.getByText(/Itens dentro de < 7d/i)).toBeInTheDocument();

      const refreshButton = await screen.findByRole('button', { name: /Atualizar/i });
      const refreshCallsBefore = countRequests(restoreFetch.fetchSpy, '/api/v1/posts/refresh', 'POST');

      await user.click(refreshButton);

      await screen.findByText(/Aguarde/i);
      await waitFor(() => {
        expect(refreshButton).toHaveAttribute('aria-disabled', 'true');
      });

      const refreshCallsAfter = countRequests(restoreFetch.fetchSpy, '/api/v1/posts/refresh', 'POST');
      expect(refreshCallsAfter).toBe(refreshCallsBefore);
    } finally {
      restoreFetch();
    }
  }, 15000);

  it('Scenario B: applies updated parameters after cooldown', async () => {
    const initialTime = new Date();

    setupDefaultAuth('admin');

    const appParamsState = buildAppParamsContextValue({ posts_refresh_cooldown_seconds: 3600, posts_time_window_days: 7 });
    mockedUseAppParams.mockImplementation(() => appParamsState);

    const initialPost = buildPostItem({ id: 1301, title: 'Janela 7 dias', publishedAt: initialTime.toISOString() });
    const updatedPost = buildPostItem({
      id: 1302,
      title: 'Janela 3 dias',
      publishedAt: new Date(initialTime.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const apiConfig: PostsApiMockConfig = {
      posts: { items: [initialPost] },
      refresh: { now: initialTime.toISOString(), feeds: [] },
    };

    const restoreFetch = mockApi(apiConfig);

    try {
      const queryClient = createQueryClient();
      const user = userEvent.setup();
      const view = renderPage(queryClient);

      await screen.findByRole('heading', { name: /Janela 7 dias/i });
      expect(screen.getByText(/Itens dentro de < 7d/i)).toBeInTheDocument();

      act(() => {
        appParamsState.params = buildAppParams({ posts_refresh_cooldown_seconds: 2, posts_time_window_days: 3 });
        appParamsState.fetchedAt = Date.now();
        view.rerender(wrapWithProviders(<PostsPage />, queryClient));
      });

      await screen.findByText(/Itens dentro de < 3d/i);

      const refreshButton = await screen.findByRole('button', { name: /Atualizar/i });
      const refreshCallsBefore = countRequests(restoreFetch.fetchSpy, '/api/v1/posts/refresh', 'POST');

      await user.click(refreshButton);
      await screen.findByText(/Aguarde/i);

      expect(countRequests(restoreFetch.fetchSpy, '/api/v1/posts/refresh', 'POST')).toBe(refreshCallsBefore);

      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 2200);
        });
      });

      await waitFor(() => {
        expect(refreshButton).toHaveAttribute('aria-disabled', 'false');
      });

      apiConfig.posts.items = [updatedPost];

      await user.click(refreshButton);

      await waitFor(() => {
        expect(countRequests(restoreFetch.fetchSpy, '/api/v1/posts/refresh', 'POST')).toBe(refreshCallsBefore + 1);
      });

      await screen.findByRole('heading', { name: /Janela 3 dias/i });
      expect(screen.getByText(/Itens dentro de < 3d/i)).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  }, 20000);

  it('Scenario C: hides admin diagnostics for non-admin users', async () => {
    setupDefaultAuth('user');

    const restoreFetch = mockApi({
      posts: {
        items: [buildPostItem({ id: 1401, title: 'Feed restrito' })],
      },
    });

    mockedUseAppParams.mockReturnValue(buildAppParamsContextValue());

    try {
      const queryClient = createQueryClient();
      renderPage(queryClient);

      await screen.findByRole('heading', { name: /Feed restrito/i });
      expect(screen.queryByRole('button', { name: /Diagn/i })).not.toBeInTheDocument();

      const adminCalls = countRequests(restoreFetch.fetchSpy, '/api/v1/app-params', 'PATCH');
      expect(adminCalls).toBe(0);
    } finally {
      restoreFetch();
    }
  }, 10000);

  it('Scenario D: updates labels when cached parameters refresh in the background', async () => {
    setupDefaultAuth('admin');

    const appParamsRef: { current: ReturnType<typeof buildAppParamsContextValue> } = {
      current: {
        ...buildAppParamsContextValue({ posts_refresh_cooldown_seconds: 900, posts_time_window_days: 10 }),
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
        isFetching: true,
      },
    };

    mockedUseAppParams.mockImplementation(() => appParamsRef.current);

    const restoreFetch = mockApi({
      posts: {
        items: [
          buildPostItem({
            id: 1501,
            title: 'Cache antigo',
            noticia: '<p>Conteudo inicial do cache.</p>',
            articleHtml: '<div><p>Conteudo inicial do cache.</p></div>',
          }),
        ],
      },
    });

    try {
      const queryClient = createQueryClient();
      const user = userEvent.setup();
      const view = renderPage(queryClient);

      await screen.findByRole('heading', { name: /Cache antigo/i });
      expect(screen.getByText(/Itens dentro de < 10d/i)).toBeInTheDocument();

      const noticiaButton = await screen.findByRole('button', { name: /NOTICIA/i });
      await user.click(noticiaButton);

      const resolveArticleContent = () =>
        document.getElementById('article-content-1501-html') ?? document.getElementById('article-content-1501');

      await waitFor(() => {
        const element = resolveArticleContent();
        if (!element) {
          throw new Error('Conteudo inicial não encontrado');
        }
      });

      act(() => {
        appParamsRef.current = {
          ...appParamsRef.current,
          params: buildAppParams({ posts_refresh_cooldown_seconds: 600, posts_time_window_days: 4 }),
          fetchedAt: Date.now(),
          isFetching: false,
        };
        view.rerender(wrapWithProviders(<PostsPage />, queryClient));
      });

      await screen.findByText(/Itens dentro de < 4d/i);
      expect(noticiaButton).toHaveAttribute('aria-expanded', 'true');
      const updatedContent = resolveArticleContent();
      expect(updatedContent?.innerHTML).toContain('Conteudo inicial do cache');
    } finally {
      restoreFetch();
    }
  }, 15000);
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

const mockApi = (config: PostsApiMockConfig): MockApiRestore => {
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
  const refreshProgressPayload: PostGenerationProgress | null =
    'refreshProgress' in config ? config.refreshProgress ?? null : null;
  const cleanupPayload: CleanupResult =
    config.cleanup ?? ({ removedArticles: 0, removedPosts: 0 } as CleanupResult);

  const postsMeta = config.posts.meta ?? { nextCursor: null, limit: 10 };

  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    let resource: string;
    if (typeof input === 'string') {
      resource = input;
    } else if (input instanceof URL) {
      resource = input.toString();
    } else {
      resource = input.url;
    }
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

    if (method === 'GET' && path === '/api/v1/posts/refresh-status') {
      return buildJsonResponse({ success: true, data: { status: refreshProgressPayload } });
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

  const restore = () => {
    fetchSpy.mockRestore();
  };

  return Object.assign(restore, { fetchSpy });
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const wrapWithProviders = (ui: ReactElement, client: QueryClient) => (
  <I18nextProvider i18n={i18n}>
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  </I18nextProvider>
);

const renderWithProviders = (ui: ReactElement, client: QueryClient) => render(wrapWithProviders(ui, client));

vi.mock('@/features/auth/hooks/useAuth');
vi.mock('@/features/app-params/hooks/useAppParams');

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseAppParams = vi.mocked(useAppParams);

const buildAppParams = (override: Partial<AppParams> = {}): AppParams => ({
  posts_refresh_cooldown_seconds: override.posts_refresh_cooldown_seconds ?? 3600,
  posts_time_window_days: override.posts_time_window_days ?? 7,
  updated_at: override.updated_at ?? '2025-01-01T00:00:00.000Z',
  updated_by: Object.hasOwn(override, 'updated_by') ? override.updated_by ?? null : 'admin@example.com',
});

const buildAppParamsContextValue = (
  paramsOverride: Partial<AppParams> = {},
  overrides: Partial<ReturnType<typeof useAppParams>> = {},
): ReturnType<typeof useAppParams> => {
  const params = buildAppParams(paramsOverride);

  return {
    params,
    status: 'success',
    error: null,
    isFetching: false,
    fetchedAt: Date.now(),
    refresh: vi.fn(async () => params),
    update: vi.fn(async () => params),
    clearError: vi.fn(),
    ...overrides,
  };
};

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

type PostItemOverride = Partial<Omit<PostListItem, 'post'>> & {
  post?: Partial<NonNullable<PostListItem['post']>> | null;
};

const buildPostMetadata = (
  override: Partial<NonNullable<PostListItem['post']>> = {},
): NonNullable<PostListItem['post']> => ({
  content:
    Object.hasOwn(override, 'content')
      ? override.content ?? null
      : 'Post gerado automaticamente para promover a reportagem.',
  createdAt: Object.hasOwn(override, 'createdAt')
    ? override.createdAt ?? null
    : '2025-01-08T13:00:00.000Z',
  status: Object.hasOwn(override, 'status') ? override.status ?? null : 'SUCCESS',
  generatedAt: Object.hasOwn(override, 'generatedAt')
    ? override.generatedAt ?? null
    : '2025-01-08T13:00:00.000Z',
  modelUsed: Object.hasOwn(override, 'modelUsed') ? override.modelUsed ?? null : 'gpt-5-nano',
  errorReason: Object.hasOwn(override, 'errorReason') ? override.errorReason ?? null : null,
  tokensInput: Object.hasOwn(override, 'tokensInput') ? override.tokensInput ?? null : null,
  tokensOutput: Object.hasOwn(override, 'tokensOutput') ? override.tokensOutput ?? null : null,
  promptBaseHash: Object.hasOwn(override, 'promptBaseHash') ? override.promptBaseHash ?? null : 'hash-example',
  attemptCount: override.attemptCount ?? 1,
  updatedAt:
    Object.hasOwn(override, 'updatedAt')
      ? override.updatedAt ?? null
      : override.generatedAt ?? override.createdAt ?? '2025-01-08T13:00:00.000Z',
});

const normalizePostMetadata = (
  value: Partial<NonNullable<PostListItem['post']>> | null | undefined,
): PostListItem['post'] => {
  if (value == null) {
    return value ?? null;
  }
  return buildPostMetadata(value);
};

const buildPostItem = (override: PostItemOverride = {}): PostListItem => ({
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
    Object.hasOwn(override, 'post')
      ? override.post === undefined
        ? null
        : normalizePostMetadata(override.post)
      : buildPostMetadata(),
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
  beforeEach(() => {
    mockedUseAppParams.mockReturnValue(buildAppParamsContextValue());
  });

  afterEach(() => {
    mockedUseAuth.mockReset();
    mockedUseAppParams.mockReset();
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
    for (const anchor of anchors) {
      expect(anchor).toHaveAttribute('target', '_blank');
      const rel = anchor.getAttribute('rel') ?? '';
      expect(rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
      if (anchor.getAttribute('target') === '_blank' && rel.includes('noopener') && rel.includes('noreferrer')) {
        linksWithTargetRel += 1;
      }
    }

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

    for (const anchor of anchors) {
      const href = anchor.getAttribute('href') ?? '';
      expect(href).not.toMatch(/utm_|fbclid|ref=/i);
      expect(anchor).toHaveAttribute('target', '_blank');
      expect(anchor.getAttribute('rel') ?? '').toContain('noopener');
    }
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
    const sanitizedHtml = escapedHtml.replaceAll('&lt;', '<').replaceAll('&gt;', '>');

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

      expect(globalThis).not.toHaveProperty('__noticiaScriptExecuted');
      expect(globalThis).not.toHaveProperty('__noticiaOnloadExecuted');
    } finally {
      restoreFetch();
    }
  });
});

