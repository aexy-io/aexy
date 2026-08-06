"use client";

import { ReactNode, useMemo } from "react";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";

import { SprintTask, TaskPriority, TaskStatus, TaskStatusConfig } from "@/lib/api";
import { effectiveAssignees } from "@/components/planning/TaskAssigneeStack";
import { PRIORITY_COLORS } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

export type TaskTableRow = SprintTask & { sprint_name?: string; team_name?: string };

interface TaskTableViewProps {
  tasks: TaskTableRow[];
  /** Project-scoped status set; used to render the status chip with the right
      color and label, and falls back to a neutral chip when the row's slug
      isn't represented (e.g. a task whose status was deleted upstream). */
  statuses: TaskStatusConfig[];
  onRowClick: (task: SprintTask) => void;
  selectedIds?: Set<string>;
  onToggleSelected?: (taskId: string) => void;
  showSprintColumn?: boolean;
  /** Localized empty-state copy. Caller controls so it can branch on
      whether filters are active. */
  emptyLabel?: string;
  /** Optional per-row trailing cell — used by the archive view to inject an
      Unarchive button without coupling the table to archive semantics. */
  rowActions?: (task: TaskTableRow) => ReactNode;
}

/**
 * Dense table view of tasks, shared by the project board and workspace
 * All-Tasks tab. Mirrors the kanban's bulk-select + status chip semantics so
 * toggling between views is non-destructive.
 */
export function TaskTableView({
  tasks,
  statuses,
  onRowClick,
  selectedIds,
  onToggleSelected,
  showSprintColumn = true,
  emptyLabel,
  rowActions,
}: TaskTableViewProps) {
  const t = useTranslations("sprints.taskTable");
  const statusBySlug = useMemo(() => {
    const map = new Map<string, TaskStatusConfig>();
    for (const s of statuses) map.set(s.slug, s);
    return map;
  }, [statuses]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {emptyLabel ?? t("empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/40">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 backdrop-blur sticky top-0 z-10">
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {onToggleSelected && (
              <th className="w-8 px-3 py-2"></th>
            )}
            <th className="px-3 py-2 font-medium w-28">{t("key")}</th>
            <th className="px-3 py-2 font-medium">{t("title")}</th>
            <th className="px-3 py-2 font-medium w-36">{t("status")}</th>
            <th className="px-3 py-2 font-medium w-24">{t("priority")}</th>
            <th className="px-3 py-2 font-medium w-40">{t("assignee")}</th>
            {showSprintColumn && (
              <th className="px-3 py-2 font-medium w-36">{t("sprint")}</th>
            )}
            <th className="px-3 py-2 font-medium w-16 text-right">{t("points")}</th>
            <th className="px-3 py-2 font-medium w-32">{t("updated")}</th>
            {rowActions && <th className="px-3 py-2 font-medium w-24 text-right"></th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const status = statusBySlug.get(task.status as string);
            const priority = PRIORITY_COLORS[task.priority];
            const isSelected = selectedIds?.has(task.id);
            return (
              <tr
                key={task.id}
                onClick={() => onRowClick(task)}
                className={cn(
                  "border-t border-border/40 transition-colors cursor-pointer",
                  isSelected
                    ? "bg-primary-500/10 hover:bg-primary-500/15"
                    : "hover:bg-muted/40",
                )}
              >
                {onToggleSelected && (
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() => onToggleSelected(task.id)}
                      className="h-3.5 w-3.5 rounded border-border bg-background text-primary-500 focus:ring-primary-500/40"
                      aria-label={`Select ${task.title}`}
                    />
                  </td>
                )}
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground tabular-nums">
                  {task.source_id || task.id.slice(0, 8)}
                </td>
                <td className="px-3 py-2 text-foreground">
                  <span className="line-clamp-1">{task.title}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: status?.color ?? "var(--muted-foreground)",
                      }}
                    />
                    <span className="text-foreground text-xs">
                      {status?.name ?? task.status}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] uppercase tracking-wide",
                      priority?.bg,
                      priority?.text,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", priority?.dot)} />
                    {task.priority}
                  </span>
                </td>
                <td className="px-3 py-2 text-foreground/90">
                  {/* All assignees, not just the primary — a task with several
                      people and no designated owner would otherwise show "—". */}
                  {(() => {
                    const people = effectiveAssignees(task);
                    if (people.length === 0) {
                      return <span className="text-muted-foreground">—</span>;
                    }
                    const lead = people[0];
                    const others = people.length - 1;
                    return (
                      <span
                        className="inline-flex items-center gap-2"
                        title={people.map((p) => p.name ?? "Unknown").join(", ")}
                      >
                        {lead.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={lead.avatar_url}
                            alt={lead.name ?? "Assignee"}
                            className="h-5 w-5 rounded-full object-cover ring-1 ring-border/60"
                          />
                        ) : (
                          <span className="h-5 w-5 rounded-full bg-muted text-[10px] text-muted-foreground inline-flex items-center justify-center">
                            {(lead.name ?? "?").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate">{lead.name ?? "Assigned"}</span>
                        {others > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            +{others}
                          </span>
                        )}
                      </span>
                    );
                  })()}
                </td>
                {showSprintColumn && (
                  <td className="px-3 py-2 text-muted-foreground truncate">
                    {task.sprint_name ?? "—"}
                  </td>
                )}
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {task.story_points ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {task.last_synced_at || (task as { updated_at?: string }).updated_at
                    ? formatDistanceToNow(
                        new Date(
                          (task as { updated_at?: string }).updated_at ??
                            task.last_synced_at!,
                        ),
                        { addSuffix: true },
                      )
                    : "—"}
                </td>
                {rowActions && (
                  <td
                    className="px-3 py-2 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rowActions(task)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
