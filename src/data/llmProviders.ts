/**
 * Single source of truth for the LLM providers and models offered on the
 * "AI API Keys" page (see ../pages/ApiKeysPage.tsx). Update this file when a
 * provider ships a new model or retires an old one — nothing else needs to
 * change, the page renders whatever's listed here.
 *
 * `id` must exactly match a value of the backend's LlmProvider enum
 * (app/models/enums.py) — that's what gets sent as UserApiKey.provider.
 * `models[].value` is sent as-is to that provider's API as the model name/id,
 * so it must match the provider's own current model identifier exactly.
 *
 * "other" is intentionally left with an empty models list: it's a
 * user-supplied OpenAI-compatible endpoint (see base_url), so there's no
 * fixed catalog to offer — the page falls back to a free-text input for it.
 */

export interface LlmModelOption {
  value: string;
  label: string;
}

export interface LlmProviderOption {
  id: string;
  label: string;
  models: LlmModelOption[];
  /** Model used when the field is left blank, if this provider supports
   *  that (currently only Anthropic, per the backend's UserApiKey.model
   *  default-fallback behavior — see app/schemas/api_key.py). */
  defaultModel?: string;
}

export const LLM_PROVIDERS: LlmProviderOption[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-sonnet-5",
    models: [
      { value: "claude-opus-5", label: "Claude Opus 5" },
      { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
      { value: "claude-fable-5", label: "Claude Fable 5" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    models: [
      { value: "gpt-5.1", label: "GPT-5.1" },
      { value: "gpt-5.1-mini", label: "GPT-5.1 mini" },
      { value: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
      { value: "o4-mini", label: "o4-mini" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    models: [
      { value: "deepseek-flash", label: "DeepSeek v4.1 Flash" },
      { value: "deepseek-v4-pro", label: "DeepSeek v4 Pro" },
    ],
  },
  {
    id: "google",
    label: "Google",
    models: [
      { value: "gemini-3-pro", label: "Gemini 3 Pro" },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    models: [
      { value: "mistral-large-latest", label: "Mistral Large" },
      { value: "mistral-small-latest", label: "Mistral Small" },
      { value: "codestral-latest", label: "Codestral" },
    ],
  },
  {
    id: "other",
    label: "Other (custom endpoint)",
    models: [],
  },
];

export function getLlmProvider(id: string): LlmProviderOption | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id);
}
