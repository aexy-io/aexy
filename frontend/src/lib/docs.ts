import fs from "fs";
import path from "path";

export interface DocItem {
  title: string;
  slug: string;
  path: string;
  description: string;
}

export interface DocSection {
  title: string;
  items: DocItem[];
}

export interface DocPagerEntry {
  prev: { title: string; slug: string } | null;
  next: { title: string; slug: string } | null;
}

export interface DocIndex {
  sections: DocSection[];
  lookup: Record<string, { title: string; section: string; description: string; path: string }>;
  pager: Record<string, DocPagerEntry>;
}

export interface DocSearchEntry {
  slug: string;
  title: string;
  section: string;
  description: string;
  headings: string[];
}

const DOCS_DIR = path.join(process.cwd(), "public", "docs");

let cachedIndex: DocIndex | null = null;
export function getDocIndex(): DocIndex {
  if (cachedIndex) return cachedIndex;
  try {
    const raw = fs.readFileSync(path.join(DOCS_DIR, "index.json"), "utf-8");
    cachedIndex = JSON.parse(raw) as DocIndex;
  } catch {
    cachedIndex = { sections: [], lookup: {}, pager: {} };
  }
  return cachedIndex;
}

export function getDocContent(slug: string): string | null {
  const meta = getDocIndex().lookup[slug];
  if (!meta) return null;
  try {
    return fs.readFileSync(path.join(DOCS_DIR, meta.path), "utf-8");
  } catch {
    return null;
  }
}

export function getAllDocSlugs(): string[] {
  return Object.keys(getDocIndex().lookup);
}

let cachedSearch: DocSearchEntry[] | null = null;
export function getSearchIndex(): DocSearchEntry[] {
  if (cachedSearch) return cachedSearch;
  try {
    const raw = fs.readFileSync(path.join(DOCS_DIR, "search-index.json"), "utf-8");
    cachedSearch = JSON.parse(raw) as DocSearchEntry[];
  } catch {
    cachedSearch = [];
  }
  return cachedSearch;
}

export function extractHeadings(markdown: string): { id: string; text: string; depth: 2 | 3 }[] {
  const lines = markdown.split("\n");
  const headings: { id: string; text: string; depth: 2 | 3 }[] = [];
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (!m) continue;
    const depth = m[1].length as 2 | 3;
    const text = m[2].replace(/\[(.+?)\]\(.+?\)/g, "$1").trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    headings.push({ id, text, depth });
  }
  return headings;
}
