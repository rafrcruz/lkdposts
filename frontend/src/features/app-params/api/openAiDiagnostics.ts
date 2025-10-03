import { getJson } from '@/lib/api/http';
import { openAiDiagResultSchema, type OpenAiDiagResult } from '../types/openAiDiagnostics';

const DIAG_ENDPOINT = '/api/v1/admin/openai/diag';

export const runOpenAiDiagnostics = (model?: string) => {
  const query = typeof model === 'string' && model.trim() !== '' ? `?model=${encodeURIComponent(model.trim())}` : '';
  return getJson<OpenAiDiagResult>(`${DIAG_ENDPOINT}${query}`, openAiDiagResultSchema);
};
