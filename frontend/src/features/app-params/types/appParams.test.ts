import { describe, expect, it } from 'vitest';

import { appParamsSchema, openAiModelOptions } from './appParams';

describe('appParamsSchema', () => {
  const base = {
    posts_refresh_cooldown_seconds: 3600,
    posts_time_window_days: 7,
    'openai.model': openAiModelOptions[0],
    updated_at: '2025-01-20T12:34:56.000Z',
    updated_by: 'admin@example.com',
  } as const;

  it('accepts all supported OpenAI models', () => {
    for (const model of openAiModelOptions) {
      expect(() =>
        appParamsSchema.parse({
          ...base,
          'openai.model': model,
        }),
      ).not.toThrow();
    }
  });

  it('rejects unsupported OpenAI models', () => {
    expect(() =>
      appParamsSchema.parse({
        ...base,
        'openai.model': 'gpt-5-ultra',
      }),
    ).toThrow();
  });
});
