"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Bot,
  ChevronRight,
  Pause,
  Play,
  Plus,
  Search,
  Workflow,
  Zap,
} from "lucide-react";

import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgents } from "@/hooks/useAgents";
import { useAutomations } from "@/hooks/useAutomations";
import {
  Automation,
  AutomationModule,
  AgentType,
  CRMAgent,
  getAgentTypeConfig,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/datetime";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  moduleColors,
  moduleIcons,
  moduleLabels,
} from "@/lib/automationTemplates";
import { Breadcrumb } from "@/components/ui/breadcrumb";

// ---------------------------------------------------------------------------
// Normalized row shape. Both CRMAgent and Automation map onto this so the
// list can sort / filter / render them uniformly without leaking either
// shape into JSX.
// ---------------------------------------------------------------------------

type OperationKind = "agent" | "automation";

interface OperationRow {
  kind: OperationKind;
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  totalRuns: number;
  lastActivityAt: string | null;
  createdAt: string;
  href: string;
  agentType?: AgentType;
  module?: AutomationModule;
}

function fromAgent(agent: CRMAgent): OperationRow {
  return {
    kind: "agent",
    id: agent.id,
    name: agent.name,
    description: agent.description ?? null,
    isActive: agent.is_active,
    totalRuns: agent.total_executions ?? 0,
    lastActivityAt: agent.last_active_at,
    createdAt: agent.created_at,
    href: `/agents/${agent.id}`,
    agentType: agent.agent_type,
  };
}

function fromAutomation(automation: Automation): OperationRow {
  return {
    kind: "automation",
    id: automation.id,
    name: automation.name,
    description: automation.description ?? null,
    isActive: automation.is_active,
    totalRuns: automation.total_runs ?? 0,
    lastActivityAt: automation.last_run_at,
    createdAt: automation.created_at,
    href: `/automations/${automation.id}`,
    module: automation.module,
  };
}

// formatRelative moved to lib/datetime.ts (UX-CPY-001) so the same
// "5m ago" / "3h ago" semantics flow through agents + automations +
// inbox instead of each surface re-implementing slightly different
// thresholds.

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type TypeFilter = "all" | "agent" | "automation";
type StatusFilter = "all" | "active" | "paused";

