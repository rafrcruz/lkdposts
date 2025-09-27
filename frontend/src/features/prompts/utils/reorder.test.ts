import { describe, expect, it } from 'vitest';

import { derivePromptMove, normalizePromptOrder } from './reorder';
import type { Prompt } from '../types/prompt';

const buildPrompt = (id: string, position: number): Prompt => ({
  id,
  title: `Prompt ${id}`,
  content: 'example',
  position,
  enabled: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

describe('normalizePromptOrder', () => {
  it('recomputes positions sequentially', () => {
    const prompts = [buildPrompt('a', 3), buildPrompt('b', 7), buildPrompt('c', 2)];

    const normalized = normalizePromptOrder(prompts);

    expect(normalized.map((prompt) => prompt.position)).toEqual([1, 2, 3]);
    expect(normalized[0]).not.toBe(prompts[0]);
  });
});

describe('derivePromptMove', () => {
  it('uses the hint id when available', () => {
    const previous = ['a', 'b', 'c'];
    const next = ['b', 'a', 'c'];

    expect(derivePromptMove(previous, next, 'a')).toEqual({ promptId: 'a', fromIndex: 0, toIndex: 1 });
  });

  it('falls back to the id with the largest position change', () => {
    const previous = ['a', 'b', 'c', 'd'];
    const next = ['b', 'c', 'a', 'd'];

    expect(derivePromptMove(previous, next)).toEqual({ promptId: 'a', fromIndex: 0, toIndex: 2 });
  });

  it('returns null when arrays are identical', () => {
    const ids = ['a', 'b', 'c'];

    expect(derivePromptMove(ids, ids)).toBeNull();
  });

  it('returns null when indexes cannot be resolved', () => {
    const previous = ['a', 'b'];
    const next = ['a'];

    expect(derivePromptMove(previous, next)).toBeNull();
  });
});
