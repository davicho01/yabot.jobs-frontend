import { useId } from "react";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const delta = 1;
  const pages = new Set<number>([1, total, current]);
  for (let i = 1; i <= delta; i++) {
    if (current - i >= 1) pages.add(current - i);
    if (current + i <= total) pages.add(current + i);
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push("ellipsis");
    result.push(p);
    prev = p;
  }
  return result;
}

/**
 * Rows-per-page + first/prev/numbered/next/last controls shared by the admin
 * tables. Stateless — the caller owns page/pageSize (both admin pages keep
 * them in the URL) and clamps `page` to `totalPages`. On a phone the numbered
 * pages and first/last buttons drop away (see AdminCommon.css), leaving a
 * compact prev/next bar.
 */
export function AdminPagination({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const sizeSelectId = useId();
  const pageNumbers = getPageNumbers(page, totalPages);
  const goToPage = (target: number) => onPageChange(Math.min(totalPages, Math.max(1, target)));

  return (
    <div className="admin-pagination">
      <div className="admin-pagination__size">
        <label htmlFor={sizeSelectId}>Rows per page</label>
        <select
          id={sizeSelectId}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="admin-pagination__controls">
        <button
          type="button"
          className="rescan-button admin-pagination__nav admin-pagination__nav--edge"
          disabled={page <= 1}
          onClick={() => goToPage(1)}
          aria-label="First page"
        >
          « First
        </button>
        <button
          type="button"
          className="rescan-button admin-pagination__nav"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
          aria-label="Previous page"
        >
          ‹ Prev
        </button>

        <div className="admin-pagination__pages">
          {pageNumbers.map((entry, index) =>
            entry === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="admin-pagination__ellipsis">
                …
              </span>
            ) : (
              <button
                type="button"
                key={entry}
                className={
                  entry === page
                    ? "admin-pagination__page-button admin-pagination__page-button--active"
                    : "admin-pagination__page-button"
                }
                onClick={() => goToPage(entry)}
                aria-current={entry === page ? "page" : undefined}
              >
                {entry}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className="rescan-button admin-pagination__nav"
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
          aria-label="Next page"
        >
          Next ›
        </button>
        <button
          type="button"
          className="rescan-button admin-pagination__nav admin-pagination__nav--edge"
          disabled={page >= totalPages}
          onClick={() => goToPage(totalPages)}
          aria-label="Last page"
        >
          Last »
        </button>
      </div>

      <span className="admin-pagination__status">
        Page {page} of {totalPages} · {total.toLocaleString()} total
      </span>
    </div>
  );
}
