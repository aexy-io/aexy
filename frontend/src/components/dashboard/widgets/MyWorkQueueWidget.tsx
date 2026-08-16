"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Bug as BugIcon,
  CheckSquare,
  ChevronRight,
  ListTodo,
  Ticket,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/EmptyState";
import { useMyWorkItems, type WorkItem } from "@/hooks/useMyWorkItems";
import { useMyWorkStore, type WorkSource } from "@/stores/myWorkStore";
import {
  TICKET_PRIORITY_COLORS,
  TICKET_STATUS_COLORS,
  TASK_STATUS_COLORS,
} from "@/lib/statusColors";

/**
 * Icon per tracker. Bugs and stories live in their own tables but land on the
 * same person, so they belong in the same list — distinguished by a glyph rather
 * than by being on a different page, which is what used to hide them.
 */
const ITEM_TYPE_ICONS: Record<WorkItem["itemType"], { icon: LucideIcon; color: string }> = {
  task: { icon: CheckSquare, color: "text-blue-400" },
  bug: { icon: BugIcon, color: "text-red-400" },
  story: { icon: BookOpen, color: "text-purple-400" },
  ticket: { icon: Ticket, color: "text-cyan-400" },
};

const TYPE_BADGE: Record<WorkItem["itemType"], string> = {
  task: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  bug: "bg-red-500/10 text-red-600 dark:text-red-300",
  story: "bg-purple-500/10 text-purple-600 dark:text-purple-300",
  ticket: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300",
};

function statusStyle(item: WorkItem): { bg: string; text: string } {
  const styles =
    item.kind === "ticket"
      ? (TICKET_STATUS_COLORS as Record<string, { bg: string; text: string }>)
      : (TASK_STATUS_COLORS as Record<string, { bg: string; text: string }>);
  return styles[item.status] ?? { bg: "bg-accent", text: "text-foreground" };
}

function formatRelative(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const date = new Date(dateStr);
  const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (hours < 1) return t("justNow");
  if (hours < 24) return t("hoursAgo", { count: hours });
  if (days < 7) return t("daysAgo", { count: days });
  return date.toLocaleDateString();
}

/**
 * The unified work queue — tasks, bugs, stories and form tickets in one list.
 *
 * Every row is a link rather than a click handler, so the whole row is a target
 * and cmd-click opens it in a new tab. Rows previously resolved to nothing at
 * all unless a task happened to know both its sprint and its project, which made
 * most of the list look interactive and do nothing.
 */
export function MyWorkQueueWidget() {
  const t = useTranslations("myWork");
  const { items, isLoading, canSeeTickets, showWorkspaceFilter, scope } = useMyWorkItems();
  const {
    source,
    setSource,
    search,
    setSearch,
    includeDone,
    setIncludeDone,
    onlyMine,
    setOnlyMine,
    statusBucket,
  } = useMyWorkStore();

  const sources: { id: WorkSource; label: string }[] = [
    { id: "all", label: t("sources.all") },
    { id: "tasks", label: t("sources.tasks") },
    ...(canSeeTickets ? [{ id: "tickets" as const, label: t("sources.tickets") }] : []),
  ];

  // Only worth naming the workspace on a row when the list can span more than
  // one; inside a single workspace it would be the same word on every line.
  const showWorkspaceBadge = showWorkspaceFilter && scope === "all";

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden" data-testid="my-work-queue">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <div className="p-1.5 bg-purple-500/10 rounded-lg">
            <ListTodo className="h-4 w-4 text-purple-400" />
          </div>
          <h3 className="font-semibold text-foreground">{t("queueTitle")}</h3>
          <span className="px-1.5 py-0.5 rounded text-xs bg-accent text-muted-foreground tabular-nums">
            {items.length}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {sources.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSource(option.id)}
              aria-pressed={source === option.id}
              data-testid={`work-source-${option.id}`}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                source === option.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("searchWork")}
          wrapperClassName="w-full sm:w-56"
        />

        {/* The workspace-wide ticket queue the old Form Tickets tab was. Tasks
            are always yours, so this only makes sense while tickets show. */}
        {canSeeTickets && source !== "tasks" && (
          <button
            type="button"
            onClick={() => setOnlyMine(!onlyMine)}
            aria-pressed={onlyMine}
            title={t("onlyMineHint")}
            data-testid="my-work-only-mine"
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              onlyMine
                ? "bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-300"
                : "bg-muted border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {onlyMine ? t("assignedToMe") : t("everyonesTickets")}
          </button>
        )}

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={includeDone}
            onChange={(e) => setIncludeDone(e.target.checked)}
            data-testid="my-work-include-done"
            className="rounded border-border text-primary-500 focus:ring-primary-500"
          />
          {t("showCompleted")}
        </label>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3 animate-pulse" data-testid="my-work-queue-loading">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <div className="h-4 w-4 bg-muted rounded" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-56 bg-muted rounded" />
                <div className="h-3 w-32 bg-muted rounded" />
              </div>
              <div className="h-5 w-16 bg-muted rounded-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={statusBucket === "all" ? t("empty") : t("emptyFiltered")}
          description={
            statusBucket === "all" ? t("emptyDescription") : t("emptyFilteredDescription")
          }
          compact
        />
      ) : (
        <div className="divide-y divide-border max-h-[560px] overflow-y-auto">
          {items.map((item) => {
            const meta = ITEM_TYPE_ICONS[item.itemType] ?? ITEM_TYPE_ICONS.task;
            const Icon = meta.icon;
            const style = statusStyle(item);
            return (
              <Link
                key={`${item.kind}-${item.id}`}
                href={item.href}
                data-testid={`work-item-${item.itemType}`}
                className="flex items-center gap-3 p-3 hover:bg-accent/40 transition group"
              >
                <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${TYPE_BADGE[item.itemType]}`}>
                      {t(`types.${item.itemType}`)}
                    </span>
                    {item.reference && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {item.reference}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${style.bg} ${style.text}`}>
                      {item.status.replace(/_/g, " ")}
                    </span>
                    {item.priority && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          TICKET_PRIORITY_COLORS[
                            item.priority as keyof typeof TICKET_PRIORITY_COLORS
                          ]?.bg ?? "bg-accent"
                        } ${
                          TICKET_PRIORITY_COLORS[
                            item.priority as keyof typeof TICKET_PRIORITY_COLORS
                          ]?.text ?? "text-foreground"
                        }`}
                      >
                        {item.priority}
                      </span>
                    )}
                    {item.storyPoints ? (
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-accent text-foreground">
                        {t("points", { count: item.storyPoints })}
                      </span>
                    ) : null}
                    {item.slaBreached && (
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-500 dark:text-red-300">
                        {t("stats.slaBreached")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {showWorkspaceBadge && item.workspaceName ? `${item.workspaceName} • ` : ""}
                    {item.subtitle ? `${item.subtitle} • ` : ""}
                    {formatRelative(item.createdAt, t)}
                  </p>
                </div>
                {item.assigneeName && (
                  <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <User className="h-3.5 w-3.5" />
                    {item.assigneeName}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
