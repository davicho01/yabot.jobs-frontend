import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { describeSavedSearch, savedSearchesApi, savedSearchToParams } from "../api/savedSearches";
import { useConfirm } from "../components/ConfirmDialog";
import { BOARD_PATH } from "../routes";
import "./SavedSearchesPage.css";

function formatAlertDate(iso: string | null): string {
  if (!iso) return "No alerts sent yet";
  return `Last emailed ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function SavedSearchesPage() {
  const queryClient = useQueryClient();
  const searchesQuery = useQuery({ queryKey: ["savedSearches"], queryFn: savedSearchesApi.list });
  const { confirm, dialog } = useConfirm();

  const removeMutation = useMutation({
    mutationFn: (id: string) => savedSearchesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["savedSearches"] }),
  });

  async function handleRemove(id: string, label: string) {
    if (await confirm(`Remove "${label}"? You'll stop getting alerts for it.`)) {
      removeMutation.mutate(id);
    }
  }

  return (
    <main className="settings-page">
      {dialog}
      <h1>Saved searches</h1>
      <p className="settings-page__intro">
        Emailed whenever a new posting matches — <Link to={BOARD_PATH}>save one</Link> from the job board's filter
        panel.
      </p>

      <section className="settings-section">
        <ul className="record-list">
          {searchesQuery.data?.map((search) => {
            const description = describeSavedSearch(search);
            const label = search.name || description;
            return (
              <li key={search.id} className="record-list__item saved-search-row">
                <span className="saved-search-row__text">
                  <span className="saved-search-row__name">{label}</span>
                  {search.name && <span className="saved-search-row__description">{description}</span>}
                  <span className="saved-search-row__alert">{formatAlertDate(search.last_alerted_at)}</span>
                </span>
                <Link to={`${BOARD_PATH}?${savedSearchToParams(search).toString()}`} className="record-list__make-default">
                  Open
                </Link>
                <button type="button" className="record-list__remove" onClick={() => handleRemove(search.id, label)}>
                  Remove
                </button>
              </li>
            );
          })}
          {searchesQuery.data?.length === 0 && (
            <li className="settings-section__hint">
              Nothing saved yet — search for something on the <Link to={BOARD_PATH}>job board</Link>, then use the
              save icon next to the filters to keep it and get emailed about new matches.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