export default function OperationsPage() {
  const t = useTranslations("operations");
  const { currentWorkspaceId } = useWorkspace();

  const { agents, isLoading: agentsLoading } = useAgents(currentWorkspaceId);
  const { automations, isLoading: automationsLoading } = useAutomations(
    currentWorkspaceId,
  );

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showPicker, setShowPicker] = useState(false);

  const rows = useMemo<OperationRow[]>(() => {
    const merged: OperationRow[] = [
      ...agents.map(fromAgent),
      ...automations.map(fromAutomation),
    ];
    // Most recently active first; falls back to created_at when an item
    // has never run so brand-new entries don't sink to the bottom.
    merged.sort((a, b) => {
      const aKey = a.lastActivityAt ?? a.createdAt;
      const bKey = b.lastActivityAt ?? b.createdAt;
      return new Date(bKey).getTime() - new Date(aKey).getTime();
    });
    return merged;
  }, [agents, automations]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter !== "all" && row.kind !== typeFilter) return false;
      if (statusFilter === "active" && !row.isActive) return false;
      if (statusFilter === "paused" && row.isActive) return false;
      if (!term) return true;
      return (
        row.name.toLowerCase().includes(term) ||
        (row.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, typeFilter, statusFilter, search]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.isActive).length;
    const executions = rows.reduce((sum, r) => sum + r.totalRuns, 0);
    return { total: rows.length, active, executions };
  }, [rows]);

  const isLoading = agentsLoading || automationsLoading;

  return (
    <div>
      <header className="border-b border-border bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <Breadcrumb items={[{ label: t("title") }]} className="mb-3" />
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                {t("subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 transition text-sm font-medium shrink-0"
            >
              <Plus className="h-4 w-4" />
              {t("create")}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label={t("stats.total")} value={totals.total} />
          <StatCard
            label={t("stats.active")}
            value={totals.active}
            valueClass="text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            label={t("stats.executions")}
            value={totals.executions}
          />
        </div>

        {/* Filter row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("filter.searchPlaceholder")}
            wrapperClassName="flex-1"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
              label={t("filter.all")}
            />
            <FilterPill
              active={typeFilter === "agent"}
              onClick={() => setTypeFilter("agent")}
              label={t("filter.agents")}
              icon={<Bot className="h-3.5 w-3.5" />}
              tone="purple"
            />
            <FilterPill
              active={typeFilter === "automation"}
              onClick={() => setTypeFilter("automation")}
              label={t("filter.automations")}
              icon={<Zap className="h-3.5 w-3.5" />}
              tone="blue"
            />
            <span className="hidden sm:block h-5 w-px bg-border mx-1" />
            <FilterPill
              active={statusFilter === "active"}
              onClick={() =>
                setStatusFilter(statusFilter === "active" ? "all" : "active")
              }
              label={t("filter.active")}
              icon={<Play className="h-3.5 w-3.5" />}
            />
            <FilterPill
              active={statusFilter === "paused"}
              onClick={() =>
                setStatusFilter(statusFilter === "paused" ? "all" : "paused")
              }
              label={t("filter.paused")}
              icon={<Pause className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-20 bg-muted/40 border border-border rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 && rows.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title={t("empty.title")}
            description={t("empty.description")}
            actions={[
              { label: t("empty.primaryAction"), href: "/automations/new" },
              { label: t("empty.secondaryAction"), href: "/agents/new" },
            ]}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={t("filteredEmpty.title")}
            description={t("filteredEmpty.description")}
            compact
          />
        ) : (
          <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-card">
            {filtered.map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                <OperationListRow row={row} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreatePicker
        open={showPicker}
        onOpenChange={setShowPicker}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="bg-muted/40 border border-border rounded-xl p-4">
      <div className={cn("text-2xl font-semibold tabular-nums text-foreground", valueClass)}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  icon,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  tone?: "purple" | "blue";
}) {
  const toneClasses = active
    ? tone === "purple"
      ? "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30"
      : tone === "blue"
        ? "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30"
        : "bg-accent text-foreground border-border"
    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border",
        toneClasses,
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function OperationListRow({ row }: { row: OperationRow }) {
  const t = useTranslations("operations");
  const isAgent = row.kind === "agent";

  // Per-kind glyph + tone. Agents get the type-aware halo color when an
  // agent_type is present so e.g. Sales agents read visually distinct from
  // Support agents even in the unified list. Automations carry the module
  // accent.
  const typeConfig = isAgent ? getAgentTypeConfig(row.agentType ?? "custom") : null;
  const ModuleIcon = !isAgent && row.module ? moduleIcons[row.module] : null;
  const moduleTone = !isAgent && row.module ? moduleColors[row.module] : "";

  return (
    <Link
      href={row.href}
      className="flex items-center gap-3 sm:gap-4 px-4 py-3 hover:bg-accent/40 transition-colors group"
    >
      {/* Icon */}
      <div
        className={cn(
          "shrink-0 h-10 w-10 rounded-xl flex items-center justify-center",
          isAgent ? "" : moduleTone,
        )}
        style={
          isAgent && typeConfig
            ? {
                backgroundColor: `${typeConfig.color}20`,
                color: typeConfig.color,
              }
            : undefined
        }
      >
        {isAgent ? (
          <Bot className="h-5 w-5" />
        ) : ModuleIcon ? (
          <ModuleIcon className="h-5 w-5" />
        ) : (
          <Zap className="h-5 w-5" />
        )}
      </div>

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* UX-MOB-002: compact status dot lives in the title row on
              mobile only — the full pill on the right is hidden on
              <sm so phone users had no way to tell active/paused apart.
              The dot doubles as the title for screen readers via
              aria-label so it doesn't need the visible pill copy. */}
          <span
            aria-label={row.isActive ? t("filter.active") : t("filter.paused")}
            title={row.isActive ? t("filter.active") : t("filter.paused")}
            className={cn(
              "h-2 w-2 rounded-full shrink-0 sm:hidden",
              row.isActive ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          <span className="text-sm font-semibold text-foreground truncate">
            {row.name}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border",
              isAgent
                ? "border-purple-500/30 text-purple-600 dark:text-purple-300 bg-purple-500/10"
                : "border-blue-500/30 text-blue-600 dark:text-blue-300 bg-blue-500/10",
            )}
          >
            {isAgent ? (
              <Bot className="h-3 w-3" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            {isAgent ? t("type.agent") : t("type.automation")}
          </span>
          {!isAgent && row.module ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full",
                moduleTone,
              )}
            >
              {moduleLabels[row.module]}
            </span>
          ) : null}
          {isAgent && row.agentType ? (
            <span className="text-[11px] text-muted-foreground">
              {getAgentTypeConfig(row.agentType).label}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {row.description || t("row.noDescription")}
        </div>
      </div>

      {/* Status + runs */}
      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-right">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full",
            row.isActive
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              row.isActive ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          {row.isActive ? t("filter.active") : t("filter.paused")}
        </span>
        <span className="text-xs text-muted-foreground">
          {row.totalRuns > 0
            ? row.lastActivityAt
              ? `${t("row.executions", { count: row.totalRuns })} - ${formatRelative(row.lastActivityAt)}`
              : t("row.executions", { count: row.totalRuns })
            : t("row.neverRun")}
        </span>
      </div>

      <ChevronRight
        aria-hidden
        className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0"
      />
    </Link>
  );
}

function CreatePicker({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("operations");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("picker.title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/agents/new"
            onClick={() => onOpenChange(false)}
            className="group rounded-xl border border-border p-5 hover:border-purple-500/40 hover:bg-purple-500/5 transition-colors flex flex-col gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-300 flex items-center justify-center">
                <Bot className="h-5 w-5" />
              </div>
              <span className="text-base font-semibold text-foreground">
                {t("picker.agent.name")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground flex-1">
              {t("picker.agent.description")}
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
              {t("createAgent")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link
            href="/automations/new"
            onClick={() => onOpenChange(false)}
            className="group rounded-xl border border-border p-5 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors flex flex-col gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                <Zap className="h-5 w-5" />
              </div>
              <span className="text-base font-semibold text-foreground">
                {t("picker.automation.name")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground flex-1">
              {t("picker.automation.description")}
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
              {t("createAutomation")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
