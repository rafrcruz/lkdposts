import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { UseMutationResult, UseMutateAsyncFunction, UseQueryResult } from '@tanstack/react-query';

import i18n from '@/config/i18n';
import FeedsPage from './FeedsPage';
import {
  useBulkCreateFeeds,
  useCreateFeed,
  useDeleteFeed,
  useFeedList,
  useUpdateFeed,
} from '@/features/feeds/hooks/useFeeds';
import type { Feed } from '@/features/feeds/types/feed';
import type { FeedListResponse } from '@/features/feeds/api/feeds';
import { HttpError } from '@/lib/api/http';

type FeedsHooksModule = typeof import('@/features/feeds/hooks/useFeeds');

vi.mock('@/features/feeds/hooks/useFeeds', () => ({
  useFeedList: vi.fn<
    Parameters<FeedsHooksModule['useFeedList']>,
    ReturnType<FeedsHooksModule['useFeedList']>
  >(),
  useCreateFeed: vi.fn<
    Parameters<FeedsHooksModule['useCreateFeed']>,
    ReturnType<FeedsHooksModule['useCreateFeed']>
  >(),
  useBulkCreateFeeds: vi.fn<
    Parameters<FeedsHooksModule['useBulkCreateFeeds']>,
    ReturnType<FeedsHooksModule['useBulkCreateFeeds']>
  >(),
  useUpdateFeed: vi.fn<
    Parameters<FeedsHooksModule['useUpdateFeed']>,
    ReturnType<FeedsHooksModule['useUpdateFeed']>
  >(),
  useDeleteFeed: vi.fn<
    Parameters<FeedsHooksModule['useDeleteFeed']>,
    ReturnType<FeedsHooksModule['useDeleteFeed']>
  >(),
}));

const mockedUseFeedList = vi.mocked(useFeedList);
const mockedUseCreateFeed = vi.mocked(useCreateFeed);
const mockedUseBulkCreateFeeds = vi.mocked(useBulkCreateFeeds);
const mockedUseUpdateFeed = vi.mocked(useUpdateFeed);
const mockedUseDeleteFeed = vi.mocked(useDeleteFeed);

type CreateVariables = { url: string; title?: string | null };
type CreateOptions = Parameters<UseMutationResult<Feed, HttpError, CreateVariables>['mutate']>[1];
type BulkVariables = { urls: string[] };
type BulkOptions = Parameters<UseMutationResult<unknown, HttpError, BulkVariables>['mutate']>[1];
type UpdateVariables = { id: number; url?: string; title?: string | null };
type UpdateOptions = Parameters<UseMutationResult<Feed, HttpError, UpdateVariables>['mutate']>[1];
type DeleteVariables = number;
type DeleteOptions = Parameters<UseMutationResult<{ message: string }, HttpError, DeleteVariables>['mutate']>[1];

const buildFeed = (override: Partial<Feed> = {}): Feed => {
  const hasTitleOverride = Object.prototype.hasOwnProperty.call(override, 'title');

  return {
    id: override.id ?? 1,
    url: override.url ?? 'https://example.com/feed.xml',
    title: hasTitleOverride ? (override.title ?? null) : 'Example feed',
    lastFetchedAt: override.lastFetchedAt ?? null,
    createdAt: override.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: override.updatedAt ?? '2024-01-01T00:00:00.000Z',
  };
};

const createQueryResult = (
  data: FeedListResponse,
  override: Partial<UseQueryResult<FeedListResponse, HttpError>> = {},
): UseQueryResult<FeedListResponse, HttpError> => {
  const refetch = vi.fn<
    Parameters<UseQueryResult<FeedListResponse, HttpError>['refetch']>,
    ReturnType<UseQueryResult<FeedListResponse, HttpError>['refetch']>
  >();
  const remove = vi.fn<Parameters<UseQueryResult<FeedListResponse, HttpError>['remove']>, void>();
  const base: UseQueryResult<FeedListResponse, HttpError> = {
    data,
    dataUpdatedAt: Date.now(),
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    failureReasonUpdatedAt: 0,
    fetchStatus: 'idle',
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isRefetchError: false,
    isRefetching: false,
    isSuccess: true,
    refetch,
    remove,
    status: 'success',
  };

  return { ...base, ...override };
};

