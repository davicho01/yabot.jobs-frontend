import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiKeysApi } from "../api/apiKeys";
import { AI_ACCESS_QUERY_KEY, ONBOARDING_QUERY_KEY, onboardingApi } from "../api/onboarding";
import { PlanSection } from "../components/PlanSection";
import { ActiveSourceNotice } from "../components/ActiveSourceNotice";
import { ApiError } from "../api/client";
import { LLM_PROVIDERS, getLlmProvider } from "../data/llmProviders";
import type { ApiKey } from "../api/types";
import "./ApiKeysPage.css";

function defaultModelFor(providerId: string): string {
  const provider = getLlmProvider(providerId);
  if (!provider || provider.models.length === 0) return "";
  return provider.defaultModel ?? provider.models[0].value;
}

function providerLabel(key: ApiKey): string {
  return getLlmProvider(key.provider)?.label ?? key.provider;
}

function modelLabelFor(key: ApiKey): string {
  const provider = getLlmProvider(key.provider);
  if (!key.model) {
    return provider?.defaultModel ? `Default (${provider.defaultModel})` : "Default";
  }
  const match = provider?.models.find((m) => m.value === key.model);
  return match?.label ?? key.model;
}

const PAUSED_KEY_TOOLTIP = "Not used while your plan is active. Takes over again if the plan ends.";

export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const keysQuery = useQuery({ queryKey: ["api-keys"], queryFn: apiKeysApi.list });
  const aiAccessQuery = useQuery({ queryKey: AI_ACCESS_QUERY_KEY, queryFn: onboardingApi.aiAccess });
  const aiAccess = aiAccessQuery.data;

  // A key changes whether the free trial applies and ticks off a
  // getting-started step, so those refresh along with the list.
  function invalidateKeys() {
    queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    queryClient.invalidateQueries({ queryKey: AI_ACCESS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
  }

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
      invalidateKeys();
      setApiKeyValue("");
      setModel(defaultModelFor(provider));
      setBaseUrl("");
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.remove(id),
    onSuccess: invalidateKeys,
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.update(id, { is_default: true }),
    onSuccess: invalidateKeys,
  });

  function handleCreateKey(event: FormEvent) {
    event.preventDefault();
    createKeyMutation.mutate();
  }

  const planOutranksKeys = !!aiAccess?.subscribed;
  // Alphabetical by provider, then model — the API returns them in no fixed
  // order, which made rows swap places when the default changed.
  const sortedKeys = [...(keysQuery.data ?? [])].sort(
    (a, b) => providerLabel(a).localeCompare(providerLabel(b)) || modelLabelFor(a).localeCompare(modelLabelFor(b)),
  );

  return (
    <main className="settings-page ai-access-page">
      <h1>AI access</h1>
      <p className="settings-page__intro">
        Scoring, tailoring, cover letters, and interview prep run on an AI model. Choose what powers them.
      </p>

      {aiAccess && <ActiveSourceNotice access={aiAccess} />}

      {aiAccess && <PlanSection access={aiAccess} />}

      <section className="settings-section ai-access-keys">
        <h2 className="ai-access-page__option-title">Use your own API key</h2>
        <p className="settings-section__hint">
          Free on our side: your provider bills you directly for what you use, usually a few cents per job. Keys are
          encrypted and only used for your own requests.
        </p>

        {sortedKeys.length > 0 && (
          <ul className="ai-access-keys__list">
            {sortedKeys.map((key) => (
              <li key={key.id} className="ai-access-keys__item">
                <span className="ai-access-keys__label">
                  <span className="ai-access-keys__provider">
                    {providerLabel(key)}
                  </span>
                  <span className="ai-access-keys__meta">
                    {modelLabelFor(key)} · {key.masked_key}
                  </span>
                </span>
                <span className="ai-access-keys__actions">
                  {key.is_default ? (
                    <span
                      className={`stamp ${planOutranksKeys ? "stamp--neutral" : "stamp--positive"}`}
                      title={planOutranksKeys ? PAUSED_KEY_TOOLTIP : undefined}
                    >
                      {planOutranksKeys ? "Default · paused" : "Default"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ai-access-keys__button"
                      onClick={() => setDefaultMutation.mutate(key.id)}
                      disabled={setDefaultMutation.isPending && setDefaultMutation.variables === key.id}
                    >
                      {setDefaultMutation.isPending && setDefaultMutation.variables === key.id
                        ? "Setting…"
                        : "Make default"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ai-access-keys__button ai-access-keys__button--remove"
                    onClick={() => deleteKeyMutation.mutate(key.id)}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="ai-access-keys__form-title">Add a key</h3>
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
            {selectedProvider?.keysUrl && (
              <span className="ai-access-keys__get-key">
                Don't have one?{" "}
                <a href={selectedProvider.keysUrl} target="_blank" rel="noopener noreferrer">
                  Create one at {selectedProvider.label} ↗
                </a>
              </span>
            )}
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
          <label className="ai-access-keys__checkbox">
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
        {deleteKeyMutation.error && <p className="settings-page__error">Couldn't remove that key.</p>}
      </section>
    </main>
  );
}
