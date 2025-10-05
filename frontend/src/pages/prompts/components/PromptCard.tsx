import type { ChangeEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { clsx } from 'clsx';
import type { TFunction } from 'i18next';

import type { Prompt } from '@/features/prompts/types/prompt';

export type PromptCardRenderOptions = {
  setNodeRef?: (element: HTMLDivElement | null) => void;
  containerAttributes?: Partial<DraggableAttributes>;
  handleListeners?: SyntheticListenerMap;
  handleAttributes?: Partial<DraggableAttributes>;
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

type PromptContentInfo = {
  displayContent: string;
  shouldShowToggle: boolean;
  statusLabel: string;
  toggleAriaLabel: string;
};

type PromptReorderConfig = {
  containerAttributes: Partial<DraggableAttributes>;
  handleAttributes: Partial<DraggableAttributes>;
  handleListeners: SyntheticListenerMap;
  showPlaceholder: boolean;
  isDragging: boolean;
  isSorting: boolean;
  isOverlay: boolean;
  isKeyboardActive: boolean;
  isGrabbed: boolean;
};

const resolvePromptContentInfo = (
  prompt: Prompt,
  t: TFunction,
  contentPreviewLimit: number,
): PromptContentInfo => {
  const normalizedContent = prompt.content.trim();
  const displayContent = normalizedContent.length > 0 ? prompt.content : '...';
  const shouldShowToggle =
    normalizedContent.length > contentPreviewLimit || normalizedContent.includes('\n');
  const statusLabel = prompt.enabled
    ? t('prompts.status.enabled', 'Enabled')
    : t('prompts.status.disabled', 'Disabled');
  const toggleAriaLabel = prompt.enabled
    ? t('prompts.toggle.disable', 'Disable prompt')
    : t('prompts.toggle.enable', 'Enable prompt');

  return { displayContent, shouldShowToggle, statusLabel, toggleAriaLabel };
};

const resolveReorderConfig = (
  options: PromptCardRenderOptions | undefined,
  canReorder: boolean,
): PromptReorderConfig => {
  const containerAttributes: Partial<DraggableAttributes> = options?.containerAttributes ?? {};
  const { role, tabIndex, onKeyDown, ...restContainerAttributes } = containerAttributes as {
    role?: string;
    tabIndex?: number;
    onKeyDown?: PromptCardRenderOptions['onKeyDown'];
  };
  const isOverlay = options?.isOverlay ?? false;
  const isDragging = options?.isDragging ?? false;
  const isSorting = options?.isSorting ?? false;
  const isKeyboardActive = options?.isKeyboardActive ?? false;

  return {
    containerAttributes: restContainerAttributes,
    handleAttributes: {
      ...(role !== undefined || tabIndex !== undefined || onKeyDown !== undefined
        ? { role, tabIndex, onKeyDown }
        : {}),
      ...(options?.handleAttributes ?? {}),
    },
    handleListeners: (canReorder ? options?.handleListeners ?? {} : {}) as SyntheticListenerMap,
    showPlaceholder: Boolean(options?.showPlaceholder && !isOverlay),
    isDragging,
    isSorting,
    isOverlay,
    isKeyboardActive,
    isGrabbed: Boolean(isDragging || isKeyboardActive || options?.isActive),
  };
};

const createPromptRefAssigner = (
  promptId: string,
  registerItemRef: (id: string) => (element: HTMLDivElement | null) => void,
  options: PromptCardRenderOptions | undefined,
) => {
  const register = registerItemRef(promptId);

  return (element: HTMLDivElement | null) => {
    if (!options?.isOverlay) {
      register(element);
    }

    options?.setNodeRef?.(element);
  };
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
  const { displayContent, shouldShowToggle, statusLabel, toggleAriaLabel } = resolvePromptContentInfo(
    prompt,
    t,
    contentPreviewLimit,
  );
  const contentElementId = `prompt-content-${prompt.id}`;
  const isEnabled = prompt.enabled;
  const canMoveUp = options?.canMoveUp ?? false;
  const canMoveDown = options?.canMoveDown ?? false;
  const reorderHandleLabel = t('prompts.list.dragHandleLabel', 'Drag handle: hold and move to reorder.');
  const dropPlaceholderLabel = t('prompts.list.dropPlaceholder', 'Release to place the prompt here.');
  const reorderConfig = resolveReorderConfig(options, canReorder);
  const assignRef = createPromptRefAssigner(prompt.id, registerItemRef, options);

  const handleSelectionChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelectionChange(event.target.checked);
  };

  return (
      <div
        ref={assignRef}
        {...reorderConfig.containerAttributes}
        role="group"
        className={clsx(
          'relative card flex flex-col gap-4 p-4 outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-primary',
        'hover:shadow-sm',
        reorderConfig.isOverlay ? 'pointer-events-none' : '',
        reorderConfig.showPlaceholder ? 'border-2 border-dashed border-primary/60 bg-primary/5 shadow-none' : '',
        reorderConfig.isDragging || reorderConfig.isOverlay ? 'scale-[1.01] shadow-xl ring-2 ring-primary/40' : '',
        reorderConfig.isKeyboardActive ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-background shadow-lg border-primary/70' : '',
        reorderConfig.isSorting ? 'transition-transform duration-200 ease-out' : '',
        isEnabled ? '' : 'border-dashed border-border/70 bg-muted/30',
      )}
      style={options?.style}
      data-dragging={reorderConfig.isDragging}
      data-keyboard-grabbed={reorderConfig.isKeyboardActive ? 'true' : undefined}
      aria-grabbed={reorderConfig.isGrabbed}
      >
        <PromptPlaceholderOverlay show={reorderConfig.showPlaceholder} label={dropPlaceholderLabel} />
        <div className={clsx('flex flex-col gap-4', reorderConfig.showPlaceholder ? 'invisible' : '')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 gap-3">
            <div className="flex items-start gap-3">
              <PromptSelectionCheckbox
                isSelected={isSelected}
                onChange={handleSelectionChange}
                label={t('prompts.selection.toggle', 'Select prompt')}
              />
                <PromptReorderHandle
                  canReorder={canReorder}
                  handleListeners={reorderConfig.handleListeners}
                  handleAttributes={reorderConfig.handleAttributes}
                  isDragging={reorderConfig.isDragging}
                  isActive={options?.isActive ?? false}
                reorderHandleLabel={reorderHandleLabel}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                onMoveUp={options?.onMoveUp}
                onMoveDown={options?.onMoveDown}
                t={t}
              />
            </div>
            <PromptContentSection
              prompt={prompt}
              displayContent={displayContent}
              shouldShowToggle={shouldShowToggle}
              isExpanded={isExpanded}
              onToggleExpansion={onToggleExpansion}
              contentElementId={contentElementId}
              t={t}
            />
          </div>
          <PromptSideControls
            isEnabled={isEnabled}
            toggleAriaLabel={toggleAriaLabel}
            statusLabel={statusLabel}
            onToggleEnabled={() => onToggleEnabled(prompt, !isEnabled)}
            isTogglePending={isTogglePending}
            prompt={prompt}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            isDuplicating={isDuplicating}
            isDuplicateInFlight={isDuplicateInFlight}
            isDeleting={isDeleting}
            deletingId={deletingId}
            t={t}
          />
        </div>
        <PromptMetadata prompt={prompt} t={t} />
      </div>
    </div>
  );
};

type PromptSelectionCheckboxProps = {
  isSelected: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  label: string;
};

const PromptSelectionCheckbox = ({ isSelected, onChange, label }: PromptSelectionCheckboxProps) => (
  <div className="pt-1">
    <input
      type="checkbox"
      className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40"
      checked={isSelected}
      onChange={onChange}
      aria-label={label}
    />
  </div>
);

type PromptReorderHandleProps = {
  canReorder: boolean;
  handleListeners: SyntheticListenerMap;
  handleAttributes: Partial<DraggableAttributes>;
  isDragging: boolean;
  isActive: boolean;
  reorderHandleLabel: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  t: TFunction;
};

const PromptReorderHandle = ({
  canReorder,
  handleListeners,
  handleAttributes,
  isDragging,
  isActive,
  reorderHandleLabel,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  t,
}: PromptReorderHandleProps) => (
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
      {...handleAttributes}
      disabled={!canReorder}
      aria-label={reorderHandleLabel}
      data-active={isActive ? 'true' : undefined}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
        <path d="M7 4h6M7 10h6M7 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
    {canReorder ? (
      <div className="sr-only space-y-1">
        <button type="button" onClick={onMoveUp} disabled={!canMoveUp}>
          {t('prompts.list.moveUp', 'Move prompt up')}
        </button>
        <button type="button" onClick={onMoveDown} disabled={!canMoveDown}>
          {t('prompts.list.moveDown', 'Move prompt down')}
        </button>
      </div>
    ) : null}
  </div>
);

type PromptContentSectionProps = {
  prompt: Prompt;
  displayContent: string;
  shouldShowToggle: boolean;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  contentElementId: string;
  t: TFunction;
};

const PromptContentSection = ({
  prompt,
  displayContent,
  shouldShowToggle,
  isExpanded,
  onToggleExpansion,
  contentElementId,
  t,
}: PromptContentSectionProps) => (
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
          {isExpanded ? t('prompts.actions.collapse', 'Collapse') : t('prompts.actions.expand', 'Expand')}
        </button>
      ) : null}
    </div>
  </div>
);

