import { api } from "./client";
import type { PersonalAccessToken, PersonalAccessTokenCreateResult } from "./types";

export interface PersonalAccessTokenCreatePayload {
  label: string;
  // undefined = never expires (until explicitly revoked).
  expires_in_days?: number;
}

export const authTokensApi = {
  list: () => api.get<PersonalAccessToken[]>("/auth/tokens"),
  create: (payload: PersonalAccessTokenCreatePayload) =>
    api.post<PersonalAccessTokenCreateResult>("/auth/tokens", payload),
  revoke: (id: string) => api.delete<void>(`/auth/tokens/${id}`),
};
