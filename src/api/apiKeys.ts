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

export const apiKeysApi = {
  list: () => api.get<ApiKey[]>("/api-keys"),
  create: (payload: ApiKeyCreatePayload) => api.post<ApiKey>("/api-keys", payload),
  remove: (id: string) => api.delete<void>(`/api-keys/${id}`),
};
