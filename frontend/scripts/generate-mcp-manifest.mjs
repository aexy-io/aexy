#!/usr/bin/env node

/**
 * Derive src/config/mcpTools.generated.json from the backend's MCP catalogue.
 *
 * The /mcp page and docs/mcp.md used to render a manifest fetched from the
 * standalone stdio server — 35 hand-written tools, four of them dead, and none
 * of them what the remote transport actually offers. The backend now generates
 * its tool surface from its own OpenAPI schema and checks the result into
 * backend/tests/fixtures/mcp-catalog.generated.json (CI fails when it is
 * stale). This script is the seam: it reads that fixture and writes the shape
 * the frontend renders, so the page cannot disagree with the server.
 *
 *   node scripts/generate-mcp-manifest.mjs           # write
 *   node scripts/generate-mcp-manifest.mjs --check   # CI: fail if stale
 *
 * Not part of prebuild on purpose: the fixture lives outside the frontend and
 * may be absent in a Docker build context, and a committed manifest keeps
 * builds hermetic. Regenerating is an explicit, reviewable act.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.resolve(
  ROOT,
  "..",
  "backend",
  "tests",
  "fixtures",
  "mcp-catalog.generated.json"
);
const OUT = path.join(ROOT, "src", "config", "mcpTools.generated.json");

const check = process.argv.includes("--check");

if (!fs.existsSync(FIXTURE)) {
  console.error(`✗ backend catalogue fixture not found at ${FIXTURE}`);
  console.error("  Run: cd backend && python scripts/dump_mcp_catalog.py");
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

/** Display names where "replace underscores, title-case" reads wrong. */
const NAMES = {
  crm: "CRM",
  gtm: "GTM",
  docs: "Documents",
  oncall: "On-call",
  email_marketing: "Email marketing",
  service_desk: "Service desk",
  platform: "Workspace & members",
  admin: "Billing & system admin",
  integrations: "Integrations",
  insights: "Engineering insights",
};

function displayName(key) {
  if (NAMES[key]) return NAMES[key];
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const categories = catalog.capabilities.map((group) => {
  const key = group.capability.replace(/^mcp\./, "");
  const writes = group.operations.filter((op) => op.mutating).length;
  return {
    key,
    name: displayName(key),
    capability: group.capability,
    app: group.app,
    privileged: Boolean(group.privileged),
    operation_count: group.operation_count,
    write_count: writes,
    tool: {
      name: `aexy_${key}`,
      description:
        `${group.operation_count} Aexy operations for ${key.replace(/_/g, " ")} ` +
        `(${writes} of them write). Pick an action; pass path segments in ` +
        `path_params, filters in query, and payloads in body.`,
    },
    actions: group.operations.map((op) => ({
      action: op.action,
      method: op.method,
      path: op.path,
      summary: op.summary,
      mutating: op.mutating,
    })),
  };
});

const total = categories.reduce((n, c) => n + c.operation_count, 0);

const manifest = {
  manifest_version: 2,
  server_name: "aexy",
  source: "backend/tests/fixtures/mcp-catalog.generated.json",
  catalog_version: catalog.catalog_version,
  total_operations: total,
  total_capabilities: categories.length,
  generic_tools: [
    {
      name: "aexy_discover",
      description:
        "Search the operations you can reach by free text. Returns each match's action name, method, path and summary.",
    },
    {
      name: "aexy_call",
      description:
        "Call any operation you can reach by its action name, with path_params, query and body. Access is enforced server-side.",
    },
  ],
  workflow_tools: (catalog.workflow_tools ?? []).map((tool) => ({
    name: tool.name,
    capability: tool.capability,
    action: tool.action,
    description: tool.description,
  })),
  categories,
};

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (check) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== serialized) {
    console.error("✗ mcpTools.generated.json is stale against the backend catalogue.");
    console.error("  Run: npm run mcp:manifest");
    process.exit(1);
  }
  console.log(
    `✓ MCP manifest current (${total} operations, ${categories.length} capabilities)`
  );
  process.exit(0);
}

fs.writeFileSync(OUT, serialized);
console.log(
  `  Wrote ${total} operations across ${categories.length} capabilities → src/config/mcpTools.generated.json`
);
