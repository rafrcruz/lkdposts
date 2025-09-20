import { useQuery } from '@tanstack/react-query';

import { getHelloMessage } from '../api/hello';
import type { HelloMessage } from '../types/hello';
import { useAuth } from '@/features/auth/hooks/useAuth';

import { HELLO_QUERY_KEY } from './constants';

export const useHelloMessage = () => {
  const { status } = useAuth();
  const isAuthenticated = status === 'authenticated';

  return useQuery<HelloMessage>({
    queryKey: HELLO_QUERY_KEY,
    queryFn: getHelloMessage,
    enabled: isAuthenticated,
  });
};
