import { z } from 'zod';

import { getJson } from '@/lib/api/http';

const helloSchema = z.object({
  message: z.string(),
});

export const getHelloMessage = async () => {
  return getJson('/api/v1/hello', helloSchema);
};
