/**
 * Typed view over the generated MCP manifest.
 *
 * SOURCE OF TRUTH: the backend. `services/mcp_catalog.py` derives the whole tool
 * surface from the API's own OpenAPI schema, `scripts/dump_mcp_catalog.py`
 * writes it to a fixture CI checks, and `npm run mcp:manifest` renders that
 * fixture into mcpTools.generated.json. Nothing in this repo hand-maintains a
 * tool name, an action or a description.
 *
 * What a signed-in person actually gets is narrower than this file: the
 * `/workspaces/{id}/mcp/tools` endpoint filters by the apps they hold. The
 * page uses this manifest for the full picture and the endpoint for "yours".
 */

import manifest from "./mcpTools.generated.json";

export interface McpAction {
  action: string;
  method: string;
  path: string;
  summary: string;
  mutating: boolean;
}

export interface McpToolCategory {
  key: string;
  name: string;
  /** Grant that governs the category, e.g. "mcp.sprints". Enforced server-side. */
  capability: string;
  /** The app whose grant IS this capability; null for the three platform modules. */
  app: string | null;
  privileged: boolean;
  operation_count: number;
  write_count: number;
  tool: { name: string; description: string };
  actions: McpAction[];
}

export interface McpNamedTool {
  name: string;
  description: string;
  capability?: string;
  action?: string;
}

export interface McpToolManifest {
  manifest_version: number;
  server_name: string;
  source: string;
  catalog_version: number;
  total_operations: number;
  total_capabilities: number;
  generic_tools: McpNamedTool[];
  workflow_tools: McpNamedTool[];
  categories: McpToolCategory[];
}

export const MCP_TOOL_MANIFEST = manifest as McpToolManifest;
export const MCP_TOOL_CATEGORIES = MCP_TOOL_MANIFEST.categories;

/** Operations reachable in total, across every capability. */
export const MCP_OPERATION_COUNT = MCP_TOOL_MANIFEST.total_operations;

/** Every distinct capability the catalogue declares, in category order. */
export const MCP_CAPABILITIES = Array.from(
  new Set(MCP_TOOL_CATEGORIES.map((category) => category.capability))
);
