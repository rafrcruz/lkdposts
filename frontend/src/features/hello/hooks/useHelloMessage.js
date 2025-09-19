import { useQuery } from '@tanstack/react-query';
import { getHelloMessage } from '../api/hello';
export const HELLO_QUERY_KEY = ['hello'];
export const useHelloMessage = () => {
    return useQuery({
        queryKey: HELLO_QUERY_KEY,
        queryFn: getHelloMessage,
        structuralSharing: true,
        meta: {
            description: 'Fetch hello mundo message',
        },
    });
};
