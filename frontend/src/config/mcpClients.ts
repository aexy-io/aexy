/**
 * Setup recipes for every MCP client we support.
 *
 * There is one server: the backend's `POST /api/v1/mcp`. Every recipe reaches
 * it, by one of two routes.
 *
 *  - **Remote (HTTP).** Clients that speak streamable HTTP connect to the URL
 *    directly and authenticate through OAuth 2.1 — a consent screen, no token
 *    to paste. ChatGPT can only do this; Claude Code and Claude Desktop can do
 *    it and should, because it is one line and nothing to install.
 *  - **Local (stdio).** Clients that only launch processes run `aexy-mcp`, a
 *    thin bridge: it forwards JSON-RPC from stdin to the same endpoint with a
 *    personal API token, and writes the answers back. It holds no tools of its
 *    own, so it cannot drift from the server and cannot skip governance — the
 *    previous stdio server did both.
 *
 * `AEXY_WORKSPACE_ID` is needed only when the token's owner belongs to more
 * than one workspace; a person in one workspace can leave it out.
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
   * Set for clients that speak ONLY the remote HTTP transport. These get a URL
   * to paste and authenticate through OAuth — so they never see an API token,
   * and the environment-variable reference does not apply.
   */
  remoteUrl?: string;
  snippets: McpConfigSnippet[];
}

/** Canonical install form. `uvx` fetches and runs without a clone to maintain. */
const COMMAND = "uvx";
const ARGS = ["aexy-mcp@latest"];

function env(apiUrl: string): Record<string, string> {
  return {
    AEXY_API_URL: apiUrl,
    AEXY_API_TOKEN: "<your-api-token>",
    AEXY_WORKSPACE_ID: "<workspace-id, if you are in more than one>",
  };
}

function stdioJson(apiUrl: string): string {
  return JSON.stringify(
    { mcpServers: { aexy: { command: COMMAND, args: ARGS, env: env(apiUrl) } } },
    null,
    2
  );
}

export function mcpEndpoint(apiUrl: string): string {
  return `${apiUrl.replace(/\/$/, "")}/mcp`;
}

export function getClientRecipes(apiUrl: string): McpClientRecipe[] {
  const remote = mcpEndpoint(apiUrl);
  return [
    {
      id: "claudeCode",
      tabKey: "claudeCode",
      snippets: [
        {
          labelKey: "remoteCli",
          language: "bash",
          code: `claude mcp add --transport http aexy ${remote}`,
        },
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
          labelKey: "remoteConnector",
          language: "bash",
          code: remote,
        },
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
      remoteUrl: remote,
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
            'AEXY_WORKSPACE_ID = "<workspace-id, if you are in more than one>"',
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
          code: JSON.stringify(
            {
              servers: {
                aexy: { type: "stdio", command: COMMAND, args: ARGS, env: env(apiUrl) },
              },
            },
            null,
            2
          ),
        },
      ],
    },
    {
      id: "other",
      tabKey: "other",
      snippets: [
        {
          labelKey: "remoteConnector",
          language: "bash",
          code: remote,
        },
        {
          labelKey: "genericStdio",
          language: "json",
          code: stdioJson(apiUrl),
        },
      ],
    },
  ];
}

/** Environment variables the bridge reads. */
export const MCP_ENV_VARS: { name: string; descriptionKey: string }[] = [
  { name: "AEXY_API_URL", descriptionKey: "apiUrl" },
  { name: "AEXY_API_TOKEN", descriptionKey: "apiToken" },
  { name: "AEXY_WORKSPACE_ID", descriptionKey: "workspaceId" },
];
