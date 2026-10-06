import { Children, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

// A scraped job description, rendered from its markdown. Employers rarely
// write real headings: sections are usually a line of just bold text
// ("**Who We Are:**", "**Job Summary**:") or a short line ending in a colon
// ("Responsibilities:"), often with the section's text starting on the very
// next line of the same paragraph ("**Overview**\nThe team…"), or several
// such lines in a row ("**Responsibilities**\n**What You'll Do**"). Each of
// those label lines at the start of a paragraph is shown as a heading, and
// whatever follows stays a paragraph, so a long description reads as
// sections instead of one block of text. Extends the backend's rule for the
// static job pages (static_job_pages._promote_label_paragraphs).

// Longer than this and it's a sentence that happens to be bold, not a label.
const HEADING_LABEL_MAX_WORDS = 8;

type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[] };

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

// A money amount means it's content ("**US Base salary range: $180,000 – $200,000 USD**"),
// not a section title.
const MONEY = /[$€£¥]|\d[\d,.]{3,}/;

function isShortLabel(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= HEADING_LABEL_MAX_WORDS && !MONEY.test(text);
}

function cleanLabel(text: string): string {
  return text.trim().replace(/\s*:$/, "");
}

// Peels label lines off the start of a paragraph. Returns the labels, how many
// of the paragraph's child nodes they used up, and — when the text node holding
// the last label's line break goes on with the paragraph's text — the rest of
// that text node, which goes first in the paragraph that follows.
function leadingLabels(nodes: HastNode[]): { labels: string[]; used: number; remainder: string | null } {
  const labels: string[] = [];
  let i = 0;
  let remainder: string | null = null;
  while (i < nodes.length) {
    const node = nodes[i];
    const next = nodes[i + 1];
    if (node.tagName === "strong" && isShortLabel(textOf(node))) {
      // The bold line must end the line: nothing after it, or a text node
      // that's only an optional colon and then a line break.
      if (!next) {
        labels.push(cleanLabel(textOf(node)));
        i += 1;
        break;
      }
      const after = next.type === "text" ? (next.value ?? "") : null;
      const lineEnd = after?.match(/^\s*:?[ \t]*(\n|$)/);
      if (after === null || !lineEnd) break;
      labels.push(cleanLabel(textOf(node)));
      const rest = after.slice(lineEnd[0].length);
      // Both nodes are used up; any text after the line break comes back as
      // the remainder, for the paragraph that follows.
      i += 2;
      if (rest.trim()) {
        remainder = rest;
        break;
      }
      continue;
    }
    if (node.type === "text") {
      // "Responsibilities:" on a line of its own.
      const value = node.value ?? "";
      const newline = value.indexOf("\n");
      const line = newline === -1 ? value : value.slice(0, newline);
      if (line.trim().endsWith(":") && isShortLabel(line) && (newline !== -1 || i === nodes.length - 1)) {
        labels.push(cleanLabel(line));
        const rest = newline === -1 ? "" : value.slice(newline + 1);
        i += 1;
        if (rest.trim()) {
          remainder = rest;
          break;
        }
        continue;
      }
    }
    break;
  }
  return { labels, used: i, remainder };
}

const components: Components = {
  p({ node, children, ...props }) {
    const nodes = (node as HastNode | undefined)?.children ?? [];
    const { labels, used, remainder } = leadingLabels(nodes);
    if (labels.length === 0) return <p {...props}>{children}</p>;
    // Children line up one-to-one with the paragraph's nodes.
    const rest: ReactNode[] = Children.toArray(children).slice(used);
    if (remainder !== null) rest.unshift(remainder);
    const hasRest = rest.some((child) => typeof child !== "string" || child.trim());
    return (
      <>
        {labels.map((label, index) => (
          <h3 key={index}>{label}</h3>
        ))}
        {hasRest && <p {...props}>{rest}</p>}
      </>
    );
  },
};

export function JobDescription({ markdown }: { markdown: string }) {
  return <ReactMarkdown components={components}>{markdown}</ReactMarkdown>;
}
