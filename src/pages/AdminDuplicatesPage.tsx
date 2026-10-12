import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import type { DuplicateGroup, DuplicateKind } from "../api/admin";
import { AdminPagination } from "../components/AdminPagination";
import "./AdminCommon.css";
// For the pill tabs (.admin-feedback__tabs) and card list styles.
import "./AdminFeedbackPage.css";

const DEFAULT_PAGE_SIZE = 20;

const KIND_TABS: { value: DuplicateKind; label: string; hint: string }[] = [
  {
    value: "linked",
    label: "Linked",
    hint: "Groups dedup already made. Search lists only the primary; the others stay reachable at their own URL.",
  },
  {
    value: "possible",
    label: "Possible",
    hint: "Open, unlinked postings with the same company and title. Check the locations — many are separate openings at different sites.",
  },
];

function formatDate(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Read-only view of cross-source duplicates (see the backend's
// app.services.job_dedup): the same job found at more than one URL.
export function AdminDuplicatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const kind = (searchParams.get("kind") ?? "linked") as DuplicateKind;
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

  const duplicatesQuery = useQuery({
    queryKey: ["admin", "duplicates", kind, page, pageSize],
    queryFn: () => adminApi.duplicates({ kind, page, pageSize }),
    placeholderData: keepPreviousData,
  });

  const data = duplicatesQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <main className="admin-page">
      <Link to="/admin" className="admin-back-link">
        ← Admin dashboard
      </Link>
      <h1>Duplicates{data ? ` (${data.total.toLocaleString()} groups)` : ""}</h1>

      <div className="admin-toolbar admin-feedback__toolbar">
        <div className="admin-feedback__tabs" role="group" aria-label="Kind">
          {KIND_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={kind === tab.value}
              className={kind === tab.value ? "is-active" : ""}
              onClick={() =>
                updateParams((next) => {
                  next.set("kind", tab.value);
                  next.delete("page");
                })
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <p className="admin-page__hint">{KIND_TABS.find((tab) => tab.value === kind)?.hint}</p>

      {duplicatesQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {duplicatesQuery.isError && <p className="admin-page__hint">Couldn't load duplicates.</p>}
      {data && data.items.length === 0 && <p className="admin-page__hint">Nothing here.</p>}

      {data && data.items.length > 0 && (
        <>
          <ul className="admin-feedback__list">
            {data.items.map((group) => (
              <DuplicateGroupItem key={group.members[0]?.posting_id} group={group} />
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

function DuplicateGroupItem({ group }: { group: DuplicateGroup }) {
  return (
    <li className="admin-section admin-feedback__item">
      <div className="admin-section__header">
        <h2 className="admin-section__title">
          {group.company_name ?? "Unknown company"} — {group.title ?? "Untitled"}
        </h2>
        <span className="admin-table__sub">{group.members.length} postings</span>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Title</th>
              <th>Location</th>
              <th>Last scanned</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {group.members.map((member) => (
              <tr key={member.posting_id}>
                <td>
                  <a className="admin-table__link" href={member.url} target="_blank" rel="noreferrer">
                    {member.domain}
                  </a>
                </td>
                <td>
                  <Link className="admin-table__link" to={`/jobs/${member.url_id}`}>
                    {member.title ?? "Untitled"}
                  </Link>
                </td>
                <td>{member.location ?? "—"}</td>
                <td className="admin-table__nowrap">{formatDate(member.last_scanned_at)}</td>
                <td>
                  {member.is_primary && group.members.some((m) => !m.is_primary) && (
                    <span className="stamp stamp--positive">primary</span>
                  )}{" "}
                  {member.closed && <span className="stamp stamp--neutral">closed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </li>
  );
}
