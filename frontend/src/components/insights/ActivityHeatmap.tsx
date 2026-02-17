"use client";

import { Tooltip } from "recharts";
import { useState } from "react";

export interface HeatmapCell {
  developerId: string;
  developerName: string;
  week: string; // e.g. "2026-W05"
  value: number;
}

interface ActivityHeatmapProps {
  data: HeatmapCell[];
  metric?: string;
}

function getIntensityClass(value: number, max: number): string {
  if (max === 0 || value === 0) return "bg-muted";
  const ratio = value / max;
  if (ratio < 0.15) return "bg-indigo-950";
  if (ratio < 0.3) return "bg-indigo-900";
  if (ratio < 0.5) return "bg-indigo-800";
  if (ratio < 0.7) return "bg-indigo-600";
  if (ratio < 0.85) return "bg-indigo-500";
  return "bg-indigo-400";
}

export function ActivityHeatmap({
  data,
  metric = "commits",
}: ActivityHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No heatmap data available
      </div>
    );
  }

  // Extract unique weeks and developers
  const weeks = Array.from(new Set(data.map((d) => d.week))).sort();
  const developers = Array.from(
    new Map(data.map((d) => [d.developerId, d.developerName])).entries()
  );

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  // Build lookup map
  const cellMap = new Map<string, HeatmapCell>();
  data.forEach((d) => {
    cellMap.set(`${d.developerId}-${d.week}`, d);
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        {/* Header row - week labels */}
        <div className="flex items-end gap-0.5 mb-1 pl-24">
          {weeks.map((week) => (
            <div
              key={week}
              className="w-8 text-[9px] text-muted-foreground text-center truncate"
              title={week}
            >
              {week.split("-W")[1] ? `W${week.split("-W")[1]}` : week}
            </div>
          ))}
        </div>

        {/* Developer rows */}
        {developers.map(([devId, devName]) => (
          <div key={devId} className="flex items-center gap-0.5 mb-0.5">
            <div className="w-24 text-xs text-muted-foreground truncate pr-2 text-right">
              {devName || devId.slice(0, 8)}
            </div>
            {weeks.map((week) => {
              const cell = cellMap.get(`${devId}-${week}`);
              const value = cell?.value ?? 0;
              return (
                <div
                  key={week}
                  className={`w-8 h-6 rounded-sm ${getIntensityClass(value, maxValue)} cursor-pointer transition-all hover:ring-1 hover:ring-indigo-400`}
                  onMouseEnter={() =>
                    setHoveredCell(
                      cell || {
                        developerId: devId,
                        developerName: devName,
                        week,
                        value: 0,
                      }
                    )
                  }
                  onMouseLeave={() => setHoveredCell(null)}
                  title={`${devName || devId.slice(0, 8)} - ${week}: ${value} ${metric}`}
                />
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 pl-24">
          <span className="text-[10px] text-muted-foreground">Less</span>
          <div className="flex gap-0.5">
            {["bg-muted", "bg-indigo-950", "bg-indigo-900", "bg-indigo-800", "bg-indigo-600", "bg-indigo-500", "bg-indigo-400"].map(
              (cls, i) => (
                <div key={i} className={`w-4 h-4 rounded-sm ${cls}`} />
              )
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">More</span>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="text-foreground">
            {hoveredCell.developerName || hoveredCell.developerId.slice(0, 8)}
          </span>{" "}
          - {hoveredCell.week}:{" "}
          <span className="text-indigo-400 font-mono">
            {hoveredCell.value}
          </span>{" "}
          {metric}
        </div>
      )}
    </div>
  );
}