const createMutationResult = <TData, TVariables>(
  mutateMock: Mock<
    (
      variables: TVariables,
      options?: Parameters<UseMutationResult<TData, HttpError, TVariables>['mutate']>[1],
    ) => void
  >,
  overrides: Partial<Omit<UseMutationResult<TData, HttpError, TVariables>, 'mutate'>> = {},
): UseMutationResult<TData, HttpError, TVariables> => {
  const mutate: UseMutationResult<TData, HttpError, TVariables>['mutate'] = (variables, options) => {
    mutateMock(variables, options);
  };
  const mutateAsync = vi.fn<
    Parameters<UseMutateAsyncFunction<TData, HttpError, TVariables, unknown>>,
    ReturnType<UseMutateAsyncFunction<TData, HttpError, TVariables, unknown>>
  >();
  const base: UseMutationResult<TData, HttpError, TVariables> = {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: true,
    isPending: false,
    isPaused: false,
    isSuccess: false,
    mutate,
    mutateAsync,
    reset: vi.fn(),
    status: 'idle',
    submittedAt: 0,
    variables: undefined,
  };

  return { ...base, ...overrides, mutate };
};

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <FeedsPage />
    </I18nextProvider>,
  );

let createMutate: Mock<(variables: CreateVariables, options?: CreateOptions) => void>;
let bulkMutate: Mock<(variables: BulkVariables, options?: BulkOptions) => void>;
let updateMutate: Mock<(variables: UpdateVariables, options?: UpdateOptions) => void>;
let deleteMutate: Mock<(variables: DeleteVariables, options?: DeleteOptions) => void>;
let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  const feeds = [
    buildFeed({ id: 1, title: 'Feed 1', url: 'https://example.com/1.xml', lastFetchedAt: null }),
    buildFeed({ id: 2, title: 'Feed 2', url: 'https://example.com/2.xml', lastFetchedAt: '2024-01-01T12:00:00.000Z' }),
  ];

  mockedUseFeedList.mockReturnValue(
    createQueryResult({ items: feeds, meta: { nextCursor: null, total: feeds.length, limit: 10 } }),
  );

  createMutate = vi.fn<(variables: CreateVariables, options?: CreateOptions) => void>();
  bulkMutate = vi.fn<(variables: BulkVariables, options?: BulkOptions) => void>();
  updateMutate = vi.fn<(variables: UpdateVariables, options?: UpdateOptions) => void>();
  deleteMutate = vi.fn<(variables: DeleteVariables, options?: DeleteOptions) => void>();

  mockedUseCreateFeed.mockReturnValue(
    createMutationResult<Feed, CreateVariables>(createMutate, { isPending: false }),
  );

  mockedUseBulkCreateFeeds.mockReturnValue(
    createMutationResult<unknown, BulkVariables>(bulkMutate, { isPending: false }),
  );

  mockedUseUpdateFeed.mockReturnValue(
    createMutationResult<Feed, UpdateVariables>(updateMutate, { isPending: false }),
  );

  mockedUseDeleteFeed.mockReturnValue(
    createMutationResult<{ message: string }, DeleteVariables>(deleteMutate, { isPending: false }),
  );

  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  confirmSpy.mockRestore();
});

