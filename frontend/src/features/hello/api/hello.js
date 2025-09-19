import { apiClient } from '@/lib/api/client';
import { z } from 'zod';
const helloSchema = z.object({
    message: z.string(),
});
export const getHelloMessage = async () => {
    return apiClient.get('/api/v1/hello', {
        schema: helloSchema,
        cache: {
            ttl: 60000,
        },
    });
};