type PromptSideControlsProps = {
  isEnabled: boolean;
  toggleAriaLabel: string;
  statusLabel: string;
  onToggleEnabled: () => void;
  isTogglePending: boolean;
  prompt: Prompt;
  onEdit: (prompt: Prompt) => void;
  onDuplicate: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
  isDuplicating: boolean;
  isDuplicateInFlight: boolean;
  isDeleting: boolean;
  deletingId: string | null;
  t: TFunction;
};

const PromptSideControls = ({
  isEnabled,
  toggleAriaLabel,
  statusLabel,
  onToggleEnabled,
  isTogglePending,
  prompt,
  onEdit,
  onDuplicate,
  onDelete,
  isDuplicating,
  isDuplicateInFlight,
  isDeleting,
  deletingId,
  t,
}: PromptSideControlsProps) => (
  <div className="flex flex-col items-stretch gap-3 sm:items-end">
    <button
      type="button"
      role="switch"
      aria-checked={isEnabled}
      aria-label={toggleAriaLabel}
      onClick={onToggleEnabled}
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
);

type PromptMetadataProps = {
  prompt: Prompt;
  t: TFunction;
};

const PromptMetadata = ({ prompt, t }: PromptMetadataProps) => (
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
);

type PromptPlaceholderOverlayProps = {
  show: boolean;
  label: string;
};

const PromptPlaceholderOverlay = ({ show, label }: PromptPlaceholderOverlayProps) => (
  show ? (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-primary/5">
      <span className="animate-pulse text-sm font-medium text-primary/80">{label}</span>
    </div>
  ) : null
);