describe('FeedsPage', () => {
  it('renders feed list with pagination controls', () => {
    const feeds = [
      buildFeed({ id: 10, title: 'Primeiro feed', url: 'https://site.com/rss', lastFetchedAt: null }),
      buildFeed({ id: 11, title: 'Segundo feed', url: 'https://site.com/blog', lastFetchedAt: '2024-02-02T10:00:00.000Z' }),
    ];

    mockedUseFeedList.mockReturnValue(
      createQueryResult({ items: feeds, meta: { nextCursor: '22', total: 20, limit: 10 } }),
    );

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /Feeds RSS/i })).toBeInTheDocument();
    expect(screen.getByText('https://site.com/rss')).toBeInTheDocument();
    expect(screen.getByText('https://site.com/blog')).toBeInTheDocument();
    expect(screen.getByText('Ainda nao processado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Proxima/i })).not.toBeDisabled();
  });

  it('creates feed individually and shows success feedback', async () => {
    const user = userEvent.setup();

    createMutate.mockImplementation((variables, options) => {
      const created = buildFeed({ id: 30, url: variables.url, title: variables.title ?? undefined });
      options?.onSuccess?.(created, variables, undefined);
    });

    renderPage();

    const urlInput = screen.getByLabelText(/^URL$/i);
    await user.clear(urlInput);
    await user.type(urlInput, '  https://news.com/feed.xml  ');
    const titleInput = screen.getByLabelText(/^Titulo/i);
    await user.clear(titleInput);
    await user.type(titleInput, '  Noticias ');
    await user.click(screen.getByRole('button', { name: /Adicionar$/i }));

    expect(createMutate).toHaveBeenCalledWith(
      { url: 'https://news.com/feed.xml', title: 'Noticias' },
      expect.any(Object),
    );
    expect(screen.getByText('Feed adicionado com sucesso.')).toBeInTheDocument();
    expect(urlInput).toHaveValue('');
    expect(titleInput).toHaveValue('');
  });

  it('validates URL locally before creating feed', async () => {
    const user = userEvent.setup();

    renderPage();

    const urlField = screen.getByLabelText(/^URL$/i);
    await user.clear(urlField);
    await user.type(urlField, 'invalid-url');
    expect(urlField).toHaveValue('invalid-url');
    await user.click(screen.getByRole('button', { name: /Adicionar$/i }));

    expect(createMutate).not.toHaveBeenCalled();
    await screen.findByText(
      (content) =>
        content.includes('Informe uma URL') ||
        content.includes('Enter a valid URL starting with http:// or https://'),
    );
  });

  it('displays duplicate error when API rejects creation', async () => {
    const user = userEvent.setup();

    const duplicateError = new HttpError('duplicate', 409, {
      error: { code: 'FEED_ALREADY_EXISTS' },
    });

    createMutate.mockImplementation((variables, options) => {
      options?.onError?.(duplicateError, variables, undefined);
    });

    renderPage();

    const editUrlInput = screen.getByLabelText(/^URL$/i);
    await user.clear(editUrlInput);
    await user.type(editUrlInput, 'https://news.com/feed.xml');
    await user.click(screen.getByRole('button', { name: /Adicionar$/i }));

    expect(createMutate).toHaveBeenCalled();
    expect(screen.getByText('Este feed ja foi adicionado.')).toBeInTheDocument();
  });

  it('shows bulk creation summary with created, duplicates and invalid entries', async () => {
    const user = userEvent.setup();

    const createdFeed = buildFeed({ id: 40, url: 'https://valid-1.com/rss', title: null });
    const createdFeed2 = buildFeed({ id: 41, url: 'https://valid-2.com/rss', title: 'Valid 2' });

    bulkMutate.mockImplementation((variables, options) => {
      options?.onSuccess?.(
        {
          created: [createdFeed, createdFeed2],
          duplicates: [{ url: 'https://existing.com/rss', reason: 'ALREADY_EXISTS', feedId: 5 }],
          invalid: [],
        },
        variables,
        undefined,
      );
    });

    renderPage();

    const textarea = screen.getByLabelText(/Uma URL por linha/i);
    await user.clear(textarea);
    await user.type(
      textarea,
      'https://valid-1.com/rss\n\ninvalid-url\nhttps://valid-1.com/rss\nhttps://valid-2.com/rss',
    );
    await user.click(screen.getByRole('button', { name: /Adicionar em lote/i }));

    expect(bulkMutate).toHaveBeenCalledWith(
      { urls: ['https://valid-1.com/rss', 'https://valid-2.com/rss'] },
      expect.any(Object),
    );

    const successMessage = i18n.t('feeds.bulkForm.success', { count: 2 });
    expect(screen.getByText(successMessage)).toBeInTheDocument();

    const summaryTitle = i18n.t('feeds.bulkForm.summary.title', 'Resumo da operacao');
    const summary = screen.getByText(summaryTitle).closest('div');
    expect(summary).not.toBeNull();
    const summaryElement = summary as HTMLElement;

    const createdHeading = i18n.t('feeds.bulkForm.summary.created', { count: 2 });
    const createdSection = within(summaryElement).getByText(createdHeading).closest('div');
    expect(createdSection).not.toBeNull();
    const createdElement = createdSection as HTMLElement;
    expect(within(createdElement).getAllByText('https://valid-1.com/rss').length).toBeGreaterThan(0);
    expect(within(createdElement).getAllByText('https://valid-2.com/rss').length).toBeGreaterThan(0);

    const duplicatesHeading = i18n.t('feeds.bulkForm.summary.duplicates', { count: 2 });
    const duplicatesSection = within(summaryElement).getByText(duplicatesHeading).closest('div');
    expect(duplicatesSection).not.toBeNull();
    const duplicatesElement = duplicatesSection as HTMLElement;
    expect(within(duplicatesElement).getByText('https://existing.com/rss')).toBeInTheDocument();
    expect(within(duplicatesElement).getByText('https://valid-1.com/rss')).toBeInTheDocument();
    expect(within(duplicatesElement).getByText('URL duplicada no envio em lote.')).toBeInTheDocument();

    const invalidHeading = i18n.t('feeds.bulkForm.summary.invalid', { count: 1 });
    const invalidSection = within(summaryElement).getByText(invalidHeading).closest('div');
    expect(invalidSection).not.toBeNull();
    const invalidElement = invalidSection as HTMLElement;
    expect(within(invalidElement).getByText('invalid-url')).toBeInTheDocument();
    expect(within(invalidElement).getByText('Formato de URL invalido.')).toBeInTheDocument();
    const feedIdLabel = i18n.t('feeds.bulkForm.summary.feedId', { id: 5 });
    expect(
      within(summaryElement).getByText((content) => content.includes(feedIdLabel)),
    ).toBeInTheDocument();
  });

  it('updates feed successfully and closes the edit form', async () => {
    const user = userEvent.setup();

    updateMutate.mockImplementation((variables, options) => {
      const updated = buildFeed({ id: variables.id, url: 'https://example.com/1.xml', title: 'Atualizado' });
      options?.onSuccess?.(updated, variables, undefined);
    });

    renderPage();

    await user.click(screen.getAllByRole('button', { name: /Editar/i })[0]);
    await user.clear(screen.getByDisplayValue('Feed 1'));
    await user.type(screen.getByLabelText(/^Titulo$/i), 'Atualizado');
    await user.click(screen.getByRole('button', { name: /Salvar alteracoes/i }));

    expect(updateMutate).toHaveBeenCalledWith(
      { id: 1, title: 'Atualizado' },
      expect.any(Object),
    );
    expect(screen.getByText('Feed atualizado com sucesso.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Editar/i })[0]).toBeEnabled();
  });

  it('shows duplicate error when updating feed URL to an existing one', async () => {
    const user = userEvent.setup();

    const duplicateError = new HttpError('duplicate', 409, {
      error: { code: 'FEED_ALREADY_EXISTS' },
    });

    updateMutate.mockImplementation((variables, options) => {
      options?.onError?.(duplicateError, variables, undefined);
    });

    renderPage();

    await user.click(screen.getAllByRole('button', { name: /Editar/i })[0]);
    const urlInput = screen.getByDisplayValue('https://example.com/1.xml');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://duplicado.com/rss');
    await user.click(screen.getByRole('button', { name: /Salvar alteracoes/i }));

    expect(updateMutate).toHaveBeenCalled();
    expect(screen.getByText('Este feed ja foi adicionado.')).toBeInTheDocument();
  });

  it('removes feed after confirmation and shows feedback', async () => {
    const user = userEvent.setup();

    deleteMutate.mockImplementation((id, options) => {
      options?.onSuccess?.({ message: 'ok' }, id, undefined);
    });

    renderPage();

    await user.click(screen.getAllByRole('button', { name: /Excluir/i })[0]);

    expect(deleteMutate).toHaveBeenCalledWith(1, expect.any(Object));
    expect(screen.getByText('Feed removido com sucesso.')).toBeInTheDocument();
  });
});

