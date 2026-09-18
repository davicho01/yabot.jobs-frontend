import { api } from "./client";

export interface OAuthAuthorizationRequest {
  request_id: string;
  client_name: string;
  scopes: string | null;
}

export interface OAuthAuthorizationDecision {
  redirect_url: string;
}

export const oauthApi = {
  getAuthorizationRequest: (requestId: string) =>
    api.get<OAuthAuthorizationRequest>(`/oauth/authorizations/${requestId}`),
  approve: (requestId: string) => api.post<OAuthAuthorizationDecision>(`/oauth/authorizations/${requestId}/approve`),
  deny: (requestId: string) => api.post<OAuthAuthorizationDecision>(`/oauth/authorizations/${requestId}/deny`),
};
