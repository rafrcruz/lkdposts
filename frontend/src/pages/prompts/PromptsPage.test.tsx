import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import PromptsPage from './PromptsPage';
import i18n from '@/config/i18n';
import {
  useCreatePrompt,
  useDeletePrompt,
  usePromptList,
  useReorderPrompts,
  useUpdatePrompt,
} from '@/features/prompts/hooks/usePrompts';
import type { Prompt } from '@/features/prompts/types/prompt';
import { HttpError } from '@/lib/api/http';

vi.mock('@/features/prompts/hooks/usePrompts', () => ({
  usePromptList: vi.fn(),
  useCreatePrompt: vi.fn(),
  useUpdatePrompt: vi.fn(),
  useDeletePrompt: vi.fn(),
  useReorderPrompts: vi.fn(),
}));

vi.mock(
  '@tanstack/react-virtual',
  () => ({
    useVirtualizer: vi.fn(() => ({
      getVirtualItems: () => [],
      getTotalSize: () => 0,
      measure: vi.fn(),
      scrollToIndex: vi.fn(),
    })),
  }),
  { virtual: true },
);

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

const mockedUsePromptList = vi.mocked(usePromptList);
const mockedUseCreatePrompt = vi.mocked(useCreatePrompt);
const mockedUseUpdatePrompt = vi.mocked(useUpdatePrompt);
const mockedUseDeletePrompt = vi.mocked(useDeletePrompt);
const mockedUseReorderPrompts = vi.mocked(useReorderPrompts);

type MutationOverrides<TData, TVariables> = Partial<
  Omit<UseMutationResult<TData, HttpError, TVariables>, 'mutate'>
>;

type MutationMock<TVariables> = Mock<
  (variables: TVariables, options?: Parameters<UseMutationResult<unknown, HttpError, TVariables>['mutate']>[1]) => void
>;

let promptCounter = 1;

const buildPrompt = (override: Partial<Prompt> = {}): Prompt => ({
  id: override.id ?? `prompt-${promptCounter++}`,
  title: override.title ?? 'Sample prompt',
  content: override.content ?? 'Provide a summary of the latest company news.',
  position: override.position ?? 1,
  enabled: override.enabled ?? true,
  createdAt: override.createdAt ?? '2024-01-01T00:00:00.000Z',
  updatedAt: override.updatedAt ?? '2024-01-01T00:00:00.000Z',
});

const createQueryResult = (
  data: Prompt[],
  overrides: Partial<UseQueryResult<Prompt[], HttpError>> = {},
): UseQueryResult<Prompt[], HttpError> => {
  const refetch = vi.fn();
  const remove = vi.fn();
  const base: UseQueryResult<Prompt[], HttpError> = {
    data,
    dataUpdatedAt: Date.now(),
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    failureReasonUpdatedAt: 0,
    fetchStatus: 'idle',
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isRefetchError: false,
    isRefetching: false,
    isSuccess: true,
    refetch,
    remove,
    status: 'success',
  };

  return { ...base, ...overrides };
};

const createMutationResult = <TData, TVariables>(
  mutateMock: MutationMock<TVariables>,
  overrides: MutationOverrides<TData, TVariables> = {},
): UseMutationResult<TData, HttpError, TVariables> => {
  const mutate: UseMutationResult<TData, HttpError, TVariables>['mutate'] = (variables, options) => {
    mutateMock(variables, options);
  };

  return {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: true,
    isPending: false,
    isPaused: false,
    isSuccess: false,
    mutate,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    status: 'idle',
    submittedAt: 0,
    variables: undefined,
    ...overrides,
  };
};

const renderPage = () => {
  return render(
    <I18nextProvider i18n={i18n}>
      <PromptsPage />
    </I18nextProvider>,
  );
};

