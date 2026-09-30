import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { AdminPagination } from "../components/AdminPagination";
import type { AdminFeedback, FeedbackKind, FeedbackStatus } from "../api/types";
import "./AdminCommon.css";
import "./AdminFeedbackPage.css";

const DEFAULT_PAGE_SIZE = 20;

const STATUS_FILTERS: { value: FeedbackStatus | "all"; label: string }[] = [
  { value: "new", label: "New" },
  { value: "read", label: "Read" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "Bug",
  question: "Question",
  idea: "Idea",
  other: "Other",
};

function statusStampClass(status: FeedbackStatus): string {
  if (status === "new") return "stamp stamp--warning";
  if (status === "resolved") return "stamp stamp--positive";
  return "stamp stamp--neutral";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Triage queue for POST /feedback submissions (the in-app "Send feedback"
// form and the Help page's contact form). Filters live in the URL, same as
// the other admin pages, so a refresh keeps the view.
export function AdminFeedbackPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = (searchParams.get("status") ?? "new") as FeedbackStatus | "all";
  const kindParam = (searchParams.get("kind") ?? "") as FeedbackKind | "";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;

  const updateParams = useCallback(
    (update: (next: URLSearchParams) => void) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        update(next);
        return next;
      });
    },
    [setSearchParams],
  );

  const feedbackQuery = useQuery({
    queryKey: ["admin", "feedback", statusParam, kindParam, page, pageSize],
    queryFn: () =>
      adminApi.feedback({
        status: statusParam === "all" ? undefined : statusParam,
        kind: kindParam || undefined,
        page,
        pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) => adminApi.updateFeedbackStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "feedback"] }),
  });

  const data = feedbackQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <main className="admin-page">
      <Link to="/admin" className="admin-back-link">
        ← Admin dashboard
      </Link>
      <h1>Feedback{data && data.new_count > 0 ? ` (${data.new_count} new)` : ""}</h1>

      <div className="admin-toolbar admin-feedback__toolbar">
        <div className="admin-feedback__tabs" role="group" aria-label="Status">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={statusParam === filter.value}
              className={statusParam === filter.value ? "is-active" : ""}
              onClick={() =>
                updateParams((next) => {
                  next.set("status", filter.value);
                  next.delete("page");
                })
              }
            >
              {filter.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Type"
          className="admin-feedback__kind-select"
          value={kindParam}
          onChange={(e) =>
            updateParams((next) => {
              if (e.target.value) next.set("kind", e.target.value);
              else next.delete("kind");
              next.delete("page");
            })
          }
        >
          <option value="">All types</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {feedbackQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {feedbackQuery.isError && <p className="admin-page__hint">Couldn't load feedback.</p>}
      {data && data.items.length === 0 && <p className="admin-page__hint">Nothing here.</p>}

      {data && data.items.length > 0 && (
        <>
          <ul className="admin-feedback__list">
            {data.items.map((item) => (
              <FeedbackItem
                key={item.id}
                item={item}
                busy={statusMutation.isPending && statusMutation.variables?.id === item.id}
                onStatusChange={(status) => statusMutation.mutate({ id: item.id, status })}
              />
            ))}
          </ul>
          <AdminPagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            total={data.total}
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

function FeedbackItem({
  item,
  busy,
  onStatusChange,
}: {
  item: AdminFeedback;
  busy: boolean;
  onStatusChange: (status: FeedbackStatus) => void;
}) {
  return (
    <li className="admin-section admin-feedback__item">
      <div className="admin-feedback__meta">
        <span className={statusStampClass(item.status)}>{item.status}</span>
        <span className="stamp stamp--neutral">{KIND_LABELS[item.kind]}</span>
        {item.rating !== null && <span className="admin-feedback__rating">Rated {item.rating}/5</span>}
        <span className="admin-feedback__when">{formatDate(item.created_at)}</span>
      </div>
      <p className="admin-feedback__message">{item.message}</p>
      <div className="admin-feedback__footer">
        <span className="admin-table__sub">
          <a href={`mailto:${item.user_email}`}>{item.user_email}</a>
          {item.page_url && <> · on {item.page_url}</>}
        </span>
        <div className="admin-feedback__actions">
          {item.status !== "read" && (
            <button type="button" disabled={busy} onClick={() => onStatusChange("read")}>
              Mark read
            </button>
          )}
          {item.status !== "resolved" && (
            <button type="button" disabled={busy} onClick={() => onStatusChange("resolved")}>
              Resolve
            </button>
          )}
          {item.status !== "new" && (
            <button type="button" disabled={busy} onClick={() => onStatusChange("new")}>
              Reopen
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
