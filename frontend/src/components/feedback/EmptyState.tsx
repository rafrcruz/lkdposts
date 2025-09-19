import { ReactNode } from 'react';
import { clsx } from 'clsx';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export const EmptyState = ({ title, description, icon, action, className }: EmptyStateProps) => (
  <div
    className={clsx(
      'card flex flex-col items-center justify-center gap-3 px-6 py-10 text-center text-muted-foreground',
      className
    )}
  >
    {icon}
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    {description ? <p className="max-w-md text-sm text-muted-foreground text-balance">{description}</p> : null}
    {action}
  </div>
);

