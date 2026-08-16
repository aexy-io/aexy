"use client";

import { useTranslations } from "next-intl";
import { BookOpen, Bug as BugIcon, CheckSquare, PieChart, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMyWorkItems } from "@/hooks/useMyWorkItems";

const ROWS: { key: "task" | "bug" | "story" | "ticket"; icon: LucideIcon; bar: string; text: string }[] = [
  { key: "task", icon: CheckSquare, bar: "bg-blue-500", text: "text-blue-400" },
  { key: "bug", icon: BugIcon, bar: "bg-red-500", text: "text-red-400" },
  { key: "story", icon: BookOpen, bar: "bg-purple-500", text: "text-purple-400" },
  { key: "ticket", icon: Ticket, bar: "bg-cyan-500", text: "text-cyan-400" },
];

/**
 * What the queue is made of, by tracker.
 *
 * The single count on the queue header says how much is on your plate but not
 * what kind of work it is — twelve items is a very different week if eleven of
 * them are bugs.
 */
export function MyWorkByTypeWidget() {
  const t = useTranslations("myWork");
  const { counts, canSeeTickets, isLoading } = useMyWorkItems();

  const rows = ROWS.filter((row) => row.key !== "ticket" || canSeeTickets);
  const max = Math.max(1, ...rows.map((row) => counts.byType[row.key]));

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden h-full" data-testid="my-work-by-type">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="p-1.5 bg-emerald-500/10 rounded-lg">
          <PieChart className="h-4 w-4 text-emerald-400" />
        </div>
        <h3 className="font-semibold text-foreground">{t("byType")}</h3>
      </div>

      <div className="p-4 space-y-3">
        {rows.map(({ key, icon: Icon, bar, text }) => {
          const value = counts.byType[key];
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Icon className={`h-3.5 w-3.5 ${text}`} />
                <span className="text-muted-foreground">{t(`types.${key}`)}</span>
                <span className="ml-auto font-medium text-foreground tabular-nums">
                  {isLoading ? "—" : value}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${bar} transition-all`}
                  style={{ width: `${isLoading ? 0 : (value / max) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
