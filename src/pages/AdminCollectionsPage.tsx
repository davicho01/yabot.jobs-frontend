import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminPagination } from "../components/AdminPagination";
import type { AdminCollection, CollectionAction, CollectionView } from "../api/types";
import "./AdminCommon.css";
import "./AdminFeedbackPage.css";
import "./AdminCollectionsPage.css";

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_REASON = "Reviewed in admin";

// Which statuses each tab lists — the backend's collection_admin.VIEWS.
const VIEWS: { value: CollectionView; label: string; statuses: string[] }[] = [
  { value: "waiting", label: "Waiting", statuses: ["candidate", "qualified"] },
  { value: "live", label: "Live", statuses: ["published", "indexable", "performing", "declining"] },
  { value: "noindex", label: "Noindex", statuses: ["noindex"] },
  { value: "archived", label: "Archived", statuses: ["archived"] },
  { value: "all", label: "All", statuses: [] },
];

const TYPE_LABELS: Record<string, string> = {
  role: "Role",
  role_remote: "Role, remote",
  role_location: "Role in a city",
};

const ACTION_LABELS: Record<CollectionAction, string> = {
  approve: "Approve",
  noindex: "Noindex",
  archive: "Archive",
  restore: "Restore",
};

// The scorer's reasons (collection_qualification), in words.
const ISSUE_LABELS: Record<string, string> = {
  too_few_jobs: "Too few jobs",
  too_few_employers: "Too few employers",
  one_employer_dominates: "One employer has most jobs",
  near_duplicate: "Nearly the same as its parent page",
  stale: "No fresh jobs",
};

// Each part of the score, out of its weight (collection_qualification.WEIGHTS).
const SCORE_PARTS: { key: string; label: string; outOf: number }[] = [
  { key: "inventory_score", label: "Jobs", outOf: 25 },
  { key: "employer_diversity_score", label: "Employers", outOf: 15 },
  { key: "freshness_score", label: "Freshness", outOf: 20 },
  { key: "data_quality_score", label: "Data quality", outOf: 10 },
  { key: "stability_score", label: "Steady hiring", outOf: 10 },
  { key: "uniqueness_score", label: "Unique vs. parent", outOf: 5 },
];

function statusStampClass(status: string): string {
  if (["indexable", "performing"].includes(status)) return "stamp stamp--positive";
  if (["candidate", "qualified", "declining"].includes(status)) return "stamp stamp--warning";
  if (status === "archived") return "stamp stamp--negative";
  return "stamp stamp--neutral";
}

