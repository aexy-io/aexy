#!/usr/bin/env node

/**
 * Bundle the repo's /docs markdown into the frontend so it can be served by
 * the public docs site at /docs/[...slug].
 *
 *   - Copies every included .md into frontend/public/docs/ preserving structure.
 *   - Parses docs/README.md to build a curated section/nav tree.
 *   - Buckets any .md not referenced in README under its parent directory.
 *   - Emits public/docs/index.json (nav tree) and public/docs/search-index.json.
 *
 * Runs at prebuild. If the source docs aren't available (e.g. a Docker build
 * with the docs dir excluded from context), the script exits 0 with a warning
 * and the public docs site renders a graceful empty state.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DOCS_SRC = path.resolve(ROOT, "..", "docs");
const DOCS_OUT = path.join(ROOT, "public", "docs");

const EXCLUDED = new Set([
  "FEATURE_TESTING_PLAN.md",
  "GITHUB_INTELLIGENCE_SYSTEM.md",
  "tracker.md",
  "testing/testing-tracker.md",
  "README.md",
]);

const ORPHAN_BUCKETS = {
  "guides/": "Developer guides (cross-cutting)",
  "architecture/": "Architecture & Design",
  "api/": "API Reference",
  "testing/": "Testing",
  "": "Modules",
};

if (!fs.existsSync(DOCS_SRC)) {
  console.warn("  docs/ not found at", DOCS_SRC, "— skipping docs generation");
  process.exit(0);
}

// Walk source tree, copy markdown files, collect rel paths.
fs.rmSync(DOCS_OUT, { recursive: true, force: true });
fs.mkdirSync(DOCS_OUT, { recursive: true });

const allFiles = [];
function walk(dir, relBase = "") {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = relBase ? `${relBase}/${name}` : name;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      walk(abs, rel);
    } else if (name.endsWith(".md")) {
      if (EXCLUDED.has(rel)) continue;
      allFiles.push(rel);
      const outPath = path.join(DOCS_OUT, rel);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.copyFileSync(abs, outPath);
    }
  }
}
walk(DOCS_SRC);

const slugForPath = (rel) => rel.replace(/\.md$/, "");

// Parse README.md to build the curated nav.
const readmeRaw = fs.readFileSync(path.join(DOCS_SRC, "README.md"), "utf-8");
const sections = [];
let currentSection = null;
let inIndex = false;
for (const line of readmeRaw.split("\n")) {
  if (line.startsWith("## Documentation Index")) {
    inIndex = true;
    continue;
  }
  if (inIndex && line.startsWith("## ") && !line.startsWith("## Documentation")) {
    inIndex = false;
    continue;
  }
  if (!inIndex) continue;

  const h3 = line.match(/^### (.+)$/);
  if (h3) {
    currentSection = { title: h3[1].trim(), items: [] };
    sections.push(currentSection);
    continue;
  }

  const item = line.match(/^- \[([^\]]+)\]\(\.\/([^)]+)\)(?:\s*[-—]\s*(.+))?$/);
  if (item && currentSection) {
    const [, title, relPath, desc] = item;
    if (EXCLUDED.has(relPath)) continue;
    if (!allFiles.includes(relPath)) continue;
    currentSection.items.push({
      title: title.trim(),
      slug: slugForPath(relPath),
      path: relPath,
      description: (desc || "").trim(),
    });
  }
}

// Bucket orphans (files not in README) by parent directory.
const referenced = new Set(
  sections.flatMap((s) => s.items.map((i) => i.path)),
);
const orphans = allFiles.filter((f) => !referenced.has(f));

for (const rel of orphans) {
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
  const bucketTitle = ORPHAN_BUCKETS[dir] || "Other";
  let bucket = sections.find((s) => s.title === bucketTitle);
  if (!bucket) {
    bucket = { title: bucketTitle, items: [] };
    sections.push(bucket);
  }
  const baseName = rel.replace(/^.*\//, "").replace(/\.md$/, "");
  const title = baseName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  bucket.items.push({
    title,
    slug: slugForPath(rel),
    path: rel,
    description: "",
  });
}

// Build search index: title + headings + first paragraph.
const searchEntries = [];
for (const section of sections) {
  for (const item of section.items) {
    const raw = fs.readFileSync(path.join(DOCS_SRC, item.path), "utf-8");
    const headings = [];
    let firstPara = "";
    const lines = raw.split("\n");
    let lookingForPara = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const h = line.match(/^(#{1,4})\s+(.+)$/);
      if (h) {
        const text = h[2].replace(/\[(.+?)\]\(.+?\)/g, "$1").trim();
        headings.push(text);
        if (h[1].length === 1) lookingForPara = true;
        continue;
      }
      if (lookingForPara && line.trim() && !line.startsWith("#")) {
        firstPara = line
          .replace(/\[(.+?)\]\(.+?\)/g, "$1")
          .replace(/[*_`]/g, "")
          .trim();
        lookingForPara = false;
      }
    }
    searchEntries.push({
      slug: item.slug,
      title: item.title,
      section: section.title,
      description: item.description || firstPara.slice(0, 180),
      headings,
    });
  }
}

// Flat slug -> { title, section, description } map for direct lookups.
const lookup = {};
for (const section of sections) {
  for (const item of section.items) {
    lookup[item.slug] = {
      title: item.title,
      section: section.title,
      description: item.description,
      path: item.path,
    };
  }
}

// Compute prev/next within the curated reading order.
const flatList = sections.flatMap((s) =>
  s.items.map((i) => ({ ...i, section: s.title })),
);
const pager = {};
for (let i = 0; i < flatList.length; i++) {
  pager[flatList[i].slug] = {
    prev:
      i > 0
        ? { title: flatList[i - 1].title, slug: flatList[i - 1].slug }
        : null,
    next:
      i < flatList.length - 1
        ? { title: flatList[i + 1].title, slug: flatList[i + 1].slug }
        : null,
  };
}

fs.writeFileSync(
  path.join(DOCS_OUT, "index.json"),
  JSON.stringify({ sections, lookup, pager }, null, 2),
);
fs.writeFileSync(
  path.join(DOCS_OUT, "search-index.json"),
  JSON.stringify(searchEntries, null, 2),
);

console.log(
  `  Generated docs site: ${allFiles.length} pages, ${sections.length} sections → public/docs/`,
);
