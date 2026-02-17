"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { TimeEntry } from "@/lib/api";

interface WeeklyTimesheetViewProps {
  entries: TimeEntry[];
  targetHoursPerDay?: number;
  onCellClick?: (date: string, taskId?: string) => void;
  className?: string;
}

interface TimesheetCell {
  date: string;
  taskId: string;
  taskTitle: string;
  minutes: number;
}

export function WeeklyTimesheetView({
  entries,
  targetHoursPerDay = 8,
  onCellClick,
  className = "",
}: WeeklyTimesheetViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  // Get the current week's dates
  const weekDates = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + weekOffset * 7);

    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, [weekOffset]);

  // Build timesheet data
  const { tasks, cellData, dailyTotals, weeklyTotal } = useMemo(() => {
    const tasksMap = new Map<string, { id: string; title: string }>();
    const cells = new Map<string, TimesheetCell>();
    const dailyTotals = new Map<string, number>();
    let weeklyTotal = 0;

    // Filter entries for this week
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];
    weekEnd.setHours(23, 59, 59, 999);

    const weekEntries = entries.filter((e) => {
      const date = new Date(e.entry_date);
      return date >= weekStart && date <= weekEnd;
    });

    // Process entries
    weekEntries.forEach((entry) => {
      const taskId = entry.task_id || "unassigned";
      const taskTitle = entry.task?.title || "Unassigned";
      const dateKey = entry.entry_date.split("T")[0];
      const cellKey = `${dateKey}:${taskId}`;

      tasksMap.set(taskId, { id: taskId, title: taskTitle });

      const existing = cells.get(cellKey) || {
        date: dateKey,
        taskId,
        taskTitle,
        minutes: 0,
      };
      existing.minutes += entry.duration_minutes;
      cells.set(cellKey, existing);

      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + entry.duration_minutes);
      weeklyTotal += entry.duration_minutes;
    });

    return {
      tasks: Array.from(tasksMap.values()),
      cellData: cells,
      dailyTotals,
      weeklyTotal,
    };
  }, [entries, weekDates]);

  const formatDuration = (minutes: number) => {
    if (minutes === 0) return "-";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatShortDuration = (minutes: number) => {
    if (minutes === 0) return "-";
    const hours = (minutes / 60).toFixed(1);
    return `${hours}h`;
  };

  const getWeekRangeLabel = () => {
    const start = weekDates[0];
    const end = weekDates[6];
    const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${startStr} - ${endStr}`;
  };

  return (
    <div className={`bg-muted rounded-xl border border-border overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-5 w-5 text-green-400" />
          Weekly Timesheet
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className="p-2 hover:bg-accent rounded-lg transition"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="text-sm text-foreground min-w-[180px] text-center">
            {getWeekRangeLabel()}
          </span>
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            disabled={weekOffset >= 0}
            className="p-2 hover:bg-accent rounded-lg transition disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="ml-2 px-2 py-1 text-xs text-blue-400 hover:text-blue-300"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Timesheet grid */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-background/50">
              <th className="text-left text-xs font-medium text-muted-foreground p-3 w-[200px] sticky left-0 bg-background/50">
                Task
              </th>
              {weekDates.map((date, i) => {
                const isToday = date.toDateString() === new Date().toDateString();
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <th
                    key={i}
                    className={`text-center text-xs font-medium p-3 min-w-[80px] ${
                      isToday
                        ? "text-blue-400 bg-blue-900/20"
                        : isWeekend
                        ? "text-muted-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <div>{date.toLocaleDateString("en-US", { weekday: "short" })}</div>
                    <div className="text-[10px]">
                      {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </th>
                );
              })}
              <th className="text-center text-xs font-medium text-muted-foreground p-3 min-w-[80px] bg-accent/50">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-muted-foreground">
                  No time entries this week
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                let taskTotal = 0;
                return (
                  <tr key={task.id} className="border-t border-border hover:bg-accent/30">
                    <td className="text-sm text-foreground p-3 sticky left-0 bg-muted truncate max-w-[200px]">
                      {task.title}
                    </td>
                    {weekDates.map((date, i) => {
                      const dateKey = date.toISOString().split("T")[0];
                      const cellKey = `${dateKey}:${task.id}`;
                      const cell = cellData.get(cellKey);
                      const minutes = cell?.minutes || 0;
                      taskTotal += minutes;
                      const isToday = date.toDateString() === new Date().toDateString();

                      return (
                        <td
                          key={i}
                          onClick={() => onCellClick?.(dateKey, task.id)}
                          className={`text-center text-sm p-3 cursor-pointer hover:bg-muted/50 transition ${
                            isToday ? "bg-blue-900/10" : ""
                          } ${minutes > 0 ? "text-green-400" : "text-muted-foreground"}`}
                        >
                          {formatShortDuration(minutes)}
                        </td>
                      );
                    })}
                    <td className="text-center text-sm text-foreground p-3 bg-accent/30 font-medium">
                      {formatDuration(taskTotal)}
                    </td>
                  </tr>
                );
              })
            )}
            {/* Daily totals row */}
            <tr className="border-t-2 border-border bg-accent/50">
              <td className="text-sm font-medium text-foreground p-3 sticky left-0 bg-accent/50">
                Daily Total
              </td>
              {weekDates.map((date, i) => {
                const dateKey = date.toISOString().split("T")[0];
                const total = dailyTotals.get(dateKey) || 0;
                const targetMinutes = targetHoursPerDay * 60;
                const isUnder = total > 0 && total < targetMinutes * 0.8;
                const isOver = total > targetMinutes;
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <td
                    key={i}
                    className={`text-center text-sm font-medium p-3 ${
                      isToday ? "bg-blue-900/20" : ""
                    } ${
                      isOver
                        ? "text-amber-400"
                        : isUnder
                        ? "text-red-400"
                        : total > 0
                        ? "text-green-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formatDuration(total)}
                  </td>
                );
              })}
              <td className="text-center text-sm font-bold text-foreground p-3 bg-muted/50">
                {formatDuration(weeklyTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Target indicator */}
      <div className="p-3 border-t border-border bg-background/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Target: {targetHoursPerDay}h/day ({targetHoursPerDay * 5}h/week)</span>
          <span>
            Progress:{" "}
            <span
              className={
                weeklyTotal >= targetHoursPerDay * 5 * 60
                  ? "text-green-400"
                  : "text-amber-400"
              }
            >
              {Math.round((weeklyTotal / (targetHoursPerDay * 5 * 60)) * 100)}%
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