function scoreClass(score: number | null): string {
  if (score === null) return "admin-collections__score";
  if (score >= 80) return "admin-collections__score admin-collections__score--high";
  if (score >= 60) return "admin-collections__score admin-collections__score--mid";
  return "admin-collections__score admin-collections__score--low";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// An Eastern calendar date from the backend ("2026-10-25"), as "Oct 25".
function formatDay(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "role=data-engineer;location=remote" -> "data-engineer · remote".
function keyLabel(key: string): string {
  return key
    .split(";")
    .map((part) => part.split("=")[1] ?? part)
    .join(" · ");
}

// What the scorer and the nightly re-scoring say about it, in words.
function reasons(item: AdminCollection): string[] {
  const out = item.issues.map((issue) => ISSUE_LABELS[issue] ?? issue);
  if (item.below_bar_since) out.push(`Below the bar since ${formatDay(item.below_bar_since)}`);
  if (item.empty_since) out.push(`No open jobs since ${formatDay(item.empty_since)}`);
  if (item.duplicates.length) out.push(`Nearly the same jobs as ${item.duplicates.length} other page(s)`);
  return out;
}

// Review of the job collection pages (/jobs/us/<role>…): what's waiting with
// its score and why, approving, no-indexing or archiving one or a selection,
// and each page's history. Changes show on the site after the next generator
// run (every two hours on weekdays). Filters live in the URL.
export function AdminCollectionsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get("view") ?? "waiting") as CollectionView;
  const type = searchParams.get("type") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const updateParams = useCallback(
    (update: (next: URLSearchParams) => void) => {
      setSelected(new Set());
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        update(next);
        return next;
      });
    },
    [setSearchParams],
  );

  const listQuery = useQuery({
    queryKey: ["admin", "collections", view, type, q, page, pageSize],
    queryFn: () => adminApi.collections({ view, type: type || undefined, q: q || undefined, page, pageSize }),
    placeholderData: keepPreviousData,
  });

  const done = (text: string) => {
    setMessage(text);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["admin", "collections"] });
  };

  const actMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: CollectionAction }) =>
      adminApi.actOnCollection(id, action, reason.trim() || DEFAULT_REASON),
    onSuccess: (item, { action }) => done(`${ACTION_LABELS[action]}: ${item.name}. Live after the next run.`),
    onError: (error: Error) => setMessage(error.message),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action }: { action: CollectionAction }) =>
      adminApi.actOnCollections([...selected], action, reason.trim() || DEFAULT_REASON),
    onSuccess: (result, { action }) =>
      done(
        `${ACTION_LABELS[action]}: ${result.updated.length} page(s)` +
          (result.errors.length ? `; ${result.errors.length} skipped (${result.errors[0].detail})` : "") +
          ". Live after the next run.",
      ),
    onError: (error: Error) => setMessage(error.message),
  });

  // The tab is opened before the fetch so the popup blocker allows it.
  const preview = async (item: AdminCollection) => {
    const tab = window.open("", "_blank");
    try {
      const blob = await adminApi.collectionPreview(item.id);
      if (tab) tab.location.href = URL.createObjectURL(blob);
    } catch (error) {
      tab?.close();
      setMessage(`Preview of ${item.name}: ${(error as Error).message}`);
    }
  };

  const data = listQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const counts = data?.counts ?? {};
  const countFor = (statuses: string[]) =>
    (statuses.length ? statuses : Object.keys(counts)).reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const busy = actMutation.isPending || bulkMutation.isPending;
  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  // Actions every selected page can take.
  const selectedItems = items.filter((item) => selected.has(item.id));
  const bulkActions = (Object.keys(ACTION_LABELS) as CollectionAction[]).filter(
    (action) => selectedItems.length > 0 && selectedItems.every((item) => item.actions.includes(action)),
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="admin-page">
      <Link to="/admin" className="admin-back-link">
        ← Admin dashboard
      </Link>
      <h1>Job pages{countFor(VIEWS[0].statuses) > 0 ? ` (${countFor(VIEWS[0].statuses)} waiting)` : ""}</h1>
      <p className="admin-page__hint">
        Approving puts a page on the site, indexed by Google, on the next generator run (every two hours on
        weekdays). Noindex keeps it up but out of Google; archive takes it down. Every page is re-scored each
        weeknight: one below the bar for 3 days is taken out of Google, and one with no jobs for 2 weeks is
        archived, unless you approved it since. Nothing is ever approved for you.
      </p>

      <div className="admin-toolbar admin-feedback__toolbar">
        <div className="admin-feedback__tabs" role="group" aria-label="Status">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              className={view === option.value ? "is-active" : ""}
              onClick={() =>
                updateParams((next) => {
                  next.set("view", option.value);
                  next.delete("page");
                })
              }
            >
              {option.label} {data ? <span className="admin-collections__count">{countFor(option.statuses)}</span> : null}
            </button>
          ))}
        </div>
        <div className="admin-collections__filters">
          <input
            type="search"
            aria-label="Search pages"
            placeholder="Search, e.g. data engineer"
            className="admin-feedback__kind-select"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const value = e.currentTarget.value.trim();
              updateParams((next) => {
                if (value) next.set("q", value);
                else next.delete("q");
                next.delete("page");
              });
            }}
          />
          <select
            aria-label="Type"
            className="admin-feedback__kind-select"
            value={type}
            onChange={(e) =>
              updateParams((next) => {
                if (e.target.value) next.set("type", e.target.value);
                else next.delete("type");
                next.delete("page");
              })
            }
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-section admin-collections__bar">
        <label className="admin-collections__reason">
          <span>Reason (saved with each change)</span>
          <input
            type="text"
            maxLength={500}
            placeholder={DEFAULT_REASON}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="admin-collections__bulk">
          <span className="admin-table__sub">{selected.size ? `${selected.size} selected` : "Select pages to act on several at once"}</span>
          {bulkActions.map((action) => (
            <button key={action} type="button" disabled={busy} onClick={() => bulkMutation.mutate({ action })}>
              {ACTION_LABELS[action]} {selected.size}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p className="admin-collections__message" role="status">
          {message}
        </p>
      )}
      {listQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {listQuery.isError && <p className="admin-page__hint">Couldn't load the pages.</p>}
      {data && items.length === 0 && <p className="admin-page__hint">Nothing here.</p>}

      {items.length > 0 && (
        <>
          <div className="admin-section admin-table-wrap">
            <table className="admin-table admin-collections__table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))}
                    />
                  </th>
                  <th>Page</th>
                  <th>Score</th>
                  <th>Jobs</th>
                  <th>Employers</th>
                  <th>Freshness</th>
                  <th>Why</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <CollectionRow
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    open={openId === item.id}
                    busy={busy}
                    onToggle={() => toggle(item.id)}
                    onOpen={() => setOpenId(openId === item.id ? null : item.id)}
                    onAction={(action) => actMutation.mutate({ id: item.id, action })}
                    onPreview={() => preview(item)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            total={data?.total ?? 0}
            pageSize={pageSize}
            onPageChange={(target) => updateParams((next) => next.set("page", String(target)))}
            onPageSizeChange={(size) =>
              updateParams((next) => {
                next.set("pageSize", String(size));
                next.delete("page");
              })
            }
          />
        </>
      )}
    </main>
  );
}

function CollectionRow({
  item,
  selected,
  open,
  busy,
  onToggle,
  onOpen,
  onAction,
  onPreview,
}: {
  item: AdminCollection;
  selected: boolean;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAction: (action: CollectionAction) => void;
  onPreview: () => void;
}) {
  return (
    <>
      <tr className={selected ? "is-selected" : undefined}>
        <td>
          <input type="checkbox" aria-label={`Select ${item.name}`} checked={selected} onChange={onToggle} />
        </td>
        <td>
          {item.url ? (
            <a className="admin-table__link" href={item.url} target="_blank" rel="noreferrer">
              {item.name}
            </a>
          ) : (
            <strong>{item.name}</strong>
          )}
          <div className="admin-table__sub">
            {TYPE_LABELS[item.collection_type] ?? item.collection_type}
            {!item.url && item.path ? ` · ${item.path}` : ""}
          </div>
        </td>
        <td>
          <span className={scoreClass(item.qualification_score)}>{item.qualification_score ?? "–"}</span>
        </td>
        <td>{item.open_jobs?.toLocaleString() ?? "–"}</td>
        <td>{item.companies?.toLocaleString() ?? "–"}</td>
        <td>{item.freshness_score === null ? "–" : `${Math.round(item.freshness_score)} / 20`}</td>
        <td className="admin-collections__issues">{reasons(item).join(", ") || "–"}</td>
        <td>
          <span className={statusStampClass(item.status)}>{item.status}</span>
        </td>
        <td>
          <div className="admin-table__actions">
            {item.actions.map((action) => (
              <button key={action} type="button" disabled={busy} onClick={() => onAction(action)}>
                {ACTION_LABELS[action]}
              </button>
            ))}
            {item.path && (
              <button type="button" onClick={onPreview}>
                Preview
              </button>
            )}
            <button type="button" className="admin-collections__more" aria-expanded={open} onClick={onOpen}>
              {open ? "Hide" : "Details"}
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="admin-collections__detail-row">
          <td colSpan={9}>
            <CollectionDetail id={item.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function CollectionDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["admin", "collections", "detail", id], queryFn: () => adminApi.collection(id) });
  const reevaluate = useMutation({
    mutationFn: () => adminApi.reevaluateCollection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "collections"] }),
  });
  const detail = detailQuery.data;
  if (detailQuery.isLoading) return <p className="admin-page__hint">Loading…</p>;
  if (!detail) return <p className="admin-page__hint">Couldn't load the details.</p>;
  const parts = detail.qualification ?? {};
  return (
    <div className="admin-collections__detail">
      <section>
        <h3>Score</h3>
        {detail.qualification ? (
          <dl className="admin-collections__parts">
            {SCORE_PARTS.map((part) => {
              const value = parts[part.key] as number | null | undefined;
              return (
                <div key={part.key}>
                  <dt>{part.label}</dt>
                  <dd>{value === null || value === undefined ? "not counted" : `${value} / ${part.outOf}`}</dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="admin-page__hint">Not scored yet.</p>
        )}
        {detail.last_evaluated_at && <p className="admin-table__sub">Scored {formatDate(detail.last_evaluated_at)}</p>}
        {detail.can_reevaluate && (
          <button type="button" disabled={reevaluate.isPending} onClick={() => reevaluate.mutate()}>
            {reevaluate.isPending ? "Scoring…" : "Re-evaluate now"}
          </button>
        )}
        {reevaluate.isError && <p className="admin-table__sub">{reevaluate.error.message}</p>}
      </section>
      {detail.duplicates.length > 0 && (
        <section>
          <h3>Possible duplicates</h3>
          <p className="admin-table__sub">These list nearly the same jobs. Usually only one should be in Google.</p>
          <ul className="admin-collections__events">
            {detail.duplicates.map((key) => (
              <li key={key}>{keyLabel(key)}</li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3>History</h3>
        <ol className="admin-collections__events">
          {detail.events.map((event, i) => (
            <li key={i}>
              <span className={statusStampClass(event.new_status)}>{event.new_status}</span>{" "}
              <span>{event.reason}</span>
              <div className="admin-table__sub">
                {formatDate(event.created_at)} · {event.actor_email ?? event.trigger}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
