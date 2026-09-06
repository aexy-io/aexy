/**
 * The MCP tool catalogue is generated, and these tests are what keep it that way.
 *
 * The /mcp page used to render a manifest fetched from the standalone stdio
 * server: 35 hand-written tools, four of them calling paths that did not exist,
 * and none of them the per-capability tools the remote transport actually
 * offers. The manifest is now derived from the backend's own catalogue —
 * `backend/tests/fixtures/mcp-catalog.generated.json`, which CI regenerates from
 * the OpenAPI schema — by `npm run mcp:manifest`. These tests assert it is
 * well-formed and that every capability it declares has somewhere to be granted.
 */

import { describe, expect, it } from "vitest";

import { APP_CATALOG } from "@/config/appDefinitions";
import {
  MCP_CAPABILITIES,
  MCP_OPERATION_COUNT,
  MCP_TOOL_CATEGORIES,
  MCP_TOOL_MANIFEST,
} from "@/config/mcpTools";

describe("MCP tool manifest", () => {
  it("is a manifest version this code understands, from the backend", () => {
    expect(MCP_TOOL_MANIFEST.manifest_version).toBe(2);
    expect(MCP_TOOL_MANIFEST.server_name).toBe("aexy");
    expect(MCP_TOOL_MANIFEST.source).toContain("backend/tests/fixtures");
  });

  it("covers the whole API", () => {
    // Guards against a mapping change that quietly strands a large surface.
    expect(MCP_OPERATION_COUNT).toBeGreaterThan(1800);
    const summed = MCP_TOOL_CATEGORIES.reduce((n, c) => n + c.operation_count, 0);
    expect(summed).toBe(MCP_OPERATION_COUNT);
  });

  it("has one tool per capability, each with at least one action", () => {
    expect(MCP_TOOL_CATEGORIES.length).toBeGreaterThan(0);
    for (const category of MCP_TOOL_CATEGORIES) {
      expect(category.key, "category key").toBeTruthy();
      expect(category.name, `${category.key} display name`).toBeTruthy();
      expect(category.tool.name).toBe(`aexy_${category.key}`);
      expect(category.actions.length).toBe(category.operation_count);
      expect(category.write_count).toBe(category.actions.filter((a) => a.mutating).length);
    }
  });

  it("names every action exactly once within its capability", () => {
    for (const category of MCP_TOOL_CATEGORIES) {
      const names = category.actions.map((a) => a.action);
      expect(names, category.key).toHaveLength(new Set(names).size);
    }
  });

  it("always offers discovery and the generic call", () => {
    const names = MCP_TOOL_MANIFEST.generic_tools.map((t) => t.name);
    expect(names).toEqual(["aexy_discover", "aexy_call"]);
  });

  it("names a real operation for every named routine", () => {
    // Action names are unique within a capability, not across the catalogue —
    // `list_records` is both CRM and Tables — so check the pair.
    const pairs = new Set(
      MCP_TOOL_CATEGORIES.flatMap((c) => c.actions.map((a) => `${c.capability}:${a.action}`))
    );
    for (const tool of MCP_TOOL_MANIFEST.workflow_tools) {
      expect(
        pairs.has(`${tool.capability}:${tool.action}`),
        `${tool.name} → ${tool.capability}:${tool.action}`
      ).toBe(true);
    }
  });

  it("declares a well-formed capability on every category", () => {
    for (const capability of MCP_CAPABILITIES) {
      expect(capability).toMatch(/^mcp\.[a-z][a-z0-9_]*$/);
    }
    expect(MCP_CAPABILITIES).toHaveLength(MCP_TOOL_CATEGORIES.length);
  });

  it("marks every write as mutating by method", () => {
    for (const category of MCP_TOOL_CATEGORIES) {
      for (const action of category.actions) {
        expect(action.mutating, `${category.key}.${action.action}`).toBe(action.method !== "GET");
      }
    }
  });
});

describe("MCP capabilities line up with the app catalogue", () => {
  const mcpModules = (APP_CATALOG.mcp?.modules ?? []).map((m) => m.id);

  it("keeps the mcp app in the catalogue for the platform modules to hang off", () => {
    expect(APP_CATALOG.mcp).toBeDefined();
    expect(APP_CATALOG.mcp.baseRoute).toBe("/mcp");
  });

  it("grants every capability either through an app or an mcp module", () => {
    for (const category of MCP_TOOL_CATEGORIES) {
      if (category.app) {
        expect(APP_CATALOG[category.app], `${category.capability} → app ${category.app}`).toBeDefined();
      } else {
        expect(mcpModules, `${category.capability} → mcp module ${category.key}`).toContain(
          category.key
        );
      }
    }
  });

  it("keeps the appless capabilities as mcp modules, and only those", () => {
    const appless = MCP_TOOL_CATEGORIES.filter((c) => !c.app).map((c) => c.key).sort();
    expect(appless).toEqual([...mcpModules].sort());
    expect(appless).toEqual(["admin", "integrations", "platform"]);
  });

  it("flags only admin as privileged", () => {
    const privileged = MCP_TOOL_CATEGORIES.filter((c) => c.privileged).map((c) => c.key);
    expect(privileged).toEqual(["admin"]);
  });
});
