"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { DailyActivitySummary } from "@/lib/api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LearningCalendarProps {
  data: DailyActivitySummary[];
  weeks?: number;
  className?: string;
}

// Get color intensity based on activity count
function getIntensityClass(count: number, maxCount: number): string {
  if (count === 0) return "bg-gray-100";
  const ratio = count / Math.max(maxCount, 1);
  if (ratio >= 0.8) return "bg-green-500";
  if (ratio >= 0.6) return "bg-green-400";
  if (ratio >= 0.4) return "bg-green-300";
  if (ratio >= 0.2) return "bg-green-200";
  return "bg-green-100";
}

// Generate date range for the calendar
function generateDateRange(weeks: number): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from the beginning of the week that contains (today - weeks * 7 days)
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - weeks * 7);
  // Adjust to start of week (Sunday)
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const endDate = new Date(today);

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }

  return dates;
}

// Format date to YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Get month labels
function getMonthLabels(dates: Date[]): { label: string; index: number }[] {
  const labels: { label: string; index: number }[] = [];
  let currentMonth = -1;

  dates.forEach((date, index) => {
    const month = date.getMonth();
    if (date.getDay() === 0 && month !== currentMonth) {
      labels.push({
        label: date.toLocaleDateString("en-US", { month: "short" }),
        index: Math.floor(index / 7),
      });
      currentMonth = month;
    }
  });

  return labels;
}

export function LearningCalendar({
  data,
  weeks = 12,
  className,
}: LearningCalendarProps) {
  // Create a map of date -> activity data
  const dataMap = useMemo(() => {
    const map = new Map<string, DailyActivitySummary>();
    data.forEach((d) => map.set(d.date, d));
    return map;
  }, [data]);

  // Generate dates and organize into weeks
  const dates = useMemo(() => generateDateRange(weeks), [weeks]);
  const monthLabels = useMemo(() => getMonthLabels(dates), [dates]);

  // Find max count for color scaling
  const maxCount = useMemo(
    () => Math.max(...data.map((d) => d.activities_count), 1),
    [data]
  );

  // Organize dates into weeks (columns)
  const weekColumns = useMemo(() => {
    const columns: Date[][] = [];
    for (let i = 0; i < dates.length; i += 7) {
      columns.push(dates.slice(i, i + 7));
    }
    return columns;
  }, [dates]);

  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

  return (
    <div className={cn("overflow-x-auto", className)}>
      {/* Month labels */}
      <div className="flex mb-1 pl-8">
        {monthLabels.map((label, i) => (
          <div
            key={`${label.label}-${i}`}
            className="text-xs text-gray-500"
            style={{ marginLeft: i === 0 ? `${label.index * 14}px` : "auto" }}
          >
            {label.label}
          </div>
        ))}
      </div>

      <div className="flex gap-0.5">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 pr-2">
          {dayLabels.map((label, i) => (
            <div key={i} className="h-3 text-xs text-gray-500 leading-3">
              {label}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <TooltipProvider>
          <div className="flex gap-0.5">
            {weekColumns.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-0.5">
                {week.map((date, dayIndex) => {
                  const dateStr = formatDate(date);
                  const dayData = dataMap.get(dateStr);
                  const count = dayData?.activities_count || 0;
                  const minutes = dayData?.time_spent_minutes || 0;
                  const points = dayData?.points_earned || 0;

                  return (
                    <Tooltip key={dateStr}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "w-3 h-3 rounded-sm transition-colors",
                            getIntensityClass(count, maxCount),
                            count > 0 && "cursor-pointer hover:ring-1 hover:ring-gray-400"
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <div className="font-medium">
                          {date.toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        {count > 0 ? (
                          <div className="space-y-0.5 text-gray-400">
                            <div>{count} {count === 1 ? "activity" : "activities"}</div>
                            {minutes > 0 && (
                              <div>
                                {minutes >= 60
                                  ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
                                  : `${minutes}m`}
                              </div>
                            )}
                            {points > 0 && <div>+{points} pts</div>}
                          </div>
                        ) : (
                          <div className="text-gray-400">No activity</div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </TooltipProvider>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
        <span>Less</span>
        <div className="flex gap-0.5">
          <div className="w-3 h-3 rounded-sm bg-gray-100" />
          <div className="w-3 h-3 rounded-sm bg-green-100" />
          <div className="w-3 h-3 rounded-sm bg-green-200" />
          <div className="w-3 h-3 rounded-sm bg-green-300" />
          <div className="w-3 h-3 rounded-sm bg-green-400" />
          <div className="w-3 h-3 rounded-sm bg-green-500" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

// Compact streak calendar (shows last 7 days)
interface StreakCalendarProps {
  data: DailyActivitySummary[];
  className?: string;
}

export function StreakCalendar({ data, className }: StreakCalendarProps) {
  const dataMap = useMemo(() => {
    const map = new Map<string, DailyActivitySummary>();
    data.forEach((d) => map.set(d.date, d));
    return map;
  }, [data]);

  // Get last 7 days
  const days = useMemo(() => {
    const result: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      result.push(date);
    }

    return result;
  }, []);

  return (
    <TooltipProvider>
      <div className={cn("flex gap-1", className)}>
        {days.map((date) => {
          const dateStr = formatDate(date);
          const dayData = dataMap.get(dateStr);
          const hasActivity = (dayData?.activities_count || 0) > 0;
          const isToday = dateStr === formatDate(new Date());

          return (
            <Tooltip key={dateStr}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                    hasActivity
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 text-gray-400",
                    isToday && !hasActivity && "ring-2 ring-amber-400 ring-offset-1"
                  )}
                >
                  {date.toLocaleDateString("en-US", { weekday: "narrow" })}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div>
                  {date.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                {hasActivity ? (
                  <div className="text-green-400">
                    {dayData!.activities_count} {dayData!.activities_count === 1 ? "activity" : "activities"}
                  </div>
                ) : (
                  <div className="text-gray-400">No activity</div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
