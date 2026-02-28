"use client";

import { useState } from "react";
import {
  Plug,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Terminal,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/ui/copy-button";

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
      <pre className="bg-zinc-900 border border-border rounded-lg p-4 overflow-x-auto text-sm">
        <code className="text-zinc-300">{code}</code>
      </pre>
    </div>
  );
}

const TOOL_CATEGORIES = [
  {
    name: "Sprint Management",
    tools: [
      { name: "aexy_sprints", desc: "List, create, start, and complete sprints" },
      { name: "aexy_sprint_tasks", desc: "Manage sprint tasks — create, update status, assign, comment" },
      { name: "aexy_sprint_analytics", desc: "Velocity, burndown, and sprint metrics" },
      { name: "aexy_projects", desc: "List and manage projects" },
      { name: "aexy_epics", desc: "Create and manage epics" },
      { name: "aexy_bugs", desc: "Track and manage bugs" },
    ],
  },
  {
    name: "CRM",
    tools: [
      { name: "aexy_crm_objects", desc: "Manage CRM object schemas (contacts, deals, etc.)" },
      { name: "aexy_crm_records", desc: "CRUD operations on CRM records" },
      { name: "aexy_crm_automations", desc: "Create and manage CRM automations" },
    ],
  },
  {
    name: "AI Agents",
    tools: [
      { name: "aexy_agents", desc: "List, create, run, and manage AI agents" },
      { name: "aexy_agent_policies", desc: "Configure agent safety policies" },
      { name: "aexy_workflows", desc: "Visual workflow builder operations" },
    ],
  },
  {
    name: "Email & GTM",
    tools: [
      { name: "aexy_email_campaigns", desc: "Create and send email campaigns" },
      { name: "aexy_email_infrastructure", desc: "Manage sending domains and providers" },
      { name: "aexy_gtm_leads", desc: "Lead scoring and visitor tracking" },
      { name: "aexy_gtm_sequences", desc: "Outreach sequence management" },
    ],
  },
  {
    name: "Analytics & Insights",
    tools: [
      { name: "aexy_analytics", desc: "Developer and team analytics" },
      { name: "aexy_developer_insights", desc: "Individual developer metrics" },
      { name: "aexy_compliance", desc: "Compliance and training tracking" },
      { name: "aexy_assessments", desc: "Technical assessment management" },
    ],
  },
  {
    name: "Platform",
    tools: [
      { name: "aexy_workspaces", desc: "Workspace and team management" },
      { name: "aexy_notifications", desc: "Read and manage notifications" },
      { name: "aexy_documents", desc: "Document management" },
      { name: "aexy_tickets", desc: "Ticket and support management" },
      { name: "aexy_tables", desc: "Standalone table operations" },
      { name: "aexy_integrations", desc: "External integrations (Slack, Jira, Linear)" },
      { name: "aexy_api", desc: "Generic API gateway for any endpoint" },
    ],
  },
  {
    name: "Temporal (Infrastructure)",
    tools: [
      { name: "temporal_list_workflows", desc: "List running and completed workflows" },
      { name: "temporal_describe_workflow", desc: "Get workflow execution details" },
      { name: "temporal_get_workflow_history", desc: "View workflow event history" },
      { name: "temporal_query_workflow", desc: "Query workflow state" },
      { name: "temporal_signal_workflow", desc: "Send signals to running workflows" },
      { name: "temporal_cancel_workflow", desc: "Cancel a running workflow" },
      { name: "temporal_list_schedules", desc: "List scheduled workflows" },
      { name: "temporal_system_status", desc: "Temporal cluster health check" },
    ],
  },
];

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getClaudeConfig(apiUrl: string) {
  return `{
  "mcpServers": {
    "aexy": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/aexy/mcp-server", "aexy-mcp"],
      "env": {
        "AEXY_API_URL": "${apiUrl}",
        "AEXY_API_TOKEN": "<your-api-token>",
        "AEXY_ENABLE_TEMPORAL": "true"
      }
    }
  }
}`;
}

function getGenericConfig(apiUrl: string) {
  return `# Environment variables for the MCP server
export AEXY_API_URL="${apiUrl}"
export AEXY_API_TOKEN="<your-api-token>"
export AEXY_ENABLE_TEMPORAL="true"
export TEMPORAL_ADDRESS="localhost:7233"
export TEMPORAL_NAMESPACE="default"

# Run the MCP server via stdio
uv run --directory /path/to/aexy/mcp-server aexy-mcp`;
}

type ClientTab = "claude" | "codex" | "other";

