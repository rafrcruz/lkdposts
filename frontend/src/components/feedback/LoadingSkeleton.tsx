import { clsx } from 'clsx';

type LoadingSkeletonProps = {
  className?: string;
};

export const LoadingSkeleton = ({ className }: LoadingSkeletonProps) => (
  <div
    aria-hidden="true"
    data-testid="loading-skeleton"
    className={clsx('h-4 w-full animate-skeleton rounded-md bg-gradient-to-r from-muted via-muted/60 to-muted', className)}
  />
);
