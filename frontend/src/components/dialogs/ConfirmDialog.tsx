import type { ReactNode } from 'react';
import { useId } from 'react';
import { createPortal } from 'react-dom';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmLoadingLabel?: string;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
};

export const ConfirmDialog = ({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmLoadingLabel,
  confirmDisabled = false,
  cancelDisabled = false,
  destructive = true,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) => {
  const titleId = useId();
  const descriptionId = useId();

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const confirmButtonClassName = destructive
    ? 'inline-flex w-full items-center justify-center rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto'
    : 'inline-flex w-full items-center justify-center rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="fixed inset-0 bg-background/80 backdrop-blur" aria-hidden="true" />
        <dialog
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          aria-modal="true"
          className="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
          open
        >
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 id={titleId} className="text-lg font-semibold text-foreground">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>

          {children ? <div className="space-y-3">{children}</div> : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              onClick={onCancel}
              disabled={cancelDisabled}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={confirmButtonClassName}
              onClick={onConfirm}
              disabled={confirmDisabled}
            >
              {confirmDisabled && confirmLoadingLabel ? confirmLoadingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </div>,
    document.body,
  );
};

