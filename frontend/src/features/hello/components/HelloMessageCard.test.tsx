import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';

import i18n from '@/config/i18n';

import { HelloMessageCard } from './HelloMessageCard';
import { useHelloMessage } from '../hooks/useHelloMessage';
import type { HelloMessage } from '../types/hello';

vi.mock('../hooks/useHelloMessage');

const mockedUseHelloMessage = vi.mocked(useHelloMessage);

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

  it('renders loading skeleton', () => {
    mockedUseHelloMessage.mockReturnValue(buildResult({ isLoading: true }));

    renderComponent();

    expect(screen.getAllByTestId('loading-skeleton')).toHaveLength(2);
  });

  it('renders message when data is available', () => {
    mockedUseHelloMessage.mockReturnValue(
      buildResult({ data: { message: 'hello mundo' }, isLoading: false, isSuccess: true })
    );

    renderComponent();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('hello mundo');
  });

  it('renders error state when query fails', () => {
    mockedUseHelloMessage.mockReturnValue(
      buildResult({ isError: true, isSuccess: false, error: new Error('fail') })
    );

    renderComponent();

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});


