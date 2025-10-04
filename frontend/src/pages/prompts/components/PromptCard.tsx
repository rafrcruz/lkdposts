import type { ChangeEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { clsx } from 'clsx';
import type { TFunction } from 'i18next';

import type { Prompt } from '@/features/prompts/types/prompt';

export type PromptCardRenderOptions = {
  setNodeRef?: (element: HTMLDivElement | null) => void;
  containerAttributes?: DraggableAttributes;
  handleListeners?: SyntheticListenerMap;
  style?: CSSProperties;
  isDragging?: boolean;
  isSorting?: boolean;
  isOverlay?: boolean;
  isActive?: boolean;
  showPlaceholder?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  isKeyboardActive?: boolean;
};

export type PromptCardProps = {
  prompt: Prompt;
  options?: PromptCardRenderOptions;
  isSelected: boolean;
  onSelectionChange: (checked: boolean) => void;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  canReorder: boolean;
  registerItemRef: (id: string) => (element: HTMLDivElement | null) => void;
  t: TFunction;
  onToggleEnabled: (prompt: Prompt, nextEnabled: boolean) => void;
  isTogglePending: boolean;
  onEdit: (prompt: Prompt) => void;
  onDuplicate: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
  isDuplicating: boolean;
  isDuplicateInFlight: boolean;
  isDeleting: boolean;
  deletingId: string | null;
  contentPreviewLimit: number;
};

export const PromptCard = ({
  prompt,
  options,
  isSelected,
  onSelectionChange,
  isExpanded,
  onToggleExpansion,
  canReorder,
  registerItemRef,
  t,
  onToggleEnabled,
  isTogglePending,
  onEdit,
  onDuplicate,
  onDelete,
  isDuplicating,
  isDuplicateInFlight,
  isDeleting,
  deletingId,
  contentPreviewLimit,
}: PromptCardProps) => {
  const normalizedContent = prompt.content.trim();
  const displayContent = normalizedContent.length > 0 ? prompt.content : '...';
  const shouldShowToggle =
    normalizedContent.length > contentPreviewLimit || normalizedContent.includes('\n');
  const contentElementId = `prompt-content-${prompt.id}`;
  const isEnabled = prompt.enabled;
  const statusLabel = isEnabled
    ? t('prompts.status.enabled', 'Enabled')
    : t('prompts.status.disabled', 'Disabled');
  const toggleAriaLabel = isEnabled
    ? t('prompts.toggle.disable', 'Disable prompt')
    : t('prompts.toggle.enable', 'Enable prompt');

  const canMoveUp = options?.canMoveUp ?? false;
  const canMoveDown = options?.canMoveDown ?? false;
  const showPlaceholder = Boolean(options?.showPlaceholder && !options?.isOverlay);
  const isDragging = options?.isDragging ?? false;
  const isSorting = options?.isSorting ?? false;
  const isOverlay = options?.isOverlay ?? false;
  const isKeyboardActive = options?.isKeyboardActive ?? false;
  const isGrabbed = Boolean(isDragging || isKeyboardActive || options?.isActive);
  const reorderHandleLabel = t('prompts.list.dragHandleLabel', 'Drag handle: hold and move to reorder.');
  const dropPlaceholderLabel = t('prompts.list.dropPlaceholder', 'Release to place the prompt here.');
  type PromptContainerAttributes = DraggableAttributes & {
    role?: string;
    tabIndex?: number;
    onKeyDown?: PromptCardRenderOptions['onKeyDown'];
  };
  const containerAttributes: Partial<PromptContainerAttributes> =
    options?.containerAttributes ?? {};
  const {
    role: providedRole,
    tabIndex: providedTabIndex,
    onKeyDown: providedOnKeyDown,
    ...restContainerAttributes
  } = containerAttributes;
  const interactiveRole = providedRole ?? (canReorder ? 'button' : 'group');
  const interactiveTabIndex = providedTabIndex ?? (canReorder ? 0 : undefined);
  const interactiveKeyDown = canReorder
    ? options?.onKeyDown ?? providedOnKeyDown
    : undefined;
  const handleListeners = canReorder ? options?.handleListeners ?? {} : {};

  const assignRef = (element: HTMLDivElement | null) => {
    if (!options?.isOverlay) {
      registerItemRef(prompt.id)(element);
    }

    if (options?.setNodeRef) {
      options.setNodeRef(element);
    }
  };

  const handleSelectionChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelectionChange(event.target.checked);
  };

  return (
    <div
      ref={assignRef}
      {...restContainerAttributes}
      role={interactiveRole}
      tabIndex={interactiveTabIndex}
      className={clsx(
        'relative card flex flex-col gap-4 p-4 outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-primary',
        'hover:shadow-sm',
        isOverlay ? 'pointer-events-none' : '',
        showPlaceholder ? 'border-2 border-dashed border-primary/60 bg-primary/5 shadow-none' : '',
        isDragging || isOverlay ? 'scale-[1.01] shadow-xl ring-2 ring-primary/40' : '',
        isKeyboardActive ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-background shadow-lg border-primary/70' : '',
        isSorting ? 'transition-transform duration-200 ease-out' : '',
        isEnabled ? '' : 'border-dashed border-border/70 bg-muted/30',
      )}
      style={options?.style}
      data-dragging={isDragging}
      data-keyboard-grabbed={isKeyboardActive ? 'true' : undefined}
      aria-grabbed={isGrabbed}
      onKeyDown={interactiveKeyDown}
    >
      {showPlaceholder ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-primary/5">
          <span className="animate-pulse text-sm font-medium text-primary/80">{dropPlaceholderLabel}</span>
        </div>
      ) : null}
      <div className={clsx('flex flex-col gap-4', showPlaceholder ? 'invisible' : '')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 gap-3">
            <div className="flex items-start gap-3">
              <div className="pt-1">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40"
                  checked={isSelected}
                  onChange={handleSelectionChange}
                  aria-label={t('prompts.selection.toggle', 'Select prompt')}
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  className={clsx(
                    'group flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-foreground/80 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    canReorder
                      ? 'cursor-grab hover:border-primary hover:text-foreground active:cursor-grabbing'
                      : 'cursor-not-allowed opacity-60',
                    isDragging ? 'cursor-grabbing border-primary bg-background text-foreground shadow-sm' : '',
                  )}
                  {...handleListeners}
                  disabled={!canReorder}
                  aria-label={reorderHandleLabel}
                  data-active={options?.isActive ? 'true' : undefined}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                    <path d="M7 4h6M7 10h6M7 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
                {canReorder ? (
                  <div className="sr-only space-y-1">
                    <button type="button" onClick={options?.onMoveUp} disabled={!canMoveUp || !canReorder}>
                      {t('prompts.list.moveUp', 'Move prompt up')}
                    </button>
                    <button type="button" onClick={options?.onMoveDown} disabled={!canMoveDown || !canReorder}>
                      {t('prompts.list.moveDown', 'Move prompt down')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-3">
              <h3 className="text-base font-semibold text-foreground">{prompt.title}</h3>
              <div className="space-y-2">
                <div
                  id={contentElementId}
                  className={clsx(
                    'whitespace-pre-wrap break-words text-sm text-muted-foreground',
                    !isExpanded && shouldShowToggle ? 'line-clamp-3' : '',
                  )}
                >
                  {displayContent}
                </div>
                {shouldShowToggle ? (
                  <button
                    type="button"
                    onClick={onToggleExpansion}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary/80"
                    aria-expanded={isExpanded}
                    aria-controls={contentElementId}
                  >
                    {isExpanded
                      ? t('prompts.actions.collapse', 'Collapse')
                      : t('prompts.actions.expand', 'Expand')}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              aria-label={toggleAriaLabel}
              onClick={() => onToggleEnabled(prompt, !isEnabled)}
              disabled={isTogglePending}
              className={clsx(
                'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition',
                isEnabled
                  ? 'border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                  : 'border-border text-muted-foreground hover:bg-muted',
                isTogglePending ? 'cursor-not-allowed opacity-60' : '',
              )}
            >
              <span
                aria-hidden="true"
                className={clsx('inline-flex h-2.5 w-2.5 rounded-full', isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground')}
              />
              {statusLabel}
            </button>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start">
              <button
                type="button"
                onClick={() => onEdit(prompt)}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                {t('prompts.actions.edit', 'Edit')}
              </button>
              <button
                type="button"
                onClick={() => onDuplicate(prompt)}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                disabled={isDuplicating}
              >
                {isDuplicateInFlight
                  ? t('prompts.actions.duplicating', 'Duplicating...')
                  : t('prompts.actions.duplicate', 'Duplicate')}
              </button>
              <button
                type="button"
                onClick={() => onDelete(prompt)}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                disabled={isDeleting}
              >
                {isDeleting && deletingId === prompt.id
                  ? t('prompts.actions.deleting', 'Deleting...')
                  : t('prompts.actions.delete', 'Delete')}
              </button>
            </div>
          </div>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{t('prompts.list.updatedAt', 'Last updated:')}</span>{' '}
            {new Date(prompt.updatedAt).toLocaleString()}
          </p>
          <p>
            <span className="font-medium text-foreground">{t('prompts.list.createdAt', 'Created:')}</span>{' '}
            {new Date(prompt.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};
