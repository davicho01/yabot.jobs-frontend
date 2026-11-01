import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { surveyApi, type AdminSurveyResponse } from "../api/survey";
import { AdminPagination } from "../components/AdminPagination";
import "./AdminCommon.css";
import "./AdminSurveyPage.css";

const PAGE_SIZE = 20;

const QUESTIONS: { key: string; label: string }[] = [
  { key: "source", label: "How they found us" },
  { key: "search_duration", label: "How long job hunting" },
  { key: "industries", label: "Industries" },
  { key: "work_arrangement", label: "Work arrangement" },
  { key: "verification_dates_rating", label: "Job dates (posted, first found, verified)" },
  { key: "dedup_rating", label: "Duplicate removal" },
  { key: "liked", label: "Likes" },
  { key: "wanted", label: "Wants added" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function list(values: string[] | null): string {
  return values && values.length > 0 ? values.join(", ") : "—";
}

// Answers to the in-site survey (POST /survey): a count per answer for each
// question across everyone, then the individual responses, newest first.
export function AdminSurveyPage() {
  const [page, setPage] = useState(1);
  const [completedOnly, setCompletedOnly] = useState(false);

  const surveyQuery = useQuery({
    queryKey: ["admin", "survey", completedOnly, page],
    queryFn: () => surveyApi.adminList({ completedOnly, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const data = surveyQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <main className="admin-page">
      <Link to="/admin" className="admin-back-link">
        ← Admin dashboard
      </Link>
      <h1>Survey{data ? ` (${data.completed_count} finished of ${data.total})` : ""}</h1>

      {surveyQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {surveyQuery.isError && <p className="admin-page__hint">Couldn't load the survey.</p>}

      {data && (
        <>
          <section className="admin-section">
            {QUESTIONS.map(({ key, label }) => {
              const entries = Object.entries(data.counts[key] ?? {}).sort((a, b) => b[1] - a[1]);
              return (
                <p key={key} className="admin-survey__meta">
                  <strong>{label}:</strong>{" "}
                  {entries.length === 0 ? "no answers yet" : entries.map(([slug, n]) => `${slug} ${n}`).join(" · ")}
                </p>
              );
            })}
          </section>

          <div className="admin-toolbar">
            <label>
              <input
                type="checkbox"
                checked={completedOnly}
                onChange={(e) => {
                  setCompletedOnly(e.target.checked);
                  setPage(1);
                }}
              />{" "}
              Finished only
            </label>
          </div>

          {data.items.length === 0 && <p className="admin-page__hint">Nothing here.</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.items.map((item) => (
              <ResponseItem key={item.id} item={item} />
            ))}
          </ul>

          <AdminPagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            total={data.total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            onPageSizeChange={() => {}}
          />
        </>
      )}
    </main>
  );
}

function ResponseItem({ item }: { item: AdminSurveyResponse }) {
  const who = item.user_email ?? item.contact_email;
  return (
    <li className="admin-section">
      <p className="admin-survey__meta">
        <span className={item.completed ? "stamp stamp--positive" : "stamp stamp--neutral"}>
          {item.completed ? "finished" : "page 1 only"}
        </span>{" "}
        {formatDate(item.created_at)} ·{" "}
        {who ? <a href={`mailto:${who}`}>{who}</a> : "anonymous"}
        {item.user_email ? " (account)" : item.contact_email ? " (open to a chat)" : ""}
      </p>
      <p>
        <strong>Role:</strong> {item.role_name ?? "—"} · <strong>Industries:</strong> {list(item.industries)} ·{" "}
        <strong>Arrangement:</strong> {list(item.work_arrangement)}
      </p>
      <p>
        <strong>Found us:</strong> {item.source ?? "—"} · <strong>Searching:</strong> {item.search_duration ?? "—"}
      </p>
      <p>
        <strong>Job dates:</strong> {item.verification_dates_rating ?? "—"} · <strong>Dedup:</strong>{" "}
        {item.dedup_rating ?? "—"}
      </p>
      <p>
        <strong>Likes:</strong> {list(item.liked)} · <strong>Wants:</strong> {list(item.wanted)}
      </p>
      {item.comments && <p>{item.comments}</p>}
    </li>
  );
}
