import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';

import App from './app/App';
import { AuthProvider } from './features/auth/context/AuthContext';
import { ENV } from './config/env';
import i18n from './config/i18n';
import { HttpError } from './lib/api/http';

import './styles/theme.css';
import './styles/global.css';

type QueryLogger = {
  log: (...params: unknown[]) => void;
  warn: (...params: unknown[]) => void;
  error: (error: unknown) => void;
};

type QueryClientConfigWithLogger = ConstructorParameters<typeof QueryClient>[0] & {
  logger?: QueryLogger;
};

const releaseVersion: string = __APP_VERSION__ || 'unknown';
const environmentMode: string = typeof import.meta.env.MODE === 'string' && import.meta.env.MODE !== '' ? import.meta.env.MODE : 'development';

if (ENV.SENTRY_DSN) {
  Sentry.init({
    dsn: ENV.SENTRY_DSN,
    environment: environmentMode,
    release: releaseVersion,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    autoSessionTracking: true,
  });
}

const queryLogger: QueryLogger = {
  log: (...params: unknown[]) => {
    console.log(...params);
  },
  warn: (...params: unknown[]) => {
    console.warn(...params);
  },
  error: (error: unknown) => {
    if (error instanceof HttpError && error.status === 401) {
      return;
    }
    console.error(error);
  },
};

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const queryClientConfig: QueryClientConfigWithLogger = {
  logger: queryLogger,
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof HttpError && error.status === 401) {
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 60_000,
    },
  },
};

const queryClient = new QueryClient(queryClientConfig);

// eslint-disable-next-line react-refresh/only-export-components
const ErrorFallback: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
    <div className="card max-w-md space-y-4 px-6 py-8">
      <h1 className="text-xl font-semibold text-foreground">Algo deu errado</h1>
      <p className="text-sm text-muted-foreground">
        Encontramos um erro inesperado. Tente recarregar a pagina ou voltar mais tarde.
      </p>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
        onClick={() => {
          window.location.reload();
        }}
      >
        Recarregar
      </button>
    </div>
  </div>
);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
