import { getJson, patchJson, putJson } from '@/lib/api/http';
import { appParamsSchema, type AppParams, type AppParamsUpdateInput } from '../types/appParams';

const APP_PARAMS_ENDPOINT = '/api/v1/app-params';

export const fetchAppParams = () => {
  return getJson<AppParams>(APP_PARAMS_ENDPOINT, appParamsSchema);
};

export const updateAppParams = (payload: AppParamsUpdateInput, method: 'PUT' | 'PATCH' = 'PATCH') => {
  if (method === 'PUT') {
    return putJson<AppParams, AppParamsUpdateInput>(APP_PARAMS_ENDPOINT, payload, appParamsSchema);
  }

  return patchJson<AppParams, AppParamsUpdateInput>(APP_PARAMS_ENDPOINT, payload, appParamsSchema);
};
