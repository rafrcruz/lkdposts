import { useQuery } from '@tanstack/react-query';

import { getHelloMessage } from '../api/hello';
import type { HelloMessage } from '../types/hello';

export const HELLO_QUERY_KEY = ['hello'] as const;

export const useHelloMessage = () => {
  return useQuery<HelloMessage>({
    queryKey: HELLO_QUERY_KEY,
    queryFn: getHelloMessage,
  });
};
