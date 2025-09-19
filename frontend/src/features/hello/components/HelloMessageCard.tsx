import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingSkeleton } from '@/components/feedback/LoadingSkeleton';
import { EmptyState } from '@/components/feedback/EmptyState';

import { useHelloMessage } from '../hooks/useHelloMessage';

export const HelloMessageCard = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } = useHelloMessage();
  const handleRefetch = () => {
    refetch().catch((error) => {
      console.error('Failed to refetch hello message', error);
    });
  };

  if (isLoading) {
    return (
      <div className="card flex flex-col gap-4 px-8 py-10">
        <LoadingSkeleton className="h-8 w-1/2 self-center" />
        <LoadingSkeleton className="h-4 w-2/3 self-center" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t('hello.errorTitle')}
        description={t('hello.errorDescription')}
        action={
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
            onClick={handleRefetch}
            disabled={isRefetching}
          >
            {isRefetching ? t('actions.tryingAgain') : t('actions.tryAgain')}
          </button>
        }
      />
    );
  }

  if (!data?.message) {
    return (
      <EmptyState
        title={t('hello.emptyTitle')}
        description={t('hello.emptyDescription')}
      />
    );
  }

  return (
    <div className="card flex flex-col items-center gap-6 px-8 py-12 text-center">
      <h1 className="text-balance text-4xl font-bold text-foreground sm:text-5xl">
        {data.message}
      </h1>
      <p className="max-w-xl text-balance text-sm text-muted-foreground">
        {t('hello.subtitle')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleRefetch}
          className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary"
          disabled={isRefetching}
        >
          {isRefetching ? t('actions.refreshing') : t('actions.refresh')}
        </button>
      </div>
    </div>
  );
};

