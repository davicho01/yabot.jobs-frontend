import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiKeysApi } from "../api/apiKeys";
import { ApiError } from "../api/client";
import { LLM_PROVIDERS, getLlmProvider } from "../data/llmProviders";
import type { ApiKey } from "../api/types";
import "./ApiKeysPage.css";

function defaultModelFor(providerId: string): string {
  const provider = getLlmProvider(providerId);
  if (!provider || provider.models.length === 0) return "";
  return provider.defaultModel ?? provider.models[0].value;
}

function modelLabelFor(key: ApiKey): string {
  const provider = getLlmProvider(key.provider);
  if (!key.model) {
    return provider?.defaultModel ? `Default (${provider.defaultModel})` : "Default";
  }
  const match = provider?.models.find((m) => m.value === key.model);
  return match?.label ?? key.model;
}

export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const keysQuery = useQuery({ queryKey: ["api-keys"], queryFn: apiKeysApi.list });

  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isDefault, setIsDefault] = useState(true);

  const selectedProvider = getLlmProvider(provider);

  function handleProviderChange(nextProviderId: string) {
    setProvider(nextProviderId);
    setModel(defaultModelFor(nextProviderId));
  }

  const createKeyMutation = useMutation({
    mutationFn: () =>
      apiKeysApi.create({
        provider,
        api_key: apiKeyValue,
        model: model || undefined,
        base_url: provider === "other" ? baseUrl : undefined,
        is_default: isDefault,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setApiKeyValue("");
      setModel(defaultModelFor(provider));
      setBaseUrl("");
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  function handleCreateKey(event: FormEvent) {
    event.preventDefault();
    createKeyMutation.mutate();
  }

  return (
    <main className="settings-page">
      <h1>AI API Keys</h1>
      <p className="settings-page__intro">
        Bring your own LLM API key — used only for your resume review, scoring, and generation requests.
      </p>

      <section className="settings-section">
        <form onSubmit={handleCreateKey} className="settings-key-form">
          <label>
            Provider
            <div className="select-field">
              <select value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
                {LLM_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label>
            Model {!selectedProvider?.defaultModel && <span className="settings-key-form__required">required</span>}
            {selectedProvider && selectedProvider.models.length > 0 ? (
              <div className="select-field">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required={!selectedProvider.defaultModel}
                >
                  {selectedProvider.defaultModel && <option value="">Default ({selectedProvider.defaultModel})</option>}
                  {selectedProvider.models.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. llama-3.1-70b-instruct"
                required
              />
            )}
          </label>
          {provider === "other" && (
            <label>
              Base URL
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
            </label>
          )}
          <label>
            API key
            <input type="password" value={apiKeyValue} onChange={(e) => setApiKeyValue(e.target.value)} required />
          </label>
          <label className="settings-key-form__checkbox">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Use this key by default
          </label>
          <button type="submit" disabled={createKeyMutation.isPending}>
            {createKeyMutation.isPending ? "Saving…" : "Add key"}
          </button>
        </form>
        {createKeyMutation.error && (
          <p className="settings-page__error">
            {createKeyMutation.error instanceof ApiError ? createKeyMutation.error.message : "Couldn't save key."}
          </p>
        )}

        <ul className="record-list">
          {keysQuery.data?.map((key) => (
            <li key={key.id} className="record-list__item">
              <span>
                {key.provider} · {modelLabelFor(key)} · {key.masked_key}
              </span>
              {key.is_default && <span className="stamp stamp--positive">Default</span>}
              <button type="button" className="record-list__remove" onClick={() => deleteKeyMutation.mutate(key.id)}>
                Remove
              </button>
            </li>
          ))}
          {keysQuery.data?.length === 0 && <li className="settings-section__hint">No keys added yet.</li>}
        </ul>
      </section>
    </main>
  );
}
