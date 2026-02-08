#!/usr/bin/env node

/**
 * Generate a standalone changelog HTML page and copy raw markdown to public/.
 *
 * Usage: node scripts/generate-changelog.mjs
 * Output: public/changelog.html, public/changelog.md
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHANGELOG_PATH = path.resolve(ROOT, "..", "CHANGELOG.md");
const PUBLIC_DIR = path.join(ROOT, "public");

let content;
try {
  content = fs.readFileSync(CHANGELOG_PATH, "utf-8");
} catch {
  // In Docker builds, CHANGELOG.md may be outside the build context.
  // Skip generation gracefully — the Next.js page handles missing content.
  console.warn("  CHANGELOG.md not found at", CHANGELOG_PATH, "— skipping generation");
  process.exit(0);
}

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.writeFileSync(path.join(PUBLIC_DIR, "changelog.md"), content);
console.log("  Copied changelog.md → public/changelog.md");

function parseVersions(raw) {
  const versions = [];
  let current = null;
  for (const line of raw.split("\n")) {
    const m = line.match(/^## \[(.+?)\]\s*-\s*(.+)$/);
    if (m) {
      if (current) versions.push(current);
      current = { version: m[1], date: m[2].trim(), lines: [] };
      continue;
    }
    if (line.startsWith("# ") || line.startsWith("All notable") || line.startsWith("The format")) continue;
    if (current) current.lines.push(line);
  }
  if (current) versions.push(current);
  return versions;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#fff">$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(
      /\[(.+?)\]\((.+?)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

function badgeColor(title) {
  const map = {
    added: { bg: "rgba(16,185,129,0.15)", fg: "#34d399", bd: "rgba(16,185,129,0.3)" },
    changed: { bg: "rgba(59,130,246,0.15)", fg: "#60a5fa", bd: "rgba(59,130,246,0.3)" },
    fixed: { bg: "rgba(245,158,11,0.15)", fg: "#fbbf24", bd: "rgba(245,158,11,0.3)" },
    removed: { bg: "rgba(239,68,68,0.15)", fg: "#f87171", bd: "rgba(239,68,68,0.3)" },
    deprecated: { bg: "rgba(249,115,22,0.15)", fg: "#fb923c", bd: "rgba(249,115,22,0.3)" },
    security: { bg: "rgba(168,85,247,0.15)", fg: "#c084fc", bd: "rgba(168,85,247,0.3)" },
  };
  return map[title.toLowerCase()] || { bg: "rgba(255,255,255,0.08)", fg: "rgba(255,255,255,0.6)", bd: "rgba(255,255,255,0.15)" };
}

function renderContent(lines) {
  let html = "";
  let inList = false;

  for (const line of lines) {
    const h3 = line.match(/^### (.+)$/);
    if (h3) {
      if (inList) { html += "</ul>"; inList = false; }
      const c = badgeColor(h3[1]);
      html += `<div style="margin:20px 0 12px"><span style="display:inline-flex;padding:4px 10px;font-size:12px;font-weight:500;border-radius:9999px;border:1px solid ${c.bd};background:${c.bg};color:${c.fg}">${esc(h3[1])}</span></div>`;
      continue;
    }
    const h4 = line.match(/^#### (.+)$/);
    if (h4) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h4 style="font-size:15px;font-weight:500;color:rgba(255,255,255,0.9);margin:16px 0 8px">${esc(h4[1])}</h4>`;
      continue;
    }
    if (line.trim() === "---") {
      if (inList) { html += "</ul>"; inList = false; }
      html += '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:16px 0">';
      continue;
    }
    if (line.match(/^- /)) {
      if (!inList) { html += '<ul style="list-style:none;padding:0;margin:0 0 12px">'; inList = true; }
      html += `<li style="color:rgba(255,255,255,0.55);font-size:14px;padding:3px 0;display:flex;align-items:start;gap:8px"><span style="width:4px;height:4px;border-radius:50%;background:rgba(99,102,241,0.5);margin-top:7px;flex-shrink:0"></span><span>${renderInline(line.slice(2))}</span></li>`;
      continue;
    }
    if (line.trim() === "") {
      if (inList) { html += "</ul>"; inList = false; }
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }
    html += `<p style="color:rgba(255,255,255,0.55);font-size:14px;margin:0 0 8px">${renderInline(line)}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

const versions = parseVersions(content);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Changelog - Aexy</title>
<meta name="description" content="All notable changes to Aexy.">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0f;color:rgba(255,255,255,0.7);min-height:100vh}
a{color:#818cf8;text-decoration:none}a:hover{text-decoration:underline}
code{padding:2px 6px;background:rgba(255,255,255,0.08);border-radius:4px;color:#818cf8;font-size:13px;font-family:"SF Mono",Monaco,monospace}
.container{max-width:720px;margin:0 auto;padding:0 24px}
.hero{text-align:center;padding:80px 24px 48px}
.hero h1{font-size:48px;font-weight:700;color:#fff;margin-bottom:12px;letter-spacing:-0.02em}
.hero p{font-size:18px;color:rgba(255,255,255,0.4)}
.pill{display:inline-flex;padding:6px 16px;font-size:14px;border-radius:9999px;border:1px solid rgba(99,102,241,0.3);background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(168,85,247,0.15));color:#818cf8;margin-bottom:24px}
.timeline{position:relative;padding-bottom:64px}
.timeline::before{content:"";position:absolute;left:15px;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.06)}
.version{position:relative;margin-bottom:40px;padding-left:48px}
.dot{position:absolute;left:11px;top:10px;width:9px;height:9px;border-radius:50%;background:rgba(99,102,241,0.6);box-shadow:0 0 0 4px #0a0a0f}
.card{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:24px;transition:border-color .2s}
.card:hover{border-color:rgba(255,255,255,0.12)}
.vh{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.vh .ver{font-size:20px;font-weight:700;color:#fff}
.vh .date{font-size:14px;color:rgba(255,255,255,0.35)}
.latest{padding:2px 8px;font-size:11px;font-weight:500;border-radius:9999px;border:1px solid rgba(99,102,241,0.3);background:rgba(99,102,241,0.15);color:#818cf8}
@media(max-width:640px){.hero h1{font-size:32px}.timeline::before{display:none}.version{padding-left:0}.dot{display:none}}
</style>
</head>
<body>
<div class="hero">
<div class="pill">What&rsquo;s New</div>
<h1>Changelog</h1>
<p>All notable changes to Aexy, documented.</p>
</div>
<div class="container">
<div class="timeline">
${versions
  .map(
    (v, i) => `<div class="version">
<div class="dot"></div>
<div class="card">
<div class="vh">
<span class="ver">v${esc(v.version)}</span>
<span class="date">${esc(v.date)}</span>
${i === 0 ? '<span class="latest">Latest</span>' : ""}
</div>
${renderContent(v.lines)}
</div>
</div>`
  )
  .join("\n")}
</div>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(PUBLIC_DIR, "changelog.html"), html);
console.log("  Generated changelog.html → public/changelog.html");
