import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminCompany } from "../api/admin";
import { ApiError } from "../api/client";
import type { CrawlSource } from "../api/types";
import { AdminWindowStats } from "../components/AdminWindowStats";
import CompanyLogo from "../components/CompanyLogo";
import { ScanActivityChart } from "../components/ScanActivityChart";
import { useConfirm } from "../components/ConfirmDialog";
import "./AdminCommon.css";

const CRAWL_SOURCE_STATUSES = ["pending", "active", "rejected", "delete"];

const LOGO_ORIGIN_LABELS: Record<string, string> = {
  logo_dev: "Automatic (logo.dev)",
  url: "Copied from a URL",
  upload: "Uploaded",
};

type LogoInput = { url: string; file: File | null };

// One company's logo row in the Edit source dialog: the current logo, plus a
// URL field or an upload — applied when the dialog is saved.
function CompanyLogoField({
  company,
  input,
  error,
  onChange,
  onUseAutomatic,
  resetting,
}: {
  company: AdminCompany;
  input: LogoInput;
  error: string | undefined;
  onChange: (input: LogoInput) => void;
  onUseAutomatic: () => void;
  resetting: boolean;
}) {
  const pinned = company.logo_origin === "url" || company.logo_origin === "upload";
  const origin = company.logo_origin ? LOGO_ORIGIN_LABELS[company.logo_origin] : "No logo yet";
  return (
    <div className="edit-logo-field">
      <div className="edit-logo-field__current">
        <CompanyLogo name={company.display_name} logoUrl={company.logo_url} size={48} />
        <div>
          <div className="edit-logo-field__name">{company.display_name}</div>
          <div className="edit-logo-field__origin">
            {origin}
            {pinned && (
              <>
                {" · "}
                <button type="button" className="edit-logo-field__link" onClick={onUseAutomatic} disabled={resetting}>
                  Use automatic logo
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="edit-logo-field__inputs">
        <input
          type="url"
          inputMode="url"
          placeholder="Paste a logo or website URL"
          value={input.url}
          disabled={input.file !== null}
          onChange={(e) => onChange({ url: e.target.value, file: null })}
        />
        <span className="edit-logo-field__or">or</span>
        <label className="rescan-button edit-logo-field__upload">
          {input.file ? input.file.name : "Upload image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon"
            hidden
            onChange={(e) => onChange({ url: "", file: e.target.files?.[0] ?? null })}
          />
        </label>
        {input.file && (
          <button type="button" className="edit-logo-field__link" onClick={() => onChange({ url: "", file: null })}>
            Clear
          </button>
        )}
      </div>
      {error && <p className="admin-source-header__error">{error}</p>}
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function EditCrawlSourceDialog({ source, onClose }: { source: CrawlSource; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(source.name);
  const [boardUrl, setBoardUrl] = useState(source.board_url);
  const [sourceStatus, setSourceStatus] = useState(source.status);
  const [logoInputs, setLogoInputs] = useState<Record<string, LogoInput>>({});
  const [logoErrors, setLogoErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const companiesQuery = useQuery({
    queryKey: ["admin", "crawl-source-companies", source.id],
    queryFn: () => adminApi.crawlSourceCompanies(source.id),
  });

  function refreshLogos() {
    queryClient.invalidateQueries({ queryKey: ["admin", "crawl-source-companies", source.id] });
    // Every list/page showing these companies' jobs picks up the new logo.
    queryClient.invalidateQueries({ queryKey: ["admin", "jobs"] });
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    queryClient.invalidateQueries({ queryKey: ["job"] });
    queryClient.invalidateQueries({ queryKey: ["applications"] });
  }

  const resetMutation = useMutation({
    mutationFn: (companyKey: string) => adminApi.clearCompanyLogo(companyKey),
    onSuccess: refreshLogos,
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setLogoErrors({});
    try {
      try {
        await adminApi.updateCrawlSource(source.id, { name, board_url: boardUrl, status: sourceStatus });
        queryClient.invalidateQueries({ queryKey: ["admin", "crawl-source-stats", source.id] });
        queryClient.invalidateQueries({ queryKey: ["admin", "crawl-sources"] });
      } catch (error) {
        setSaveError(errorMessage(error, "Couldn't save changes."));
        return;
      }

      // Logos are applied after the source itself, each on its own, so a
      // bad logo URL never loses the other edits — it just keeps the dialog
      // open with the reason.
      const errors: Record<string, string> = {};
      for (const company of companiesQuery.data ?? []) {
        const input = logoInputs[company.company_key];
        if (!input || (!input.file && !input.url.trim())) continue;
        try {
          if (input.file) {
            await adminApi.uploadCompanyLogo(company.company_key, company.display_name, input.file);
          } else {
            await adminApi.setCompanyLogoUrl(company.company_key, company.display_name, input.url.trim());
          }
          setLogoInputs((prev) => ({ ...prev, [company.company_key]: { url: "", file: null } }));
        } catch (error) {
          errors[company.company_key] = errorMessage(error, "Couldn't use that logo.");
        }
      }
      refreshLogos();
      if (Object.keys(errors).length) {
        setLogoErrors(errors);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="confirm-dialog__overlay" onClick={onClose}>
      <div
        className="confirm-dialog edit-crawl-source-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-dialog__title">Edit crawl source</h2>
        <form onSubmit={handleSubmit} className="edit-crawl-source-dialog__form">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Board URL
            <input value={boardUrl} onChange={(e) => setBoardUrl(e.target.value)} required />
          </label>
          <label>
            Status
            <div className="select-field">
              <select value={sourceStatus} onChange={(e) => setSourceStatus(e.target.value)}>
                {CRAWL_SOURCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <fieldset className="edit-logo-fieldset">
            <legend>Logo</legend>
            {companiesQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
            {companiesQuery.isError && <p className="admin-source-header__error">Couldn't load this source's companies.</p>}
            {companiesQuery.data?.map((company) => (
              <CompanyLogoField
                key={company.company_key}
                company={company}
                input={logoInputs[company.company_key] ?? { url: "", file: null }}
                error={logoErrors[company.company_key]}
                onChange={(input) => setLogoInputs((prev) => ({ ...prev, [company.company_key]: input }))}
                onUseAutomatic={() => resetMutation.mutate(company.company_key)}
                resetting={resetMutation.isPending}
              />
            ))}
          </fieldset>
          {saveError && <p className="admin-source-header__error">{saveError}</p>}
          <div className="confirm-dialog__actions">
            <button type="button" className="confirm-dialog__button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="confirm-dialog__button confirm-dialog__button--primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function statusStampClass(status: string): string {
  if (status === "active") return "stamp stamp--positive";
  if (status === "rejected") return "stamp stamp--negative";
  return "stamp stamp--neutral";
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminCrawlSourceStatsPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const navigate = useNavigate();
  const statsQuery = useQuery({
    queryKey: ["admin", "crawl-source-stats", sourceId],
    queryFn: () => adminApi.crawlSourceStats(sourceId!),
    enabled: !!sourceId,
  });
  const stats = statsQuery.data;
  const { confirm, dialog } = useConfirm();
  const [isEditing, setIsEditing] = useState(false);

  const deleteSourceMutation = useMutation({
    mutationFn: () => adminApi.deleteCrawlSource(sourceId!),
    onSuccess: () => navigate("/admin"),
  });

  const runCrawlMutation = useMutation({
    mutationFn: () => adminApi.runCrawlSource(sourceId!),
  });

  const rescanMutation = useMutation({
    mutationFn: () => adminApi.rescanCrawlSource(sourceId!),
  });

  async function deleteSource() {
    if (await confirm("Permanently delete this crawl source? This can't be undone.")) {
      deleteSourceMutation.mutate();
    }
  }

  return (
    <main className="admin-page">
      {dialog}
      {isEditing && stats && (
        <EditCrawlSourceDialog source={stats.source} onClose={() => setIsEditing(false)} />
      )}
      <Link to="/admin" className="admin-back-link">
        ‹ Back to dashboard
      </Link>

      {statsQuery.isLoading && <p className="admin-page__hint">Loading…</p>}
      {statsQuery.isError && <p className="admin-page__hint">Couldn't load this source.</p>}

      {stats && (
        <>
          <div className="admin-source-header">
            <div className="admin-source-header__row">
              <h1>{stats.source.name}</h1>
              <div className="admin-source-header__total">
                <span className="admin-totals__value">{stats.total_listings.toLocaleString()}</span>
                <span className="admin-totals__label">Total listings</span>
              </div>
            </div>
            {stats.source.last_error && (
              <p className="admin-source-header__error">Last crawl error: {stats.source.last_error}</p>
            )}
            {stats.source.coverage_flagged_at && (
              <p className="admin-source-header__warning">
                Coverage dropped: last crawl found {stats.source.coverage_last_count ?? "?"} URL(s), well below the
                usual ~{Math.round(stats.source.coverage_baseline ?? 0)}, flagged since{" "}
                {formatDate(stats.source.coverage_flagged_at)}.
              </p>
            )}
          </div>

          <section className="admin-section">
            <div className="admin-section__header">
              <h2 className="admin-section__title">Source details</h2>
              <div className="admin-section__header-row">
                <span className={statusStampClass(stats.source.status)}>{stats.source.status}</span>
              </div>
            </div>
            <dl className="admin-detail-grid">
              <div className="admin-detail-grid__item">
                <dt>URL</dt>
                <dd>
                  <a href={stats.source.board_url} target="_blank" rel="noopener noreferrer" title={stats.source.board_url}>
                    {stats.source.board_url}
                  </a>
                </dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>ATS type</dt>
                <dd>{stats.source.ats_type ?? "Unrecognized platform"}</dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>Last crawled</dt>
                <dd>{formatDate(stats.source.last_crawled_at)}</dd>
              </div>
              <div className="admin-detail-grid__item">
                <dt>Created</dt>
                <dd>{formatDate(stats.source.created_at)}</dd>
              </div>
            </dl>
            <div className="admin-section__footer">
              <button type="button" className="rescan-button" onClick={() => setIsEditing(true)}>
                Edit
              </button>
              <div className="admin-section__footer-actions">
                {rescanMutation.isSuccess && <p className="admin-page__hint">Rescan queued.</p>}
                {rescanMutation.isError && <p className="admin-source-header__error">Couldn't queue a rescan.</p>}
                {runCrawlMutation.isSuccess && <p className="admin-page__hint">Crawl queued.</p>}
                {runCrawlMutation.isError && <p className="admin-source-header__error">Couldn't queue a crawl.</p>}
                <Link
                  to={`/admin/jobs?sourceId=${sourceId}`}
                  className="rescan-button"
                >
                  View jobs
                </Link>
                <button
                  type="button"
                  className="rescan-button"
                  disabled={rescanMutation.isPending}
                  onClick={() => rescanMutation.mutate()}
                >
                  {rescanMutation.isPending ? "Queuing…" : "Rescan postings"}
                </button>
                <button
                  type="button"
                  className="rescan-button"
                  disabled={stats.source.status !== "active" || runCrawlMutation.isPending}
                  onClick={() => runCrawlMutation.mutate()}
                >
                  {runCrawlMutation.isPending ? "Queuing…" : "Run crawl"}
                </button>
              </div>
            </div>
          </section>

          <ScanActivityChart title="Listings scanned" sourceId={sourceId} />

          <section className="admin-section">
            <AdminWindowStats title="Listings added" counts={stats.listings_added} />
            <AdminWindowStats title="Scans" counts={stats.scans} />
          </section>

          <section className="admin-section admin-danger-zone">
            <h2 className="admin-section__title">Danger zone</h2>
            <div className="admin-danger-zone__row">
              <p className="admin-danger-zone__description">
                Permanently delete this crawl source. This can't be undone.
              </p>
              <button
                type="button"
                className="rescan-button rescan-button--danger"
                disabled={deleteSourceMutation.isPending}
                onClick={deleteSource}
              >
                {deleteSourceMutation.isPending ? "Deleting…" : "Delete source"}
              </button>
            </div>
            {deleteSourceMutation.isError && (
              <p className="admin-source-header__error">Couldn't delete this source.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
