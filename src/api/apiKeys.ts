import { api } from "./client";
import type { ApiKey } from "./types";

export interface ApiKeyCreatePayload {
  provider: string;
  label?: string;
  api_key: string;
  model?: string;
  base_url?: string;
  is_default?: boolean;
}

export interface ApiKeyUpdatePayload {
  is_default?: boolean;
}

export const apiKeysApi = {
  list: () => api.get<ApiKey[]>("/api-keys"),
  create: (payload: ApiKeyCreatePayload) => api.post<ApiKey>("/api-keys", payload),
  update: (id: string, payload: ApiKeyUpdatePayload) => api.patch<ApiKey>(`/api-keys/${id}`, payload),
  remove: (id: string) => api.delete<void>(`/api-keys/${id}`),
};
