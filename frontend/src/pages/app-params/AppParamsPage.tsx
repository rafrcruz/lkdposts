import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react';

import { useAppParams } from '@/features/app-params/hooks/useAppParams';
import {
  openAiModelOptions,
  type AppParams,
  type AppParamsUpdateInput,
} from '@/features/app-params/types/appParams';
import { runOpenAiDiagnostics } from '@/features/app-params/api/openAiDiagnostics';
import { useResetFeeds } from '@/features/feeds/hooks/useFeeds';
import { LoadingSkeleton } from '@/components/feedback/LoadingSkeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { HttpError } from '@/lib/api/http';

const parseInteger = (value: string): number | null => {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
};

type Feedback = {
  type: 'success' | 'error' | 'warning';
  message: string;
};

const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof HttpError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

type OpenAiModel = (typeof openAiModelOptions)[number];

const DEFAULT_OPENAI_MODEL: OpenAiModel = openAiModelOptions[0];

const openAiModelLabels: Record<OpenAiModel, string> = {
  'gpt-5-nano': 'GPT-5 nano',
  'gpt-5-mini': 'GPT-5 mini',
  'gpt-5': 'GPT-5',
  'gpt-5-nano-2025-08-07': 'GPT-5 nano (2025-08-07)',
  'gpt-5-mini-2025-08-07': 'GPT-5 mini (2025-08-07)',
  'gpt-5-2025-08-07': 'GPT-5 (2025-08-07)',
};

const isOpenAiModel = (value: string | null | undefined): value is OpenAiModel => {
  if (typeof value !== 'string') {
    return false;
  }

  return openAiModelOptions.includes(value as OpenAiModel);
};

const normalizeOpenAiModel = (value: string | null | undefined): OpenAiModel => {
  if (typeof value !== 'string') {
    return DEFAULT_OPENAI_MODEL;
  }

  const trimmed = value.trim() as OpenAiModel;
  return openAiModelOptions.includes(trimmed) ? trimmed : DEFAULT_OPENAI_MODEL;
};

const resolveOpenAiModelFromParams = (params: AppParams | null | undefined): OpenAiModel => {
  return normalizeOpenAiModel(params?.['openai.model']);
};

