#!/usr/bin/env node

/**
 * Refresh src/config/mcpTools.generated.json from the aexy-io/mcp-server repo.
 *
 * The MCP tool catalogue is produced there by scripts/dump_tool_manifest.py and
 * consumed here by the /mcp page and by docs/mcp.md. This script is the seam
 * between the two repos.
 *
 *   node scripts/fetch-tool-manifest.mjs              # refresh from the pinned tag
 *   node scripts/fetch-tool-manifest.mjs --tag v0.2.0 # refresh and re-pin
 *   node scripts/fetch-tool-manifest.mjs --check      # CI: fail if we are stale
 *
 * Deliberately NOT part of prebuild. The manifest is committed, so builds stay
 * hermetic and offline-buildable; refreshing it is a explicit, reviewable act.
 * `--check` runs in CI to say when the pin has fallen behind upstream.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "config", "mcpTools.generated.json");
const PIN = path.join(ROOT, "src", "config", "mcpTools.pin.json");

const REPO = "aexy-io/mcp-server";

const args = process.argv.slice(2);
const check = args.includes("--check");
const tagArg = args.includes("--tag") ? args[args.indexOf("--tag") + 1] : null;

function readPin() {
  if (!fs.existsSync(PIN)) return { ref: "master" };
  return JSON.parse(fs.readFileSync(PIN, "utf8"));
}

/**
 * Prefer the release asset (immutable, versioned). Fall back to the raw file on
 * the ref, which is what works today — upstream does not publish assets yet.
 */
async function fetchManifest(ref) {
  const sources = [
    `https://github.com/${REPO}/releases/download/${ref}/tools.json`,
    `https://raw.githubusercontent.com/${REPO}/${ref}/tools.json`,
  ];
  const failures = [];
  for (const url of sources) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) return { body: await res.text(), url };
      failures.push(`${res.status} ${url}`);
    } catch (err) {
      failures.push(`${err.message} ${url}`);
    }
  }
  throw new Error(`could not fetch tools.json at ref ${ref}:\n  ${failures.join("\n  ")}`);
}

function validate(manifest) {
  if (manifest.manifest_version !== 1) {
    throw new Error(`unsupported manifest_version ${manifest.manifest_version}`);
  }
  if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) {
    throw new Error("manifest has no categories");
  }
  const names = new Set();
  for (const cat of manifest.categories) {
    for (const key of ["key", "name", "capability"]) {
      if (!cat[key]) throw new Error(`category ${cat.key ?? "?"} is missing ${key}`);
    }
    for (const tool of cat.tools ?? []) {
      if (!tool.name) throw new Error(`category ${cat.key} has a tool with no name`);
      if (names.has(tool.name)) throw new Error(`duplicate tool ${tool.name}`);
      names.add(tool.name);
    }
  }
  return names.size;
}

const ref = tagArg ?? readPin().ref;

let body;
let url;
try {
  ({ body, url } = await fetchManifest(ref));
} catch (err) {
  // Upstream does not publish tools.json yet — dump_tool_manifest.py is staged
  // in scripts/mcp-server-upstream/ waiting to be merged there. Until it lands,
  // --check has nothing to compare against, and failing CI over that would be
  // noise. A manifest that IS reachable but stale still fails below.
  if (check) {
    console.warn(`⚠ Upstream manifest unavailable at ${REPO}@${ref} — skipping check.`);
    console.warn(`  ${err.message.split("\n").slice(1).join("\n  ").trim()}`);
    process.exit(0);
  }
  console.error(`✗ ${err.message}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(body);
} catch {
  console.error(`✗ tools.json at ${url} is not valid JSON`);
  process.exit(1);
}

let toolCount;
try {
  toolCount = validate(manifest);
} catch (err) {
  console.error(`✗ tools.json at ${url} is malformed: ${err.message}`);
  process.exit(1);
}

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (check) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== serialized) {
    console.error(
      `✗ mcpTools.generated.json is stale against ${REPO}@${ref}.\n` +
        `  Run: npm run mcp:manifest`
    );
    process.exit(1);
  }
  console.log(`✓ MCP tool manifest current with ${REPO}@${ref} (${toolCount} tools)`);
  process.exit(0);
}

fs.writeFileSync(OUT, serialized);
if (tagArg) {
  fs.writeFileSync(PIN, `${JSON.stringify({ ref: tagArg }, null, 2)}\n`);
}
console.log(
  `  Wrote ${toolCount} tools from ${url} → src/config/mcpTools.generated.json`
);
