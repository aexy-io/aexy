"use client";

import { useMemo, useState } from "react";
import {
  Plug,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Lock,
  Pencil,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";

import { CopyButton } from "@/components/ui/copy-button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { mcpApi } from "@/lib/api";
import {
  MCP_OPERATION_COUNT,
  MCP_TOOL_CATEGORIES,
  MCP_TOOL_MANIFEST,
  type McpToolCategory,
} from "@/config/mcpTools";
import {
  getClientRecipes,
  MCP_ENV_VARS,
  type McpClientId,
  type McpConfigSnippet,
} from "@/config/mcpClients";

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

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const PREVIEW_ACTIONS = 12;

/**
 * One capability: its tool, and the actions the tool's `action` enum accepts.
 * `granted` is undefined until the caller's own surface has loaded, then says
 * whether this capability is theirs in the current workspace.
 */
function ToolCategory({
  category,
  granted,
}: {
  category: McpToolCategory;
  granted: boolean | undefined;
}) {
  const t = useTranslations("mcp");
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const actions = showAll ? category.actions : category.actions.slice(0, PREVIEW_ACTIONS);
  return (
    <div className={`border rounded-lg ${granted === false ? "border-border/60 opacity-70" : "border-border"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/50 transition-colors rounded-lg"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm">{category.name}</span>
          <code className="text-[11px] font-mono text-muted-foreground truncate">
            {category.tool.name}
          </code>
          <span className="text-xs text-muted-foreground bg-accent px-1.5 py-0.5 rounded shrink-0">
            {t("availableTools.operations", { count: category.operation_count })}
          </span>
          {category.privileged && (
            <span className="text-[10px] uppercase tracking-wide text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0">
              {t("availableTools.privileged")}
            </span>
          )}
          {granted === true && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded shrink-0">
              <ShieldCheck className="h-3 w-3" />
              {t("availableTools.granted")}
            </span>
          )}
          {granted === false && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-accent px-1.5 py-0.5 rounded shrink-0">
              <Lock className="h-3 w-3" />
              {t("availableTools.notGranted")}
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1" data-testid={`tools-${category.key}`}>
          <p className="text-xs text-muted-foreground pb-1">{category.tool.description}</p>
          {actions.map((action) => (
            <div key={action.action} className="flex items-start gap-3 py-1 text-sm">
              <code className="text-[11px] bg-accent px-1.5 py-0.5 rounded font-mono text-muted-foreground shrink-0 w-14 text-center">
                {action.method}
              </code>
              <code className="text-xs font-mono text-foreground shrink-0">{action.action}</code>
              {action.mutating && (
                <span title={t("availableTools.writesTitle")} className="shrink-0 mt-0.5 text-amber-400">
                  <Pencil className="h-3 w-3" />
                </span>
              )}
              <span className="text-muted-foreground text-xs truncate">{action.summary}</span>
            </div>
          ))}
          {category.actions.length > PREVIEW_ACTIONS && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-purple-400 hover:underline pt-1"
            >
              {showAll
                ? t("availableTools.showFewer")
                : t("availableTools.showAll", { count: category.actions.length })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Snippet({ snippet }: { snippet: McpConfigSnippet }) {
  const t = useTranslations("mcp");
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-medium">
          {t(`clientSetup.snippet.${snippet.labelKey}`)}
        </span>
        {snippet.filePath && (
          <code className="text-xs bg-accent px-1.5 py-0.5 rounded font-mono text-muted-foreground">
            {snippet.filePath}
          </code>
        )}
      </div>
      <CodeBlock code={snippet.code} />
    </div>
  );
}

export default function McpPage() {
  const t = useTranslations("mcp");
  const [activeTab, setActiveTab] = useState<McpClientId>("claudeCode");
  const { currentWorkspaceId } = useWorkspace();

  // The caller's own surface. The manifest is the whole catalogue; this says
  // which of it they would actually be offered, resolved by the same access
  // model that governs the web app.
  const { data: mine } = useQuery({
    queryKey: ["mcp-tools", currentWorkspaceId],
    queryFn: () => mcpApi.tools(currentWorkspaceId!),
    enabled: Boolean(currentWorkspaceId),
  });
  const grantedSet = useMemo(
    () => (mine ? new Set(mine.granted_capabilities) : null),
    [mine]
  );

  const recipes = getClientRecipes(API_BASE);
  const active = recipes.find((r) => r.id === activeTab) ?? recipes[0];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Plug className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("overview.heading")}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("overview.descriptionBefore")}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:underline"
          >
            {t("overview.linkText")}
          </a>
          {t("overview.descriptionAfter")}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MCP_TOOL_CATEGORIES.map((cat) => {
            const granted = grantedSet ? grantedSet.has(cat.capability) : undefined;
            return (
              <div
                key={cat.key}
                className={`border rounded-lg px-3 py-2 ${
                  granted === false ? "border-border/60 bg-accent/20 opacity-60" : "border-border bg-accent/50"
                }`}
              >
                <div className="text-sm font-medium truncate">{cat.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t("overview.toolCount", { count: cat.operation_count })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("overview.summary", {
            total: MCP_OPERATION_COUNT,
            categories: MCP_TOOL_CATEGORIES.length,
          })}
        </p>
        {mine && (
          <p className="text-xs text-emerald-400" data-testid="mcp-yours">
            {t("availableTools.yours", {
              granted: mine.granted_capabilities.length,
              total: MCP_TOOL_CATEGORIES.length,
            })}
          </p>
        )}
      </section>

      {/* Quick Start */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("quickStart.heading")}</h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">
              1
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("quickStart.step1.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("quickStart.step1.description")}
              </p>
              <Link
                href="/settings/api-tokens"
                className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:underline"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {t("quickStart.step1.link")}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">
              2
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("quickStart.step2.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("quickStart.step2.description")}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">
              3
            </div>
            <div>
              <p className="text-sm font-medium">{t("quickStart.step3.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("quickStart.step3.description")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Client Setup Guides */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("clientSetup.heading")}</h2>
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              onClick={() => setActiveTab(recipe.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === recipe.id
                  ? "border-purple-400 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`clientSetup.tabs.${recipe.tabKey}`)}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t(`clientSetup.intro.${active.tabKey}`)}
          </p>

          {active.remoteUrl ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  {t("clientSetup.snippet.remoteUrl")}
                </span>
                <CodeBlock code={active.remoteUrl} />
              </div>
              <div className="bg-accent/50 border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("clientSetup.remoteAuth.body")}
                </p>
              </div>
            </div>
          ) : (
            active.snippets.map((snippet) => (
              <Snippet key={snippet.labelKey} snippet={snippet} />
            ))
          )}

          {!active.remoteUrl && (
            <div className="bg-accent/50 border border-border rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">
                  {t("clientSetup.envReferenceLabel")}
                </strong>
              </p>
              <div className="space-y-1 text-xs">
                {MCP_ENV_VARS.map((v) => (
                  <div key={v.name} className="flex gap-2">
                    <code className="font-mono text-foreground shrink-0">
                      {v.name}
                    </code>
                    <span className="text-muted-foreground">
                      {t(`clientSetup.env.${v.descriptionKey}`)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground pt-1">{t("clientSetup.bridgeNote")}</p>
            </div>
          )}
        </div>
      </section>

      {/* Available Tools */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">{t("availableTools.heading")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("availableTools.generatedNote", {
              version: MCP_TOOL_MANIFEST.catalog_version,
            })}
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("availableTools.alwaysHeading")}
          </h3>
          {MCP_TOOL_MANIFEST.generic_tools.map((tool) => (
            <div key={tool.name} className="flex items-start gap-3 text-sm border border-border rounded-lg px-4 py-2.5">
              <code className="text-xs bg-accent px-1.5 py-0.5 rounded font-mono shrink-0">{tool.name}</code>
              <span className="text-muted-foreground text-xs">{tool.description}</span>
            </div>
          ))}
        </div>

        {MCP_TOOL_MANIFEST.workflow_tools.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("availableTools.routinesHeading")}
            </h3>
            {MCP_TOOL_MANIFEST.workflow_tools.map((tool) => (
              <div key={tool.name} className="flex items-start gap-3 text-sm border border-border rounded-lg px-4 py-2.5">
                <code className="text-xs bg-accent px-1.5 py-0.5 rounded font-mono shrink-0">{tool.name}</code>
                <span className="text-muted-foreground text-xs">{tool.description.split("\n")[0]}</span>
                {tool.capability && (
                  <code className="ml-auto text-[10px] font-mono text-muted-foreground shrink-0">{tool.capability}</code>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {MCP_TOOL_CATEGORIES.map((cat) => (
            <ToolCategory
              key={cat.key}
              category={cat}
              granted={grantedSet ? grantedSet.has(cat.capability) : undefined}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
