"use client";

import { useState, useEffect, useMemo } from "react";
import { Calendar, ZoomIn, ZoomOut } from "lucide-react";
import { publicProjectApi, PublicSprintItem } from "@/lib/api";
import { SPRINT_STATUS_COLORS } from "./constants";
import { LoadingSpinner, EmptyState } from "./shared";
import { cn } from "@/lib/utils";

interface TimelineTabProps {
  publicSlug: string;
}

type ZoomLevel = "week" | "month" | "quarter";

function generateDateRange(startDate: Date, endDate: Date, zoomLevel: ZoomLevel): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    dates.push(new Date(current));
    if (zoomLevel === "week") {
      current.setDate(current.getDate() + 7);
    } else if (zoomLevel === "month") {
      current.setMonth(current.getMonth() + 1);
    } else {
      current.setMonth(current.getMonth() + 3);
    }
  }

  return dates;
}

function formatDateHeader(date: Date, zoomLevel: ZoomLevel): string {
  if (zoomLevel === "week") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } else if (zoomLevel === "month") {
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  } else {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} ${date.getFullYear()}`;
  }
}

function calculateSprintPosition(
  sprint: PublicSprintItem,
  timelineStart: Date,
  timelineEnd: Date,
  totalWidth: number
): { left: number; width: number } {
  const start = new Date(sprint.start_date);
  const end = new Date(sprint.end_date);

  const totalDays = (timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
  const startOffset = Math.max(0, (start.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
  const endOffset = Math.min(totalDays, (end.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));

  const left = (startOffset / totalDays) * totalWidth;
  const width = ((endOffset - startOffset) / totalDays) * totalWidth;

  return { left: Math.max(0, left), width: Math.max(40, width) };
}

export function TimelineTab({ publicSlug }: TimelineTabProps) {
  const [sprints, setSprints] = useState<PublicSprintItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("month");

  useEffect(() => {
    publicProjectApi.getTimeline(publicSlug).then(setSprints).finally(() => setIsLoading(false));
  }, [publicSlug]);

  const { timelineStart, timelineEnd, dateHeaders, totalWidth, todayPosition } = useMemo(() => {
    const now = new Date();
    let start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    let end = new Date(now);
    end.setMonth(end.getMonth() + 6);

    if (sprints && sprints.length > 0) {
      const sprintStarts = sprints.map((s) => new Date(s.start_date).getTime());
      const sprintEnds = sprints.map((s) => new Date(s.end_date).getTime());
      const minStart = Math.min(...sprintStarts);
      const maxEnd = Math.max(...sprintEnds);

      if (minStart < start.getTime()) {
        start = new Date(minStart);
        start.setDate(start.getDate() - 14);
      }
      if (maxEnd > end.getTime()) {
        end = new Date(maxEnd);
        end.setDate(end.getDate() + 14);
      }
    }

    const headers = generateDateRange(start, end, zoomLevel);
    const columnWidth = zoomLevel === "week" ? 80 : zoomLevel === "month" ? 120 : 160;
    const width = headers.length * columnWidth;

    // Today marker position
    const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const todayOffset = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const todayPos = (todayOffset / totalDays) * width;

    return {
      timelineStart: start,
      timelineEnd: end,
      dateHeaders: headers,
      totalWidth: width,
      todayPosition: todayPos,
    };
  }, [sprints, zoomLevel]);

  const columnWidth = zoomLevel === "week" ? 80 : zoomLevel === "month" ? 120 : 160;

  if (isLoading) return <LoadingSpinner />;
  if (sprints.length === 0) return <EmptyState message="No timeline data available" />;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">Sprint Timeline</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted border border-border rounded-lg">
            <button
              onClick={() => {
                if (zoomLevel === "quarter") setZoomLevel("month");
                else if (zoomLevel === "month") setZoomLevel("week");
              }}
              disabled={zoomLevel === "week"}
              className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs text-muted-foreground capitalize min-w-[60px] text-center">
              {zoomLevel}
            </span>
            <button
              onClick={() => {
                if (zoomLevel === "week") setZoomLevel("month");
                else if (zoomLevel === "month") setZoomLevel("quarter");
              }}
              disabled={zoomLevel === "quarter"}
              className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-muted rounded-lg overflow-hidden">
        {/* Header */}
        <div className="border-b border-border overflow-x-auto">
          <div className="flex relative" style={{ width: `${totalWidth}px`, minWidth: "100%" }}>
            {dateHeaders.map((date, index) => (
              <div
                key={index}
                className="flex-shrink-0 px-2 py-2 text-center border-r border-border/30"
                style={{ width: `${columnWidth}px` }}
              >
                <span className="text-xs text-muted-foreground">
                  {formatDateHeader(date, zoomLevel)}
                </span>
              </div>
            ))}

            {/* Today marker */}
            {todayPosition > 0 && todayPosition < totalWidth && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-primary-500 z-10"
                style={{ left: `${todayPosition}px` }}
              >
                <div className="absolute -top-0 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-primary-500 rounded-b text-[10px] text-foreground whitespace-nowrap">
                  Today
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sprint bars */}
        <div className="overflow-x-auto">
          <div style={{ width: `${totalWidth}px`, minWidth: "100%" }}>
            {sprints.map((sprint) => {
              const position = calculateSprintPosition(sprint, timelineStart, timelineEnd, totalWidth);
              const completionRate = sprint.tasks_count > 0
                ? Math.round((sprint.completed_count / sprint.tasks_count) * 100)
                : 0;

              return (
                <div key={sprint.id} className="relative h-14 border-b border-border/30">
                  <div
                    className={cn(
                      "absolute top-2 h-10 rounded-lg transition-all",
                      SPRINT_STATUS_COLORS[sprint.status] || SPRINT_STATUS_COLORS.planning,
                      sprint.status === "completed" && "opacity-60"
                    )}
                    style={{
                      left: `${position.left}px`,
                      width: `${position.width}px`,
                    }}
                  >
                    {/* Progress bar inside */}
                    <div
                      className="absolute inset-y-0 left-0 bg-white/20 rounded-l-lg transition-all"
                      style={{ width: `${completionRate}%` }}
                    />

                    {/* Content */}
                    <div className="relative h-full flex items-center px-3 overflow-hidden">
                      <span className="text-xs font-medium text-foreground truncate">{sprint.name}</span>
                      {position.width > 100 && (
                        <span className="ml-2 text-[10px] text-foreground/70">{completionRate}%</span>
                      )}
                    </div>
                  </div>

                  {/* Today marker line */}
                  {todayPosition > 0 && todayPosition < totalWidth && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-primary-500/30"
                      style={{ left: `${todayPosition}px` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Status:</span>
        {Object.entries(SPRINT_STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn("w-3 h-3 rounded", color)} />
            <span className="text-muted-foreground capitalize">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
