"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Clock, Layers, ListTodo } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMyWorkItems } from "@/hooks/useMyWorkItems";
import { useMyWorkStore, type StatusBucket } from "@/stores/myWorkStore";

const TONES: Record<string, { chip: string; active: string }> = {
  purple: {
    chip: "bg-purple-500/10 text-purple-500 dark:text-purple-300",
    active: "border-purple-500/60 ring-1 ring-purple-500/40",
  },
  amber: {
    chip: "bg-amber-500/10 text-amber-500 dark:text-amber-300",
    active: "border-amber-500/60 ring-1 ring-amber-500/40",
  },
  blue: {
    chip: "bg-blue-500/10 text-blue-500 dark:text-blue-300",
    active: "border-blue-500/60 ring-1 ring-blue-500/40",
  },
  red: {
    chip: "bg-red-500/10 text-red-500 dark:text-red-300",
    active: "border-red-500/60 ring-1 ring-red-500/40",
  },
};

/**
 * The four counts at the top of the home dashboard, each a filter.
 *
 * They used to be plain `div`s: the page told you 3 things were in progress and
 * gave you no way to see which 3. Every tile is a toggle now — pressing the
 * active one clears it — and the queue below follows.
 */
export function MyWorkStatsWidget() {
  const t = useTranslations("myWork");
  const { counts, isLoading } = useMyWorkItems();
  const { statusBucket, toggleStatusBucket } = useMyWorkStore();

  const tiles: {
    bucket: StatusBucket;
    icon: LucideIcon;
    tone: keyof typeof TONES;
    value: number;
    label: string;
  }[] = [
    { bucket: "all", icon: ListTodo, tone: "purple", value: counts.total, label: t("stats.items") },
    { bucket: "in_progress", icon: Clock, tone: "amber", value: counts.inProgress, label: t("stats.inProgress") },
    { bucket: "todo", icon: Layers, tone: "blue", value: counts.todo, label: t("stats.toDo") },
    { bucket: "sla_breached", icon: AlertTriangle, tone: "red", value: counts.slaBreached, label: t("stats.slaBreached") },
  ];

  // Two elements deep on purpose: the widget grid styles its children with
  // `[&>*]:flex [&>*]:flex-col` so every widget fills its cell, which would
  // turn a grid root into a single stacked column. The grid goes one level in,
  // where those utilities don't reach.
  return (
    <div data-testid="my-work-stats">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(({ bucket, icon: Icon, tone, value, label }) => {
          const isActive = statusBucket === bucket;
          return (
            <button
              key={bucket}
              type="button"
              onClick={() => toggleStatusBucket(bucket)}
              aria-pressed={isActive}
              data-testid={`my-work-stat-${bucket}`}
              className={`text-left rounded-xl border p-4 transition bg-background/50 hover:bg-accent/40 ${
                isActive ? TONES[tone].active : "border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg shrink-0 ${TONES[tone].chip}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  {isLoading ? (
                    <div className="h-7 w-10 bg-muted rounded animate-pulse" />
                  ) : (
                    <p className="text-2xl font-semibold text-foreground leading-tight tabular-nums">
                      {value}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