function ToolCategory({
  name,
  tools,
}: {
  name: string;
  tools: { name: string; desc: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{name}</span>
          <span className="text-xs text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
            {tools.length}
          </span>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className="flex items-start gap-3 py-1.5 text-sm"
            >
              <code className="text-xs bg-accent px-1.5 py-0.5 rounded font-mono text-foreground shrink-0">
                {tool.name}
              </code>
              <span className="text-muted-foreground">{tool.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function McpPage() {
  const [activeTab, setActiveTab] = useState<ClientTab>("claude");

  const totalTools = TOOL_CATEGORIES.reduce(
    (sum, cat) => sum + cat.tools.length,
    0
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Plug className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Model Context Protocol</h1>
            <p className="text-muted-foreground text-sm">
              Connect AI coding assistants to Aexy
            </p>
          </div>
        </div>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The{" "}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:underline"
          >
            Model Context Protocol (MCP)
          </a>{" "}
          lets AI assistants like Claude Code and OpenAI Codex interact directly
          with your Aexy workspace — managing sprints, querying analytics,
          running agents, and more through natural language.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TOOL_CATEGORIES.map((cat) => (
            <div
              key={cat.name}
              className="bg-accent/50 border border-border rounded-lg px-3 py-2"
            >
              <div className="text-sm font-medium">{cat.name}</div>
              <div className="text-xs text-muted-foreground">
                {cat.tools.length} tools
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {totalTools} tools available across {TOOL_CATEGORIES.length} categories
        </p>
      </section>

      {/* Quick Start */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Quick Start</h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">
              1
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Create an API token</p>
              <p className="text-sm text-muted-foreground">
                Generate a token to authenticate the MCP server with your Aexy
                account.
              </p>
              <Link
                href="/settings/api-tokens"
                className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:underline"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Settings &rarr; API Tokens
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">
              2
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Install the MCP server</p>
              <CodeBlock code="git clone https://github.com/aexy-io/mcp-server.git && cd mcp-server && uv sync" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">
              3
            </div>
            <div>
              <p className="text-sm font-medium">Configure your AI client</p>
              <p className="text-sm text-muted-foreground">
                See the setup guides below for your specific client.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Client Setup Guides */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Client Setup</h2>
        <div className="flex gap-1 border-b border-border">
          {(
            [
              { id: "claude" as const, label: "Claude Code" },
              { id: "codex" as const, label: "OpenAI Codex" },
              { id: "other" as const, label: "Other Clients" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-purple-400 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {activeTab === "claude" && (
            <>
              <p className="text-sm text-muted-foreground">
                Add this to your{" "}
                <code className="text-xs bg-accent px-1 py-0.5 rounded">
                  .claude/settings.local.json
                </code>{" "}
                or global Claude Code settings:
              </p>
              <CodeBlock code={getClaudeConfig(API_BASE)} />
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Note:</strong> Set{" "}
                  <code className="bg-accent px-1 py-0.5 rounded">
                    AEXY_ENABLE_TEMPORAL
                  </code>{" "}
                  to{" "}
                  <code className="bg-accent px-1 py-0.5 rounded">false</code>{" "}
                  if you don&apos;t need Temporal debugging tools, or if the Temporal
                  server is not accessible from your machine.
                </p>
              </div>
            </>
          )}

          {activeTab === "codex" && (
            <>
              <p className="text-sm text-muted-foreground">
                Configure Codex to use the Aexy MCP server by providing the
                connection details:
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Server command
                  </span>
                </div>
                <CodeBlock code={`uv run --directory /path/to/aexy/mcp-server aexy-mcp`} />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  Required environment variables
                </span>
                <div className="bg-accent/50 border border-border rounded-lg divide-y divide-border text-sm">
                  {[
                    ["AEXY_API_URL", API_BASE, "Aexy backend API URL"],
                    ["AEXY_API_TOKEN", "<your-token>", "API token from Settings"],
                    ["AEXY_ENABLE_TEMPORAL", "true", "Enable Temporal tools"],
                  ].map(([name, value, desc]) => (
                    <div key={name} className="flex items-center px-3 py-2 gap-4">
                      <code className="font-mono text-xs text-foreground w-48 shrink-0">
                        {name}
                      </code>
                      <code className="font-mono text-xs text-muted-foreground flex-1">
                        {value}
                      </code>
                      <span className="text-xs text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "other" && (
            <>
              <p className="text-sm text-muted-foreground">
                For any MCP-compatible client, use the stdio transport with
                these environment variables:
              </p>
              <CodeBlock code={getGenericConfig(API_BASE)} />
              <div className="bg-accent/50 border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Environment variables reference:</strong>
                </p>
                <div className="mt-2 space-y-1 text-xs">
                  {[
                    ["AEXY_API_URL", "Backend API base URL"],
                    ["AEXY_API_TOKEN", "Authentication token (create in Settings > API Tokens)"],
                    ["AEXY_ENABLE_TEMPORAL", "Enable/disable Temporal tools (true/false)"],
                    ["TEMPORAL_ADDRESS", "Temporal server address (default: localhost:7233)"],
                    ["TEMPORAL_NAMESPACE", "Temporal namespace (default: default)"],
                  ].map(([name, desc]) => (
                    <div key={name} className="flex gap-2">
                      <code className="font-mono text-foreground shrink-0">{name}</code>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Available Tools */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Available Tools</h2>
        <div className="space-y-2">
          {TOOL_CATEGORIES.map((cat) => (
            <ToolCategory key={cat.name} name={cat.name} tools={cat.tools} />
          ))}
        </div>
      </section>
    </div>
  );
}
