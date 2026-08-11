/**
 * Typed view over the generated MCP tool manifest.
 *
 * SOURCE OF TRUTH: aexy-io/mcp-server — scripts/dump_tool_manifest.py walks the
 * live tool registry there and emits tools.json. `npm run mcp:manifest` pulls it
 * into mcpTools.generated.json; nothing in this repo hand-maintains tool names
 * or descriptions any more.
 *
 * Category display names and tool descriptions come from the manifest, which
 * means they are English-only — they are the server's own strings, the same ones
 * a client shows in its tool picker, so translating them here would make the
 * page disagree with every client. i18n covers the page chrome around them.
 */

import manifest from "./mcpTools.generated.json";

export interface McpTool {
  name: string;
  description: string;
  /** Grant required for this tool, e.g. "mcp.temporal". Enforced server-side. */
  capability: string;
  /** True when the tool can change state. Drives the destructive-tool badge. */
  mutating: boolean;
  input_schema: Record<string, unknown>;
}

export interface McpToolCategory {
  key: string;
  name: string;
  capability: string;
  tools: McpTool[];
}

export interface McpToolManifest {
  manifest_version: number;
  server_version: string;
  server_name: string;
  categories: McpToolCategory[];
}

export const MCP_TOOL_MANIFEST = manifest as McpToolManifest;
export const MCP_TOOL_CATEGORIES = MCP_TOOL_MANIFEST.categories;

export const MCP_TOOL_COUNT = MCP_TOOL_CATEGORIES.reduce(
  (sum, category) => sum + category.tools.length,
  0
);

/** Every distinct capability the catalogue declares, in category order. */
export const MCP_CAPABILITIES = Array.from(
  new Set(MCP_TOOL_CATEGORIES.map((category) => category.capability))
);
