import type { Prompt } from '../types/prompt';

type PromptId = string;

export const normalizePromptOrder = (prompts: Prompt[]): Prompt[] => {
  return prompts.map((item, index) => ({ ...item, position: index + 1 }));
};

const findMovedPromptId = (
  previousIds: readonly PromptId[],
  nextIds: readonly PromptId[],
): PromptId | null => {
  if (previousIds.length !== nextIds.length) {
    return null;
  }

  let resolvedId: PromptId | null = null;
  let largestDelta = -1;

  for (const id of previousIds) {
    const previousIndex = previousIds.indexOf(id);
    const nextIndex = nextIds.indexOf(id);

    if (previousIndex === -1 || nextIndex === -1) {
      continue;
    }

    if (previousIndex === nextIndex) {
      continue;
    }

    const delta = Math.abs(nextIndex - previousIndex);
    if (delta > largestDelta) {
      resolvedId = id;
      largestDelta = delta;
    }
  }

  return resolvedId;
};

export const derivePromptMove = (
  previousIds: readonly PromptId[],
  nextIds: readonly PromptId[],
  hintId?: PromptId | null,
): { promptId: PromptId; fromIndex: number; toIndex: number } | null => {
  if (previousIds.length !== nextIds.length || previousIds.length === 0) {
    return null;
  }

  const normalizedHintId = hintId ?? null;
  const candidateId =
    normalizedHintId && nextIds.includes(normalizedHintId)
      ? normalizedHintId
      : findMovedPromptId(previousIds, nextIds);

  if (!candidateId) {
    return null;
  }

  const fromIndex = previousIds.indexOf(candidateId);
  const toIndex = nextIds.indexOf(candidateId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return null;
  }

  return { promptId: candidateId, fromIndex, toIndex };
};
