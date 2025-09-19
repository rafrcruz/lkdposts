import { ReactNode } from 'react';
import { clsx } from 'clsx';

type ErrorStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export const ErrorState = ({ title, description, action, className }: ErrorStateProps) => (
  <div
    role="alert"
    className={clsx(
      'card border-danger/30 bg-danger/5 px-6 py-8 text-danger shadow-md transition-colors',
      className
    )}
  >
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="text-sm text-danger/80">{description}</p> : null}
      {action}
    </div>
  </div>
);

