import { useMemo } from 'react';
import { ENV } from '@/config/env';
export const useFeatureFlag = (flag) => {
    return useMemo(() => ENV.FEATURE_FLAGS.includes(flag), [flag]);
};
