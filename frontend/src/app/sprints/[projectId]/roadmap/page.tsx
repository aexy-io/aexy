"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Target,
  Plus,
  ZoomIn,
  ZoomOut,
  Layers,
  Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSprints } from "@/hooks/useSprints";
import { useEpics } from "@/hooks/useEpics";
import { SprintListItem, EpicListItem } from "@/lib/api";
import { CommandPalette } from "@/components/CommandPalette";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/premium-card";

type ZoomLevel = "week" | "month" | "quarter";

// Sprint status colors
const SPRINT_STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-500",
  active: "bg-green-500",
  review: "bg-amber-500",
  retrospective: "bg-purple-500",
  completed: "bg-slate-500",
};

// Generate date range for timeline
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

// Format date for header
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

// Calculate position and width for a sprint bar
function calculateSprintPosition(
  sprint: SprintListItem,
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

interface SprintBarProps {
  sprint: SprintListItem;
  style: { left: number; width: number };
  onClick: () => void;
}

function SprintBar({ sprint, style, onClick }: SprintBarProps) {
  const completionRate = sprint.tasks_count > 0
    ? Math.round((sprint.completed_count / sprint.tasks_count) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      style={{
        left: `${style.left}px`,
        width: `${style.width}px`,
      }}
      className={cn(
        "absolute h-10 rounded-lg cursor-pointer transition-all duration-200",
        "hover:ring-2 hover:ring-primary-500/50 hover:z-10",
        SPRINT_STATUS_COLORS[sprint.status],
        sprint.status === "completed" && "opacity-60"
      )}
    >
      {/* Progress bar inside */}
      <div
        className="absolute inset-y-0 left-0 bg-white/20 rounded-l-lg transition-all"
        style={{ width: `${completionRate}%` }}
      />

      {/* Content */}
      <div className="relative h-full flex items-center px-3 overflow-hidden">
        <span className="text-xs font-medium text-white truncate">{sprint.name}</span>
        {style.width > 100 && (
          <span className="ml-2 text-[10px] text-white/70">{completionRate}%</span>
        )}
      </div>
    </motion.div>
  );
}

interface EpicSwimlaneProps {
  epic: EpicListItem;
  sprints: SprintListItem[];
  timelineStart: Date;
  timelineEnd: Date;
  totalWidth: number;
  onSprintClick: (sprintId: string) => void;
}

function EpicSwimlane({
  epic,
  sprints,
  timelineStart,
  timelineEnd,
  totalWidth,
  onSprintClick,
}: EpicSwimlaneProps) {
  // For now, show all sprints in each epic swimlane
  // In real app, filter by epic_id
  const epicSprints = sprints;

  return (
    <div className="flex border-b border-slate-700/50 last:border-b-0">
      {/* Epic label */}
      <div className="w-48 flex-shrink-0 px-4 py-3 bg-slate-800/50 border-r border-slate-700/50">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: epic.color }}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white truncate">{epic.title}</h3>
            <p className="text-[10px] text-slate-500">{epic.key}</p>
          </div>
        </div>
      </div>

      {/* Timeline area */}
      <div className="flex-1 relative h-16" style={{ width: `${totalWidth}px` }}>
        {epicSprints.map((sprint) => {
          const position = calculateSprintPosition(sprint, timelineStart, timelineEnd, totalWidth);
          return (
            <SprintBar
              key={sprint.id}
              sprint={sprint}
              style={position}
              onClick={() => onSprintClick(sprint.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function RoadmapPage({
  params,
}: {
  params: { projectId: string };
}) {
  const { projectId } = params;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const { sprints, isLoading: sprintsLoading } = useSprints(currentWorkspaceId, projectId);
  const { epics } = useEpics(currentWorkspaceId);

  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("month");
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);

  // Calculate timeline range
  const { timelineStart, timelineEnd, dateHeaders, totalWidth } = useMemo(() => {
    const now = new Date();
    let start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    let end = new Date(now);
    end.setMonth(end.getMonth() + 6);

    // Adjust based on sprint dates
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

    return {
      timelineStart: start,
      timelineEnd: end,
      dateHeaders: headers,
      totalWidth: width,
    };
  }, [sprints, zoomLevel]);

  // Column width based on zoom
  const columnWidth = zoomLevel === "week" ? 80 : zoomLevel === "month" ? 120 : 160;

  // Today marker position
  const todayPosition = useMemo(() => {
    const now = new Date();
    const totalDays = (timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
    const todayOffset = (now.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
    return (todayOffset / totalDays) * totalWidth;
  }, [timelineStart, timelineEnd, totalWidth]);

  // Scroll to today on mount
  useEffect(() => {
    if (scrollContainerRef.current && todayPosition > 0) {
      scrollContainerRef.current.scrollLeft = todayPosition - 200;
    }
  }, [todayPosition]);

  const handleZoomIn = () => {
    if (zoomLevel === "quarter") setZoomLevel("month");
    else if (zoomLevel === "month") setZoomLevel("week");
  };

  const handleZoomOut = () => {
    if (zoomLevel === "week") setZoomLevel("month");
    else if (zoomLevel === "month") setZoomLevel("quarter");
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  // Default epics if none exist
  const displayEpics = epics && epics.length > 0
    ? epics
    : [
        { id: "default", key: "DEFAULT", title: "All Sprints", color: "#6366f1", status: "active", progress_percentage: 0 } as EpicListItem,
      ];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <CommandPalette workspaceId={currentWorkspaceId} projectId={projectId} />

      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/sprints/${projectId}`}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-white">Roadmap</h1>
                <p className="text-xs text-slate-500">
                  {sprints?.length || 0} sprints • {displayEpics.length} epics
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Zoom controls */}
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel === "quarter"}
                  className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs text-slate-400 capitalize min-w-[60px] text-center">
                  {zoomLevel}
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel === "week"}
                  className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>

              {/* Today button */}
              <button
                onClick={() => {
                  if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollLeft = todayPosition - 200;
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
              >
                <Calendar className="h-4 w-4" />
                Today
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Roadmap content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {sprintsLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Timeline header */}
            <div className="flex-shrink-0 border-b border-slate-700 bg-slate-800/30">
              <div className="flex">
                {/* Spacer for epic column */}
                <div className="w-48 flex-shrink-0 px-4 py-2 border-r border-slate-700/50">
                  <span className="text-xs text-slate-500 uppercase tracking-wider">Epics</span>
                </div>

                {/* Date headers */}
                <div
                  ref={scrollContainerRef}
                  className="flex-1 overflow-x-auto"
                  style={{ scrollBehavior: "smooth" }}
                >
                  <div className="flex relative" style={{ width: `${totalWidth}px` }}>
                    {dateHeaders.map((date, index) => (
                      <div
                        key={index}
                        className="flex-shrink-0 px-2 py-2 text-center border-r border-slate-700/30"
                        style={{ width: `${columnWidth}px` }}
                      >
                        <span className="text-xs text-slate-400">
                          {formatDateHeader(date, zoomLevel)}
                        </span>
                      </div>
                    ))}

                    {/* Today marker in header */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-primary-500 z-10"
                      style={{ left: `${todayPosition}px` }}
                    >
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-primary-500 rounded text-[10px] text-white whitespace-nowrap">
                        Today
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Swimlanes */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col">
                {displayEpics.map((epic) => (
                  <EpicSwimlane
                    key={epic.id}
                    epic={epic}
                    sprints={sprints || []}
                    timelineStart={timelineStart}
                    timelineEnd={timelineEnd}
                    totalWidth={totalWidth}
                    onSprintClick={setSelectedSprintId}
                  />
                ))}
              </div>

              {/* Empty state */}
              {(!sprints || sprints.length === 0) && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                    <Layers className="h-8 w-8 text-slate-600" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">No sprints yet</h3>
                  <p className="text-slate-500 mb-4">Create sprints to see them on the roadmap</p>
                  <Link
                    href={`/sprints/${projectId}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
                  >
                    <Plus className="h-4 w-4" />
                    Create Sprint
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Legend */}
      <footer className="flex-shrink-0 border-t border-slate-700 bg-slate-800/30 px-4 py-2">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">Status:</span>
            {Object.entries(SPRINT_STATUS_COLORS).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div className={cn("w-3 h-3 rounded", color)} />
                <span className="text-xs text-slate-400 capitalize">{status}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500">
            Drag sprints to reschedule • Click to view details
          </div>
        </div>
      </footer>

      {/* Sprint detail panel (could be a modal) */}
      {selectedSprintId && (
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className="fixed right-0 top-0 bottom-0 w-96 bg-slate-800 border-l border-slate-700 shadow-2xl z-40 overflow-y-auto"
        >
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="font-medium text-white">Sprint Details</h3>
            <button
              onClick={() => setSelectedSprintId(null)}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
            >
              ✕
            </button>
          </div>
          <div className="p-4">
            {(() => {
              const sprint = sprints?.find((s) => s.id === selectedSprintId);
              if (!sprint) return null;

              const completionRate = sprint.tasks_count > 0
                ? Math.round((sprint.completed_count / sprint.tasks_count) * 100)
                : 0;

              return (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{sprint.name}</h2>
                    <Badge
                      variant={sprint.status === "active" ? "success" : sprint.status === "planning" ? "info" : "default"}
                      className="mt-2"
                    >
                      {sprint.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                      <div className="text-2xl font-bold text-white">{sprint.tasks_count}</div>
                      <div className="text-xs text-slate-400">Tasks</div>
                    </div>
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                      <div className="text-2xl font-bold text-white">{sprint.total_points}</div>
                      <div className="text-xs text-slate-400">Points</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Progress</span>
                      <span>{completionRate}%</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full"
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-xs text-slate-400">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(sprint.start_date).toLocaleDateString()} - {new Date(sprint.end_date).toLocaleDateString()}
                    </div>
                  </div>

                  <Link
                    href={`/sprints/${projectId}/${sprint.id}`}
                    className="block w-full text-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition"
                  >
                    Open Sprint Board
                  </Link>
                </div>
              );
            })()}
          </div>
        </motion.div>
      )}
    </div>
  );
}
