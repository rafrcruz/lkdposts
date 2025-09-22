import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';

import i18n from '@/config/i18n';
import type { AuthContextValue } from '@/features/auth/context/AuthContext';
import type { AuthSession } from '@/features/auth/api/auth';

import { HelloMessageCard } from './HelloMessageCard';
import { useHelloMessage } from '../hooks/useHelloMessage';
import type { HelloMessage } from '../types/hello';
import { useAuth } from '@/features/auth/hooks/useAuth';

vi.mock('../hooks/useHelloMessage');
vi.mock('@/features/auth/hooks/useAuth');

const mockedUseHelloMessage = vi.mocked(useHelloMessage);
const mockedUseAuth = vi.mocked(useAuth);

const renderComponent = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <HelloMessageCard />
    </I18nextProvider>
  );

describe('HelloMessageCard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const buildResult = (override: Partial<UseQueryResult<HelloMessage>>): UseQueryResult<HelloMessage> => ({
    data: undefined,
    status: 'success',
    fetchStatus: 'idle',
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isRefetchError: false,
    isRefetching: false,
    isSuccess: true,
    refetch: vi.fn(),
    remove: vi.fn(),
    dataUpdatedAt: Date.now(),
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureReasonUpdatedAt: 0,
    isPending: false,
    ...override,
  });

  const buildAuthValue = (override: Partial<AuthContextValue> = {}): AuthContextValue => {
    const defaultUser = { email: 'user@example.com', role: 'user', expiresAt: new Date().toISOString() };
    const hasUserOverride = Object.hasOwn(override, 'user');
    const resolvedUser = (hasUserOverride ? override.user : defaultUser) as AuthContextValue['user'];
    const resolvedSession: AuthSession = resolvedUser
      ? { authenticated: true, user: resolvedUser }
      : { authenticated: false, user: null };

    return {
      status: 'authenticated',
      user: resolvedUser,
      isAuthenticating: false,
      authError: null,
      loginWithGoogle: vi.fn(),
      logout: vi.fn(),
      clearAuthError: vi.fn(),
      refreshSession:
        override.refreshSession ??
        vi.fn<[], Promise<AuthSession>>(() => Promise.resolve(resolvedSession)),
      ...override,
    };
  };

  it('renders authentication notice when session is missing', () => {
    mockedUseAuth.mockReturnValue(buildAuthValue({ status: 'guest', user: null }));
    mockedUseHelloMessage.mockReturnValue(buildResult({ isSuccess: false, isFetched: false }));

    renderComponent();

    expect(screen.getByText(/Autenticacao necessaria/i)).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    mockedUseAuth.mockReturnValue(buildAuthValue());
    mockedUseHelloMessage.mockReturnValue(buildResult({ isLoading: true }));

    renderComponent();

    expect(screen.getAllByTestId('loading-skeleton')).toHaveLength(2);
  });

  it('renders message when data is available', () => {
    mockedUseAuth.mockReturnValue(buildAuthValue());
    mockedUseHelloMessage.mockReturnValue(
      buildResult({ data: { message: 'hello mundo' }, isLoading: false, isSuccess: true })
    );

    renderComponent();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('hello mundo');
  });

  it('renders error state when query fails', () => {
    mockedUseAuth.mockReturnValue(buildAuthValue());
    mockedUseHelloMessage.mockReturnValue(
      buildResult({ isError: true, isSuccess: false, error: new Error('fail') })
    );

    renderComponent();

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
