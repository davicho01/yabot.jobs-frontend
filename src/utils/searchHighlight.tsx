import type { ReactNode } from "react";

// Mirrors the backend's parse_search_query (app/services/jobs.py) — kept in
// sync by hand since the two run in different languages. A whitespace-
// separated token starting with "-" (e.g. "-senior") excludes; everything
// else is rejoined (single-spaced) as the phrase a title must contain.
export function parseSearchQuery(q: string): { include: string | null; excludeTerms: string[] } {
  const excludeTerms: string[] = [];
  const includeParts: string[] = [];
  for (const token of q.split(/\s+/).filter(Boolean)) {
    if (token.length > 1 && token.startsWith("-")) excludeTerms.push(token.slice(1));
    else includeParts.push(token);
  }
  return { include: includeParts.join(" ").trim() || null, excludeTerms };
}

// Wraps the first case-insensitive occurrence of the search query's positive
// phrase in <mark>, so a matched title shows the reader why it's here.
// Exclusion terms (-word) are never highlighted — by definition they can't
// appear in a title the search actually returned.
export function highlightQuery(text: string, query: string | null | undefined): ReactNode {
  if (!query) return text;
  const { include } = parseSearchQuery(query);
  if (!include) return text;
  const index = text.toLowerCase().indexOf(include.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + include.length)}</mark>
      {text.slice(index + include.length)}
    </>
  );
}