const AppParamsPage = () => {
  const { t } = useTranslation();
  const appParams = useAppParams();
  const resetFeedsMutation = useResetFeeds();

  const [cooldownInput, setCooldownInput] = useState('');
  const [timeWindowInput, setTimeWindowInput] = useState('');
  const [openAiModelInput, setOpenAiModelInput] = useState<OpenAiModel>(DEFAULT_OPENAI_MODEL);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidatingOpenAi, setIsValidatingOpenAi] = useState(false);

  const params = appParams.params;
  const isLoading = appParams.status === 'loading' || (appParams.status === 'idle' && appParams.isFetching);
  const hasData = appParams.status === 'success' && params;

  const getSuccessLoggedRef = useRef(false);
  const lastErrorRef = useRef<unknown>(null);

  useEffect(() => {
    Sentry.addBreadcrumb({
      category: 'app-params',
      message: 'app-params:view_opened',
      level: 'info',
    });
  }, []);

  useEffect(() => {
    if (appParams.status === 'success' && params && !getSuccessLoggedRef.current) {
      Sentry.addBreadcrumb({
        category: 'app-params',
        message: 'app-params:get_success',
        level: 'info',
      });
      getSuccessLoggedRef.current = true;
    }
  }, [appParams.status, params]);

  useEffect(() => {
    if (!appParams.error) {
      lastErrorRef.current = null;
      return;
    }

    if (lastErrorRef.current === appParams.error) {
      return;
    }

    lastErrorRef.current = appParams.error;
    Sentry.addBreadcrumb({
      category: 'app-params',
      message: 'app-params:get_error',
      level: 'error',
    });
  }, [appParams.error]);

  useEffect(() => {
    if (!params) {
      return;
    }

    setCooldownInput(String(params.posts_refresh_cooldown_seconds));
    setTimeWindowInput(String(params.posts_time_window_days));
    setOpenAiModelInput(resolveOpenAiModelFromParams(params));
  }, [params]);

  const cooldownValue = useMemo(() => parseInteger(cooldownInput), [cooldownInput]);
  const timeWindowValue = useMemo(() => parseInteger(timeWindowInput), [timeWindowInput]);
  const openAiModelValue = useMemo<OpenAiModel | null>(() => {
    return isOpenAiModel(openAiModelInput) ? openAiModelInput : null;
  }, [openAiModelInput]);
  const normalizedParams = useMemo(() => {
    if (!params) {
      return null;
    }

    return {
      cooldown: params.posts_refresh_cooldown_seconds,
      timeWindow: params.posts_time_window_days,
      openAiModel: resolveOpenAiModelFromParams(params),
    };
  }, [params]);

  const cooldownError = useMemo(() => {
    if (cooldownValue === null) {
      return t('appParams.validation.cooldownRequired', 'Informe um número inteiro maior ou igual a zero.');
    }

    if (cooldownValue < 0) {
      return t('appParams.validation.cooldownNegative', 'O cooldown não pode ser negativo.');
    }

    return null;
  }, [cooldownValue, t]);

  const timeWindowError = useMemo(() => {
    if (timeWindowValue === null) {
      return t('appParams.validation.windowRequired', 'Informe um número inteiro maior ou igual a um.');
    }

    if (timeWindowValue < 1) {
      return t('appParams.validation.windowTooSmall', 'A janela de tempo deve ser de pelo menos um dia.');
    }

    return null;
  }, [timeWindowValue, t]);

  const openAiModelError = useMemo(() => {
    if (!openAiModelValue) {
      return t('appParams.validation.openAiModelRequired', 'Selecione um modelo válido.');
    }

    return null;
  }, [openAiModelValue, t]);

  const isDirty = useMemo(() => {
    if (!normalizedParams || cooldownValue === null || timeWindowValue === null || !openAiModelValue) {
      return false;
    }

    return (
      cooldownValue !== normalizedParams.cooldown ||
      timeWindowValue !== normalizedParams.timeWindow ||
      openAiModelValue !== normalizedParams.openAiModel
    );
  }, [cooldownValue, openAiModelValue, normalizedParams, timeWindowValue]);

  const canSave =
    hasData && !cooldownError && !timeWindowError && !openAiModelError && isDirty && !isSaving;

  const handleValidateOpenAi = async () => {
    const modelToValidate = isOpenAiModel(openAiModelInput) ? openAiModelInput : null;

    setFeedback(null);
    setIsValidatingOpenAi(true);

    Sentry.addBreadcrumb({
      category: 'app-params',
      message: 'app-params:openai_validate_clicked',
      level: 'info',
    });

    const startedAt = performance.now();

    try {
      const result = await runOpenAiDiagnostics(modelToValidate ?? undefined);

      if (process.env.NODE_ENV !== 'production') {
        console.log('[app-params] openai.diag.result', result);
      }

      const latency = Number.isFinite(result.latencyMs)
        ? result.latencyMs
        : Math.round(performance.now() - startedAt);

      if (result.ok) {
        setFeedback({
          type: 'success',
          message: t(
            'appParams.feedback.openAiValidateSuccess',
            'Conexão com OpenAI OK (modelo: {{model}}, latência: {{latency}} ms).',
            { model: result.model, latency },
          ),
        });
        return;
      }

      const errorDetails = result.error ?? { status: null, code: null, message: null };
      setFeedback({
        type: 'error',
        message: t(
          'appParams.feedback.openAiValidateError',
          'Erro OpenAI: status {{status}} / code {{code}} / msg {{message}} (latência: {{latency}} ms).',
          {
            status: errorDetails.status ?? 'n/a',
            code: errorDetails.code ?? 'n/a',
            message: errorDetails.message ?? 'n/a',
            latency,
          },
        ),
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[app-params] openai.diag.error', error);
      }

      const fallback = t(
        'appParams.feedback.openAiValidateUnknown',
        'Não foi possível validar a conexão com a OpenAI. Tente novamente.',
      );
      const message = error instanceof HttpError ? fallback : resolveErrorMessage(error, fallback);
      setFeedback({ type: 'error', message });
    } finally {
      setIsValidatingOpenAi(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!params || !normalizedParams || cooldownValue === null || timeWindowValue === null || !openAiModelValue || !isDirty) {
      return;
    }

    const payload: AppParamsUpdateInput = {};
    if (cooldownValue !== normalizedParams.cooldown) {
      payload.posts_refresh_cooldown_seconds = cooldownValue;
    }
    if (timeWindowValue !== normalizedParams.timeWindow) {
      payload.posts_time_window_days = timeWindowValue;
    }
    if (openAiModelValue !== normalizedParams.openAiModel) {
      payload['openai.model'] = openAiModelValue;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);
    Sentry.addBreadcrumb({
      category: 'app-params',
      message: 'app-params:save_clicked',
      level: 'info',
    });

    try {
      const updated = await appParams.update(payload);
      Sentry.addBreadcrumb({
        category: 'app-params',
        message: 'app-params:update_success',
        level: 'info',
      });

      setCooldownInput(String(updated.posts_refresh_cooldown_seconds));
      setTimeWindowInput(String(updated.posts_time_window_days));
      setOpenAiModelInput(resolveOpenAiModelFromParams(updated));

      try {
        await resetFeedsMutation.mutateAsync();
        setFeedback({
          type: 'success',
          message: t('appParams.feedback.successWithReset', 'Parâmetros atualizados com sucesso. Feeds resetados com base nos novos parâmetros.'),
        });
      } catch (resetError) {
        Sentry.addBreadcrumb({
          category: 'app-params',
          message: 'app-params:reset_error',
          level: 'error',
        });
        setFeedback({
          type: 'warning',
          message: t(
            'appParams.feedback.successResetFailed',
            'Parâmetros atualizados com sucesso, mas não foi possível resetar os feeds automaticamente. Tente novamente pela tela de feeds.',
          ),
        });
      }
    } catch (error) {
      Sentry.addBreadcrumb({
        category: 'app-params',
        message: 'app-params:update_error',
        level: 'error',
      });
      setFeedback({
        type: 'error',
        message: resolveErrorMessage(
          error,
          t('appParams.feedback.error', 'Não foi possível atualizar os parâmetros. Tente novamente mais tarde.'),
        ),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetry = () => {
    setFeedback(null);
    appParams
      .refresh({ force: true })
      .catch((error) => {
        setFeedback({
          type: 'error',
          message: resolveErrorMessage(
            error,
            t('appParams.feedback.error', 'Não foi possível atualizar os parâmetros. Tente novamente mais tarde.'),
          ),
        });
      });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <LoadingSkeleton className="h-6 w-48" />
            <LoadingSkeleton className="h-4 w-64" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <LoadingSkeleton className="h-4 w-36" />
              <LoadingSkeleton className="h-10" />
            </div>
            <div className="space-y-2">
              <LoadingSkeleton className="h-4 w-44" />
              <LoadingSkeleton className="h-10" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <LoadingSkeleton className="h-4 w-40" />
              <LoadingSkeleton className="h-10" />
              <LoadingSkeleton className="h-3 w-72" />
            </div>
          </div>
          <LoadingSkeleton className="h-10 w-32" />
        </div>
      );
    }

    if (!params) {
      return (
        <ErrorState
          title={t('appParams.errors.loadFailed', 'Não foi possível carregar os parâmetros.')}
          description={t('appParams.errors.retry', 'Tente novamente. Se o problema persistir, contate o suporte.')}
          action={
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
              disabled={appParams.isFetching}
            >
              {appParams.isFetching
                ? t('appParams.actions.retrying', 'Tentando novamente...')
                : t('appParams.actions.retry', 'Tentar novamente')}
            </button>
          }
        />
      );
    }

    return (
      <form className="space-y-6" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">
              {t('appParams.fields.refreshCooldown', 'Cooldown de atualização (segundos)')}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={cooldownInput}
              onChange={(event) => {
                setCooldownInput(event.target.value);
                setFeedback(null);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {cooldownError ? (
              <span className="mt-1 block text-xs text-destructive" role="alert">
                {cooldownError}
              </span>
            ) : null}
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium">
              {t('appParams.fields.timeWindow', 'Janela de tempo dos posts (dias)')}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={timeWindowInput}
              onChange={(event) => {
                setTimeWindowInput(event.target.value);
                setFeedback(null);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {timeWindowError ? (
              <span className="mt-1 block text-xs text-destructive" role="alert">
                {timeWindowError}
              </span>
            ) : null}
          </label>

          <div className="text-sm sm:col-span-2">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label className="font-medium" htmlFor="app-params-openai-model">
                {t('appParams.fields.openAiModel', 'Modelo da OpenAI')}
              </label>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleValidateOpenAi}
                disabled={isValidatingOpenAi}
              >
                {isValidatingOpenAi
                  ? t('appParams.actions.validatingOpenAi', 'Validando...')
                  : t('appParams.actions.validateOpenAi', 'VALIDATE OPENAI')}
              </button>
            </div>
            <select
              id="app-params-openai-model"
              value={openAiModelInput}
              onChange={(event) => {
                setOpenAiModelInput(event.target.value as OpenAiModel);
                setFeedback(null);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {openAiModelOptions.map((option) => (
                <option key={option} value={option}>
                  {openAiModelLabels[option]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                'appParams.fields.openAiModelDescription',
                'Modelo usado para gerar os posts a partir das notícias (OpenAI).',
              )}
            </p>
            {openAiModelError ? (
              <span className="mt-1 block text-xs text-destructive" role="alert">
                {openAiModelError}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSave}
          >
            {isSaving ? t('appParams.actions.saving', 'Salvando...') : t('appParams.actions.save', 'Salvar')}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              if (!params) {
                return;
              }
              setCooldownInput(String(params.posts_refresh_cooldown_seconds));
              setTimeWindowInput(String(params.posts_time_window_days));
              setOpenAiModelInput(resolveOpenAiModelFromParams(params));
              setFeedback(null);
            }}
            disabled={!isDirty || isSaving}
          >
            {t('appParams.actions.cancel', 'Cancelar')}
          </button>
          {appParams.isFetching ? (
            <span className="text-xs text-muted-foreground">
              {t('appParams.status.refreshing', 'Sincronizando parâmetros...')}
            </span>
          ) : null}
        </div>
      </form>
    );
  };

  const inlineErrorMessage = appParams.error && params
    ? resolveErrorMessage(
        appParams.error,
        t('appParams.feedback.error', 'Não foi possível atualizar os parâmetros. Tente novamente mais tarde.'),
      )
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">
          {t('appParams.heading', 'Parâmetros da aplicação')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('appParams.subtitle', 'Ajuste os valores que controlam o processamento e a exibição dos posts.')}
        </p>
      </header>

      {feedback ? (
        <div
          role="alert"
          className={
            feedback.type === 'success'
              ? 'rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700'
              : feedback.type === 'warning'
                ? 'rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800'
                : 'rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive'
          }
        >
          {feedback.message}
        </div>
      ) : null}

      {inlineErrorMessage ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {inlineErrorMessage}
        </div>
      ) : null}

      <section className="card space-y-6 px-6 py-6">{renderContent()}</section>
    </div>
  );
};

export default AppParamsPage;
