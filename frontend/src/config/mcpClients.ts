/**
 * Setup recipes for every MCP client we support.
 *
 * These were previously three tabs on the /mcp page, and all three were wrong:
 *
 *  - Claude Code was told to put `mcpServers` in `.claude/settings.local.json`.
 *    That file holds `enabledMcpjsonServers` — a list of server *names* to
 *    auto-approve. Server definitions go in `.mcp.json` (project, committed) or
 *    `~/.claude.json` (user scope), and the supported path is `claude mcp add`.
 *  - Codex got a bare shell command and a table of environment variables, which
 *    is not a configuration format. Codex reads `~/.codex/config.toml`.
 *  - "Other clients" told the reader to export shell variables and run the
 *    binary, which no client consumes.
 *
 * Claude Desktop, Cursor and VS Code were absent entirely. ChatGPT was too, and
 * it is the one client that cannot be fixed with documentation: it consumes
 * remote MCP servers only, so it stays marked unavailable until the streamable
 * HTTP transport ships.
 *
 * Every recipe also drops `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE` and
 * `AEXY_ENABLE_TEMPORAL`. The first two only existed because the Temporal tools
 * connect straight to the Temporal frontend from the client machine; the third
 * is a client-side env var, so it never gated anything. See docs/mcp.md.
 */

export type McpClientId =
  | "claudeCode"
  | "claudeDesktop"
  | "chatgpt"
  | "codex"
  | "cursor"
  | "other";

export interface McpConfigSnippet {
  /** i18n key under `mcp.clientSetup.snippet` for the caption. */
  labelKey: string;
  /** Where this content belongs, shown verbatim. Omit for shell commands. */
  filePath?: string;
  language: "json" | "toml" | "bash";
  code: string;
}

export interface McpClientRecipe {
  id: McpClientId;
  /** i18n key under `mcp.clientSetup.tabs`. */
  tabKey: string;
  /**
   * Set when the client cannot work with the stdio server at all. Renders a
   * blocked notice instead of a broken recipe.
   */
  requiresRemote?: boolean;
  snippets: McpConfigSnippet[];
}

/** Canonical install form. `uvx` fetches and runs without a clone to maintain. */
const COMMAND = "uvx";
const ARGS = ["aexy-mcp@latest"];

function stdioJson(apiUrl: string, indent = 0): string {
  const block = {
    mcpServers: {
      aexy: {
        command: COMMAND,
        args: ARGS,
        env: { AEXY_API_URL: apiUrl, AEXY_API_TOKEN: "<your-api-token>" },
      },
    },
  };
  const text = JSON.stringify(block, null, 2);
  return indent ? text.replace(/^/gm, " ".repeat(indent)) : text;
}

export function getClientRecipes(apiUrl: string): McpClientRecipe[] {
  return [
    {
      id: "claudeCode",
      tabKey: "claudeCode",
      snippets: [
        {
          labelKey: "cli",
          language: "bash",
          code: [
            "claude mcp add aexy \\",
            `  --env AEXY_API_URL=${apiUrl} \\`,
            "  --env AEXY_API_TOKEN=<your-api-token> \\",
            `  -- ${COMMAND} ${ARGS.join(" ")}`,
          ].join("\n"),
        },
        {
          labelKey: "projectFile",
          filePath: ".mcp.json",
          language: "json",
          code: stdioJson(apiUrl),
        },
      ],
    },
    {
      id: "claudeDesktop",
      tabKey: "claudeDesktop",
      snippets: [
        {
          labelKey: "macos",
          filePath: "~/Library/Application Support/Claude/claude_desktop_config.json",
          language: "json",
          code: stdioJson(apiUrl),
        },
        {
          labelKey: "windows",
          filePath: "%APPDATA%\\Claude\\claude_desktop_config.json",
          language: "json",
          code: stdioJson(apiUrl),
        },
      ],
    },
    {
      id: "chatgpt",
      tabKey: "chatgpt",
      requiresRemote: true,
      snippets: [],
    },
    {
      id: "codex",
      tabKey: "codex",
      snippets: [
        {
          labelKey: "configToml",
          filePath: "~/.codex/config.toml",
          language: "toml",
          code: [
            "[mcp_servers.aexy]",
            `command = "${COMMAND}"`,
            `args = [${ARGS.map((a) => `"${a}"`).join(", ")}]`,
            "",
            "[mcp_servers.aexy.env]",
            `AEXY_API_URL = "${apiUrl}"`,
            'AEXY_API_TOKEN = "<your-api-token>"',
          ].join("\n"),
        },
      ],
    },
    {
      id: "cursor",
      tabKey: "cursor",
      snippets: [
        {
          labelKey: "cursorFile",
          filePath: ".cursor/mcp.json",
          language: "json",
          code: stdioJson(apiUrl),
        },
        {
          labelKey: "vscodeFile",
          filePath: ".vscode/mcp.json",
          language: "json",
          code: `{\n  "servers": {\n    "aexy": {\n      "type": "stdio",\n      "command": "${COMMAND}",\n      "args": [${ARGS.map((a) => `"${a}"`).join(", ")}],\n      "env": {\n        "AEXY_API_URL": "${apiUrl}",\n        "AEXY_API_TOKEN": "<your-api-token>"\n      }\n    }\n  }\n}`,
        },
      ],
    },
    {
      id: "other",
      tabKey: "other",
      snippets: [
        {
          labelKey: "genericStdio",
          language: "json",
          code: stdioJson(apiUrl),
        },
      ],
    },
  ];
}

/** Environment variables the server reads. The only two that remain. */
export const MCP_ENV_VARS: { name: string; descriptionKey: string }[] = [
  { name: "AEXY_API_URL", descriptionKey: "apiUrl" },
  { name: "AEXY_API_TOKEN", descriptionKey: "apiToken" },
];
