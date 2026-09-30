import { api } from "./client";

// Both return a Stripe-hosted page to send the browser to.
export const billingApi = {
  checkout: () => api.post<{ url: string }>("/billing/checkout"),
  portal: () => api.post<{ url: string }>("/billing/portal"),
};