describe('PromptsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    promptCounter = 1;
  });

  it('renders the prompt list with preview', () => {
    const prompts = [
      buildPrompt({
        id: 'prompt-1',
        title: 'Welcome message',
        content: 'Draft a welcome message for new followers.',
        position: 1,
      }),
      buildPrompt({
        id: 'prompt-2',
        title: 'Launch announcement',
        content: Array.from(
          { length: 4 },
          () =>
            'Write an enthusiastic LinkedIn post announcing our new product launch with key benefits and a call to action for demo requests.',
        ).join(' '),
        position: 2,
      }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /prompts/i })).toBeInTheDocument();
    expect(screen.getByText('Welcome message')).toBeInTheDocument();
    expect(screen.getByText(/Write an enthusiastic LinkedIn post/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
  });

  it('toggles prompt content expansion inline', async () => {
    const user = userEvent.setup();
    const longContent = ['Line 1 of the prompt', 'Line 2 adds more context', 'Line 3 continues details', 'Line 4 wraps up'].join(
      '\n',
    );
    const prompts = [
      buildPrompt({ id: 'prompt-10', title: 'Detailed prompt', content: longContent, position: 1 }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    const toggle = screen.getByRole('button', { name: /expand/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    const collapseToggle = await screen.findByRole('button', { name: /collapse/i });
    expect(collapseToggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(collapseToggle);
    const expandToggle = await screen.findByRole('button', { name: /expand/i });
    expect(expandToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('creates a new prompt successfully', async () => {
    const user = userEvent.setup();
    const mutateMock = vi.fn((variables: { title: string; content: string }, options?: { onSuccess?: (prompt: Prompt) => void }) => {
      options?.onSuccess?.(buildPrompt({ id: 'prompt-3', title: variables.title, content: variables.content }));
    });

    mockedUsePromptList.mockReturnValue(createQueryResult([]));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(mutateMock));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    await user.click(screen.getByRole('button', { name: /new prompt/i }));
    await user.type(screen.getByLabelText('Title'), 'Growth update');
    await user.type(screen.getByLabelText('Content'), 'Share quarterly growth metrics and key learnings.');
    await user.click(screen.getByRole('button', { name: /save prompt/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      { title: 'Growth update', content: 'Share quarterly growth metrics and key learnings.' },
      expect.any(Object),
    );

    expect(await screen.findByText('Prompt created successfully.')).toBeInTheDocument();
  });

  it('duplicates a prompt and appends copy suffix', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'Newsletter', content: 'Write the weekly newsletter.', position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Launch teaser', content: 'Preview the next launch.', position: 3 }),
    ];

    const mutateMock = vi.fn(
      (
        variables: { title: string; content: string; position?: number },
        options?: { onSuccess?: (prompt: Prompt) => void },
      ) => {
        options?.onSuccess?.(
          buildPrompt({
            id: 'prompt-3',
            title: variables.title,
            content: variables.content,
            position: variables.position ?? 0,
          }),
        );
      },
    );

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(mutateMock));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    const duplicateButtons = screen.getAllByRole('button', { name: /duplicate/i });
    await user.click(duplicateButtons[0]);

    expect(mutateMock).toHaveBeenCalledWith(
      {
        title: 'Newsletter (cópia)',
        content: 'Write the weekly newsletter.',
        position: 4,
      },
      expect.any(Object),
    );

    expect(await screen.findByText('Prompt duplicated successfully.')).toBeInTheDocument();
  });

  it('allows reordering after duplicating a prompt', async () => {
    const user = userEvent.setup();
    let prompts: Prompt[] = [
      buildPrompt({ id: 'prompt-11', title: 'Primary prompt', position: 1 }),
      buildPrompt({ id: 'prompt-22', title: 'Secondary prompt', position: 2 }),
    ];

    const createMutateMock = vi.fn(
      (
        variables: { title: string; content: string; position?: number },
        options?: { onSuccess?: (prompt: Prompt) => void },
      ) => {
        const duplicated = buildPrompt({
          id: 'prompt-33',
          title: variables.title,
          content: variables.content,
          position: variables.position ?? 0,
        });
        prompts.push(duplicated);
        options?.onSuccess?.(duplicated);
      },
    );
    const reorderMutateMock = vi.fn((updated: Prompt[]) => {
      prompts = updated.map((prompt) => ({ ...prompt }));
    });

    mockedUsePromptList.mockImplementation(() => createQueryResult([...prompts]));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(createMutateMock));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(reorderMutateMock));

    renderPage();

    const duplicateButtons = screen.getAllByRole('button', { name: /duplicate/i });
    await user.click(duplicateButtons[0]);

    expect(createMutateMock).toHaveBeenCalledWith(
      {
        title: 'Primary prompt (cópia)',
        content: prompts[0].content,
        position: 3,
      },
      expect.any(Object),
    );

    expect(await screen.findByText('Prompt duplicated successfully.')).toBeInTheDocument();

    const itemsAfterDuplicate = screen.getAllByRole('listitem');
    expect(itemsAfterDuplicate).toHaveLength(3);

    const duplicatedCard = screen.getByText('Primary prompt (cópia)').closest('[role="listitem"]');
    expect(duplicatedCard).not.toBeNull();

    const moveUpButton = within(duplicatedCard as HTMLElement).getByRole('button', {
      name: /move prompt up/i,
    });

    await user.click(moveUpButton);
    const updatedCard = screen.getByText('Primary prompt (cópia)').closest('[role="listitem"]');
    expect(updatedCard).not.toBeNull();
    const moveUpAgain = within(updatedCard as HTMLElement).getByRole('button', { name: /move prompt up/i });
    await user.click(moveUpAgain);

    expect(reorderMutateMock).toHaveBeenCalled();
    const lastCall = reorderMutateMock.mock.calls[reorderMutateMock.mock.calls.length - 1];
    const reorderPayload = lastCall?.[0] as unknown;
    expect(Array.isArray(reorderPayload)).toBe(true);
    if (Array.isArray(reorderPayload)) {
      expect(reorderPayload).toEqual([
        expect.objectContaining({ id: 'prompt-33', position: 1 }),
        expect.objectContaining({ id: 'prompt-11', position: 2 }),
        expect.objectContaining({ id: 'prompt-22', position: 3 }),
      ]);
    }
  });

  it('validates required title before submitting', async () => {
    const user = userEvent.setup();
    const mutateMock = vi.fn();

    mockedUsePromptList.mockReturnValue(createQueryResult([]));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(mutateMock));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    await user.click(screen.getByRole('button', { name: /new prompt/i }));
    await user.type(screen.getByLabelText('Content'), 'Explain the new onboarding flow.');
    await user.click(screen.getByRole('button', { name: /save prompt/i }));

    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('deletes a prompt after confirmation', async () => {
    const user = userEvent.setup();
    const mutateMock = vi.fn();
    const prompts = [buildPrompt({ id: 'prompt-5', title: 'Weekly digest', position: 1 })];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(mutateMock));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this prompt?');
    expect(mutateMock).toHaveBeenCalledWith('prompt-5', expect.any(Object));

    confirmSpy.mockRestore();
  });

  it('reorders prompts using move buttons', async () => {
    const user = userEvent.setup();
    const mutateMock = vi.fn();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'First prompt', position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Second prompt', position: 2 }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(mutateMock));

    renderPage();

    const moveDownButtons = screen.getAllByRole('button', { name: /move prompt down/i });
    expect(moveDownButtons[0]).not.toBeDisabled();

    await user.click(moveDownButtons[0]);

    expect(mutateMock).toHaveBeenCalled();
    const firstCall = mutateMock.mock.calls[0];
    expect(firstCall).toBeDefined();

    const variables = firstCall?.[0] as unknown;
    expect(Array.isArray(variables)).toBe(true);

    if (!Array.isArray(variables)) {
      return;
    }

    expect(variables).toEqual([
      expect.objectContaining({ id: 'prompt-2', position: 1 }),
      expect.objectContaining({ id: 'prompt-1', position: 2 }),
    ]);
  });

  it('toggles prompt enabled state via the switch', async () => {
    const user = userEvent.setup();
    const prompts: Prompt[] = [
      buildPrompt({ id: 'prompt-1', title: 'Primary prompt', enabled: true, position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Secondary prompt', enabled: true, position: 2 }),
    ];

    const mutateMock = vi.fn(
      (
        variables: { id: string; enabled?: boolean },
        options?: { onSuccess?: (prompt: Prompt) => void },
      ) => {
        prompts[0] = {
          ...prompts[0],
          enabled: variables.enabled ?? false,
          position: 5,
        };
        options?.onSuccess?.(prompts[0]);
      },
    );

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(mutateMock));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    const promptItems = screen.getAllByRole('listitem');
    const toggle = within(promptItems[0]).getByRole('switch', { name: /disable prompt/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    expect(mutateMock).toHaveBeenCalledWith({ id: 'prompt-1', enabled: false }, expect.any(Object));
    expect(await screen.findByText('Prompt disabled.')).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: /enable prompt/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('disables export when no prompt is selected and enables after selection', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'First prompt', content: 'First content', position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Second prompt', content: 'Second content', position: 2 }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    const exportButton = screen.getByRole('button', { name: /export selected/i });
    expect(exportButton).toBeDisabled();

    const [firstCheckbox] = screen.getAllByRole('checkbox', { name: /select prompt/i });
    await user.click(firstCheckbox);

    expect(exportButton).toBeEnabled();
  });

  it('shows export preview with prompts concatenated in the displayed order', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'Alpha prompt', content: 'Alpha content', position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Beta prompt', content: 'Beta content', position: 2 }),
      buildPrompt({ id: 'prompt-3', title: 'Gamma prompt', content: 'Gamma content', position: 3 }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    await user.click(screen.getAllByRole('checkbox', { name: /select prompt/i })[1]);
    await user.click(screen.getAllByRole('checkbox', { name: /select prompt/i })[0]);

    const updatedCheckboxes = screen.getAllByRole('checkbox', { name: /select prompt/i });
    expect(updatedCheckboxes[0]).toBeChecked();
    expect(updatedCheckboxes[1]).toBeChecked();

    await user.click(screen.getByRole('button', { name: /export selected/i }));

    const preview = await screen.findByLabelText(/preview/i);
    expect(preview).toHaveValue('Alpha prompt\n\nAlpha content\n\n---\n\nBeta prompt\n\nBeta content');
  });

  it('copies the export content to the clipboard', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'Alpha prompt', content: 'Alpha content', position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Beta prompt', content: 'Beta content', position: 2 }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    const navigatorWithClipboard = navigator as Navigator & { clipboard?: Clipboard };
    Object.defineProperty(navigatorWithClipboard, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderPage();

    await user.click(screen.getAllByRole('checkbox', { name: /select prompt/i })[0]);
    await user.click(screen.getAllByRole('checkbox', { name: /select prompt/i })[1]);

    await user.click(screen.getByRole('button', { name: /export selected/i }));
    await user.click(screen.getByRole('button', { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith(
      'Alpha prompt\n\nAlpha content\n\n---\n\nBeta prompt\n\nBeta content',
    );
    expect(await screen.findByText(/copied successfully/i)).toBeInTheDocument();

    if (originalClipboard) {
      Object.defineProperty(navigatorWithClipboard, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    } else {
      delete navigatorWithClipboard.clipboard;
    }
  });

  it('warns when disabled prompts are selected for export and omits them from the preview', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'Active prompt', content: 'Active content', enabled: true, position: 1 }),
      buildPrompt({
        id: 'prompt-2',
        title: 'Disabled prompt',
        content: 'Disabled content',
        enabled: false,
        position: 2,
      }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    await user.click(screen.getAllByRole('checkbox', { name: /select prompt/i })[0]);
    await user.click(screen.getAllByRole('checkbox', { name: /select prompt/i })[1]);

    expect(screen.getByText('Disabled prompts are not exported.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /export selected/i }));

    const preview = await screen.findByLabelText(/preview/i);
    expect(preview).toHaveValue('Active prompt\n\nActive content');
    expect(
      screen.getAllByText('Disabled prompts are not exported.').filter((element) => element.tagName === 'P')
    ).toHaveLength(2);
  });

  it('filters prompts by the search query', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'Welcome message', content: 'Draft a welcome post', position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Product update', content: 'Highlight the new product features', position: 2 }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    const searchInput = screen.getByLabelText(/search prompts/i);
    await user.type(searchInput, 'product');

    expect(screen.getByText('Product update')).toBeInTheDocument();
    expect(screen.queryByText('Welcome message')).not.toBeInTheDocument();
  });

  it('combines search and status filter when listing prompts', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'Recruiting post', content: 'Invite people to join', enabled: true, position: 1 }),
      buildPrompt({
        id: 'prompt-2',
        title: 'Event reminder',
        content: 'Remind followers about the event',
        enabled: false,
        position: 2,
      }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    const searchInput = screen.getByLabelText(/search prompts/i);
    await user.type(searchInput, 'event');

    const statusSelect = screen.getByLabelText(/status filter/i);
    await user.selectOptions(statusSelect, 'disabled');

    expect(screen.getByText('Event reminder')).toBeInTheDocument();
    expect(screen.queryByText('Recruiting post')).not.toBeInTheDocument();
  });

  it('shows only enabled prompts when the enabled filter is active', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'Daily post', enabled: true, position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Weekend recap', enabled: false, position: 2 }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    const statusSelect = screen.getByLabelText(/status filter/i);
    await user.selectOptions(statusSelect, 'enabled');

    expect(screen.getByText('Daily post')).toBeInTheDocument();
    expect(screen.queryByText('Weekend recap')).not.toBeInTheDocument();
  });

  it('shows only disabled prompts when the disabled filter is active', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'Daily post', enabled: true, position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Weekend recap', enabled: false, position: 2 }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    const statusSelect = screen.getByLabelText(/status filter/i);
    await user.selectOptions(statusSelect, 'disabled');

    expect(screen.getByText('Weekend recap')).toBeInTheDocument();
    expect(screen.queryByText('Daily post')).not.toBeInTheDocument();
  });

  it('shows an informative message when no prompts match the filters', async () => {
    const user = userEvent.setup();
    const prompts = [
      buildPrompt({ id: 'prompt-1', title: 'Daily post', enabled: true, position: 1 }),
      buildPrompt({ id: 'prompt-2', title: 'Weekend recap', enabled: false, position: 2 }),
    ];

    mockedUsePromptList.mockReturnValue(createQueryResult(prompts));
    mockedUseCreatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseUpdatePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseDeletePrompt.mockReturnValue(createMutationResult(vi.fn()));
    mockedUseReorderPrompts.mockReturnValue(createMutationResult(vi.fn()));

    renderPage();

    const searchInput = screen.getByLabelText(/search prompts/i);
    await user.type(searchInput, 'nonexistent');

    expect(screen.getByText('No prompts found for this search.')).toBeInTheDocument();
  });
});
