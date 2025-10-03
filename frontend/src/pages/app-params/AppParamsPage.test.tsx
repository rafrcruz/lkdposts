import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';

import AppParamsPage from './AppParamsPage';
import { useAppParams } from '@/features/app-params/hooks/useAppParams';
import {
  openAiModelOptions,
  type AppParams,
} from '@/features/app-params/types/appParams';
import { useResetFeeds } from '@/features/feeds/hooks/useFeeds';
import i18n from '@/config/i18n';
import { HttpError } from '@/lib/api/http';
import { runOpenAiDiagnostics } from '@/features/app-params/api/openAiDiagnostics';

vi.mock('@/features/app-params/hooks/useAppParams');
vi.mock('@/features/feeds/hooks/useFeeds');
vi.mock('@/features/app-params/api/openAiDiagnostics');

const mockedUseAppParams = vi.mocked(useAppParams);
const mockedUseResetFeeds = vi.mocked(useResetFeeds);
const mockedRunOpenAiDiagnostics = vi.mocked(runOpenAiDiagnostics);

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <AppParamsPage />
    </I18nextProvider>,
  );

const buildAppParams = (override: Partial<AppParams> = {}): AppParams => ({
  posts_refresh_cooldown_seconds: override.posts_refresh_cooldown_seconds ?? 0,
  posts_time_window_days: override.posts_time_window_days ?? 7,
  'openai.model': override['openai.model'] ?? openAiModelOptions[0],
  updated_at: override.updated_at ?? '2024-01-01T00:00:00.000Z',
  updated_by: Object.hasOwn(override, 'updated_by') ? override.updated_by ?? null : 'admin@example.com',
});

