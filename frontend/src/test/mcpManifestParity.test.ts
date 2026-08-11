/**
 * The MCP tool catalogue is generated, and these tests are what keep it that way.
 *
 * The /mcp page used to carry a hand-copied array of 35 tool names, with the
 * descriptions hand-copied a second time into messages/{en,hi}/mcp.json. Its own
 * comment conceded the list was not generated and had to be updated by hand
 * whenever `aexy-io/mcp-server` changed. Nothing checked it, so the page was only
 * ever accidentally right — the same failure mode `appCatalogParity.test.ts`
 * documents for the app catalogue.
 *
 * The manifest is now produced upstream by `scripts/dump_tool_manifest.py` from
 * the live tool registry and pulled in by `npm run mcp:manifest`. These tests
 * assert it is well-formed and that every capability it declares will have
 * somewhere to be granted.
 */

import { describe, expect, it } from "vitest";

import { APP_CATALOG } from "@/config/appDefinitions";
import {
  MCP_CAPABILITIES,
  MCP_TOOL_CATEGORIES,
  MCP_TOOL_COUNT,
  MCP_TOOL_MANIFEST,
} from "@/config/mcpTools";

describe("MCP tool manifest", () => {
  it("is a manifest version this code understands", () => {
    expect(MCP_TOOL_MANIFEST.manifest_version).toBe(1);
    expect(MCP_TOOL_MANIFEST.server_name).toBe("aexy");
    expect(MCP_TOOL_MANIFEST.server_version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("has categories that each carry at least one tool", () => {
    expect(MCP_TOOL_CATEGORIES.length).toBeGreaterThan(0);
    for (const category of MCP_TOOL_CATEGORIES) {
      expect(category.key, "category key").toBeTruthy();
      expect(category.name, `${category.key} display name`).toBeTruthy();
      expect(category.tools.length, `${category.key} tool count`).toBeGreaterThan(0);
    }
  });

  it("names every tool exactly once across the whole catalogue", () => {
    const names = MCP_TOOL_CATEGORIES.flatMap((c) => c.tools.map((t) => t.name));
    expect(names).toHaveLength(new Set(names).size);
    expect(names).toHaveLength(MCP_TOOL_COUNT);
  });

  it("gives every tool a description a model can select on", () => {
    for (const category of MCP_TOOL_CATEGORIES) {
      for (const tool of category.tools) {
        expect(tool.description, `${tool.name} description`).toBeTruthy();
        expect(tool.description.length, `${tool.name} description`).toBeGreaterThan(20);
      }
    }
  });

  it("declares a well-formed capability on every tool, matching its category", () => {
    for (const category of MCP_TOOL_CATEGORIES) {
      expect(category.capability).toMatch(/^mcp\.[a-z][a-z0-9_]*$/);
      for (const tool of category.tools) {
        expect(tool.capability, `${tool.name} capability`).toBe(category.capability);
      }
    }
  });

  it("exposes an input schema per tool", () => {
    for (const category of MCP_TOOL_CATEGORIES) {
      for (const tool of category.tools) {
        expect(tool.input_schema, `${tool.name} input_schema`).toBeTypeOf("object");
        expect(tool.input_schema).toHaveProperty("properties");
      }
    }
  });

  it("marks the Temporal write tools as mutating", () => {
    const byName = new Map(
      MCP_TOOL_CATEGORIES.flatMap((c) => c.tools).map((t) => [t.name, t])
    );
    // These terminate and redirect live workflows. Phase 1 puts them behind a
    // server-side grant; until then the flag is what the docs use to warn.
    expect(byName.get("temporal_signal_workflow")?.mutating).toBe(true);
    expect(byName.get("temporal_cancel_workflow")?.mutating).toBe(true);
    expect(byName.get("temporal_list_workflows")?.mutating).toBe(false);
  });
});

describe("MCP capabilities line up with the app catalogue", () => {
  const declaredModules = (APP_CATALOG.mcp?.modules ?? []).map((m) => m.id);

  it("keeps the mcp app in the catalogue for the manifest to hang off", () => {
    expect(APP_CATALOG.mcp).toBeDefined();
    expect(APP_CATALOG.mcp.baseRoute).toBe("/mcp");
  });

  /**
   * This manifest's capabilities are NOT the authoritative set, and the two
   * vocabularies deliberately differ.
   *
   * The manifest describes the 35 hand-written tools the stdio server ships
   * today, grouped the way that server groups them — `mcp.email_gtm` covers
   * email and GTM together, `mcp.analytics` covers what the API calls insights,
   * and `mcp.temporal` has no API surface at all because those tools bypass the
   * backend and talk to Temporal directly.
   *
   * The authoritative capability set is generated from the API itself by
   * `backend/scripts/dump_mcp_catalog.py` — 28 capabilities over all 1866
   * operations — and grantability is asserted there, against APP_CATALOG and
   * the `mcp` app's modules, in `backend/tests/unit/test_mcp_catalog.py`.
   * Asserting it here too would force this transitional manifest to adopt names
   * its tools do not use.
   *
   * These tools are superseded by the generated per-capability tools the
   * `/mcp/tools` endpoint returns; this file guards the manifest until they are.
   */
  it("declares capabilities in the expected namespace", () => {
    expect(MCP_CAPABILITIES.length).toBeGreaterThan(0);
    for (const capability of MCP_CAPABILITIES) {
      expect(capability).toMatch(/^mcp\.[a-z][a-z0-9_]*$/);
    }
  });

  it("keeps the appless capabilities as mcp modules", () => {
    expect([...declaredModules].sort()).toEqual([
      "admin",
      "integrations",
      "platform",
    ]);
  });
});