const buildAppParamsHook = (
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

const createResetFeedsMock = () => ({
  mutateAsync: vi.fn(() =>
    Promise.resolve({
      feedsResetCount: 1,
      articlesDeletedCount: 0,
      postsDeletedCount: 0,
      durationMs: 0,
    }),
  ),
});

describe('AppParamsPage', () => {
  let resetFeedsMock: ReturnType<typeof createResetFeedsMock>;

  beforeEach(() => {
    resetFeedsMock = createResetFeedsMock();
    mockedUseResetFeeds.mockReturnValue(resetFeedsMock as unknown as ReturnType<typeof useResetFeeds>);
    mockedUseAppParams.mockReturnValue(buildAppParamsHook());
    mockedRunOpenAiDiagnostics.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state while parameters are being fetched', () => {
    mockedUseAppParams.mockReturnValue(
      buildAppParamsHook({}, {
        params: null,
        status: 'loading',
        isFetching: true,
      }),
    );

    renderPage();

    expect(screen.getAllByTestId('loading-skeleton').length).toBeGreaterThan(0);
  });

  it('shows an error state when parameters cannot be loaded', async () => {
    const refreshMock = vi.fn(async () => buildAppParams());
    mockedUseAppParams.mockReturnValue(
      buildAppParamsHook({}, {
        params: null,
        status: 'error',
        error: new HttpError('Erro', 500),
        isFetching: false,
        refresh: refreshMock,
      }),
    );

    const user = userEvent.setup();

    renderPage();

    expect(screen.getByText('Nao foi possivel carregar os parametros.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(refreshMock).toHaveBeenCalledWith({ force: true });
  });

  it('displays current values and keeps save disabled when unchanged', () => {
    renderPage();

    const cooldownInput = screen.getByLabelText('Cooldown de atualizacao (segundos)');
    const timeWindowInput = screen.getByLabelText('Janela de tempo dos posts (dias)');
    const openAiModelSelect = screen.getByLabelText(/Modelo da OpenAI/i);
    const saveButton = screen.getByRole('button', { name: 'Salvar' });

    expect(cooldownInput).toHaveValue(0);
    expect(timeWindowInput).toHaveValue(7);
    expect(openAiModelSelect).toHaveValue(openAiModelOptions[0]);
    expect(saveButton).toBeDisabled();
  });

  it('renders only supported OpenAI model options', () => {
    renderPage();

    const openAiModelSelect = screen.getByLabelText(/Modelo da OpenAI/i) as HTMLSelectElement;

    const optionValues = Array.from(openAiModelSelect.options).map((option) => option.value);
    expect(optionValues).toEqual([...openAiModelOptions]);
    expect(openAiModelSelect).toHaveValue(openAiModelOptions[0]);
  });

  it('validates integer-only inputs and prevents submission when invalid', async () => {
    const user = userEvent.setup();

    renderPage();

    const cooldownInput = screen.getByLabelText('Cooldown de atualizacao (segundos)');
    const timeWindowInput = screen.getByLabelText('Janela de tempo dos posts (dias)');

    await user.clear(cooldownInput);
    await user.type(cooldownInput, '-1');
    await user.clear(timeWindowInput);
    await user.type(timeWindowInput, '0');

    expect(screen.getByText('O cooldown nao pode ser negativo.')).toBeInTheDocument();
    expect(screen.getByText('A janela de tempo deve ter pelo menos um dia.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('updates parameters and triggers feed reset on successful save', async () => {
    const updatedParams = buildAppParams({ posts_refresh_cooldown_seconds: 120, posts_time_window_days: 5 });
    const updateMock = vi.fn(async () => updatedParams);
    mockedUseAppParams.mockReturnValue(buildAppParamsHook({}, { update: updateMock }));

    const user = userEvent.setup();

    renderPage();

    const cooldownInput = screen.getByLabelText('Cooldown de atualizacao (segundos)');
    const timeWindowInput = screen.getByLabelText('Janela de tempo dos posts (dias)');
    const saveButton = screen.getByRole('button', { name: 'Salvar' });

    await user.clear(cooldownInput);
    await user.type(cooldownInput, '120');
    await user.clear(timeWindowInput);
    await user.type(timeWindowInput, '5');
    await user.click(saveButton);

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        posts_refresh_cooldown_seconds: 120,
        posts_time_window_days: 5,
      });
    });

    expect(resetFeedsMock.mutateAsync).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        'Parametros atualizados com sucesso. Feeds resetados com base nos novos parametros.',
      ),
    ).toBeInTheDocument();
    expect(cooldownInput).toHaveValue(120);
    expect(timeWindowInput).toHaveValue(5);
  });

  it('allows updating the OpenAI model with supported values', async () => {
    const nextModel = openAiModelOptions[1];
    const updatedParams = buildAppParams({ 'openai.model': nextModel });
    const updateMock = vi.fn(async () => updatedParams);
    mockedUseAppParams.mockReturnValue(buildAppParamsHook({}, { update: updateMock }));

    const user = userEvent.setup();

    renderPage();

    const select = screen.getByLabelText(/Modelo da OpenAI/i);
    await user.selectOptions(select, nextModel);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ 'openai.model': nextModel });
    });

    expect(select).toHaveValue(nextModel);
  });

  it('shows a warning when the feed reset fails after saving', async () => {
    const updatedParams = buildAppParams({ posts_refresh_cooldown_seconds: 90, posts_time_window_days: 4 });
    const updateMock = vi.fn(async () => updatedParams);
    resetFeedsMock.mutateAsync.mockRejectedValueOnce(new Error('reset failed'));
    mockedUseAppParams.mockReturnValue(buildAppParamsHook({}, { update: updateMock }));

    const user = userEvent.setup();

    renderPage();

    const cooldownInput = screen.getByLabelText('Cooldown de atualizacao (segundos)');
    const timeWindowInput = screen.getByLabelText('Janela de tempo dos posts (dias)');

    await user.clear(cooldownInput);
    await user.type(cooldownInput, '90');
    await user.clear(timeWindowInput);
    await user.type(timeWindowInput, '4');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalled();
    });

    expect(
      screen.getByText(
        'Parametros atualizados com sucesso, mas nao foi possivel resetar os feeds automaticamente. Tente novamente na tela de feeds.',
      ),
    ).toBeInTheDocument();
  });

  it('displays an error message when the update request fails', async () => {
    const updateMock = vi.fn(async () => {
      throw new HttpError('Acesso negado', 403);
    });
    mockedUseAppParams.mockReturnValue(buildAppParamsHook({}, { update: updateMock }));

    const user = userEvent.setup();

    renderPage();

    const cooldownInput = screen.getByLabelText('Cooldown de atualizacao (segundos)');
    await user.clear(cooldownInput);
    await user.type(cooldownInput, '30');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalled();
    });

    expect(screen.getByText('Acesso negado')).toBeInTheDocument();
  });

  it('falls back to the default OpenAI model when the API returns an unsupported value', () => {
    const invalidParams = {
      ...buildAppParams(),
      'openai.model': 'gpt-5-ultra',
    } as unknown as AppParams;

    mockedUseAppParams.mockReturnValue(
      buildAppParamsHook({}, {
        params: invalidParams,
      }),
    );

    renderPage();

    expect(screen.getByLabelText(/Modelo da OpenAI/i)).toHaveValue(openAiModelOptions[0]);
  });

  it('validates the OpenAI configuration and surfaces success feedback', async () => {
    mockedRunOpenAiDiagnostics.mockResolvedValueOnce({
      ok: true,
      model: 'gpt-5-nano',
      baseURL: 'https://api.openai.com/v1',
      timeoutMs: 30000,
      latencyMs: 45,
      usage: { input_tokens: 10 },
    });

    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: /validate openai/i }));

    await waitFor(() => {
      expect(mockedRunOpenAiDiagnostics).toHaveBeenCalledWith('gpt-5-nano');
    });

    expect(
      screen.getByText(/Conexão com OpenAI OK .*latência: 45 ms/i),
    ).toBeInTheDocument();
  });

  it('shows error feedback when the OpenAI validation fails', async () => {
    mockedRunOpenAiDiagnostics.mockResolvedValueOnce({
      ok: false,
      model: 'gpt-5-nano',
      baseURL: 'https://api.openai.com/v1',
      timeoutMs: 30000,
      latencyMs: 60,
      error: {
        status: 401,
        type: 'invalid_request_error',
        code: 'invalid_api_key',
        message: 'Invalid API key',
        request_id: 'req_123',
      },
    });

    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: /validate openai/i }));

    await waitFor(() => {
      expect(mockedRunOpenAiDiagnostics).toHaveBeenCalled();
    });

    expect(
      screen.getByText(/Erro OpenAI: status 401 \/ code invalid_api_key \/ msg Invalid API key/i),
    ).toBeInTheDocument();
  });

  it('handles unexpected errors during OpenAI validation', async () => {
    mockedRunOpenAiDiagnostics.mockRejectedValueOnce(new HttpError('Falhou', 500));

    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: /validate openai/i }));

    await waitFor(() => {
      expect(mockedRunOpenAiDiagnostics).toHaveBeenCalled();
    });

    expect(
      screen.getByText(/Não foi possível validar a conexão com a OpenAI/i),
    ).toBeInTheDocument();
  });

  it('surfaces background refresh errors while keeping the form available', () => {
    mockedUseAppParams.mockReturnValue(
      buildAppParamsHook({}, {
        error: new HttpError('Acesso negado', 403),
      }),
    );

    renderPage();

    expect(screen.getByText('Acesso negado')).toBeInTheDocument();
    expect(screen.getByLabelText('Cooldown de atualizacao (segundos)')).toBeInTheDocument();
  });
});
