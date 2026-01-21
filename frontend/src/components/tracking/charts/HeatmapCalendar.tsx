"use client";

import { useMemo } from "react";

export interface HeatmapDataPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

interface HeatmapCalendarProps {
  data: HeatmapDataPoint[];
  weeks?: number; // Number of weeks to show (default: 52)
  title?: string;
  colorScale?: string[];
  emptyColor?: string;
  showWeekdayLabels?: boolean;
  showMonthLabels?: boolean;
  valueFormatter?: (value: number) => string;
  maxValue?: number; // Override automatic max calculation
  className?: string;
}

const defaultColorScale = [
  "#1e293b", // Empty (slate-800)
  "#164e63", // Very low (cyan-900)
  "#0e7490", // Low (cyan-700)
  "#06b6d4", // Medium (cyan-500)
  "#22d3ee", // High (cyan-400)
  "#67e8f9", // Very high (cyan-300)
];

const weekdayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

export function HeatmapCalendar({
  data,
  weeks = 52,
  title,
  colorScale = defaultColorScale,
  emptyColor = "#0f172a",
  showWeekdayLabels = true,
  showMonthLabels = true,
  valueFormatter = (v) => String(v),
  maxValue,
  className = "",
}: HeatmapCalendarProps) {
  const { cells, months, calculatedMax } = useMemo(() => {
    const today = new Date();
    const dataMap = new Map(data.map((d) => [d.date, d.value]));

    // Calculate the start date (weeks ago, starting from Sunday)
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - weeks * 7 + (7 - today.getDay()));
    startDate.setHours(0, 0, 0, 0);

    // Build cells for each day
    const cells: Array<{
      date: string;
      value: number;
      x: number;
      y: number;
    }> = [];

    let calculatedMax = maxValue || 0;
    if (!maxValue) {
      data.forEach((d) => {
        if (d.value > calculatedMax) calculatedMax = d.value;
      });
    }

    // Track months for labels
    const months: Array<{ month: string; x: number }> = [];
    let currentMonth = "";

    for (let i = 0; i < weeks * 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      if (date > today) break;

      const dateStr = date.toISOString().split("T")[0];
      const weekIndex = Math.floor(i / 7);
      const dayIndex = date.getDay();
      const value = dataMap.get(dateStr) || 0;

      // Track month changes
      const monthLabel = date.toLocaleDateString("en-US", { month: "short" });
      if (monthLabel !== currentMonth && dayIndex === 0) {
        months.push({ month: monthLabel, x: weekIndex });
        currentMonth = monthLabel;
      }

      cells.push({
        date: dateStr,
        value,
        x: weekIndex,
        y: dayIndex,
      });
    }

    return { cells, months, calculatedMax: calculatedMax || 1 };
  }, [data, weeks, maxValue]);

  const getColor = (value: number): string => {
    if (value === 0) return emptyColor;
    const index = Math.min(
      Math.ceil((value / calculatedMax) * (colorScale.length - 1)),
      colorScale.length - 1
    );
    return colorScale[index];
  };

  const formatTooltip = (cell: { date: string; value: number }) => {
    const date = new Date(cell.date);
    const dateStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return `${dateStr}\n${valueFormatter(cell.value)}`;
  };

  const cellSize = 12;
  const cellGap = 3;
  const labelOffset = showWeekdayLabels ? 30 : 0;
  const monthLabelOffset = showMonthLabels ? 20 : 0;

  return (
    <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 ${className}`}>
      {title && <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>}

      <div className="overflow-x-auto">
        <svg
          width={weeks * (cellSize + cellGap) + labelOffset}
          height={7 * (cellSize + cellGap) + monthLabelOffset}
        >
          {/* Month labels */}
          {showMonthLabels &&
            months.map((month, i) => (
              <text
                key={i}
                x={labelOffset + month.x * (cellSize + cellGap)}
                y={14}
                className="fill-slate-400 text-xs"
              >
                {month.month}
              </text>
            ))}

          {/* Weekday labels */}
          {showWeekdayLabels &&
            weekdayLabels.map((label, i) => (
              <text
                key={i}
                x={0}
                y={monthLabelOffset + i * (cellSize + cellGap) + cellSize - 2}
                className="fill-slate-500 text-xs"
              >
                {label}
              </text>
            ))}

          {/* Cells */}
          {cells.map((cell, i) => (
            <rect
              key={i}
              x={labelOffset + cell.x * (cellSize + cellGap)}
              y={monthLabelOffset + cell.y * (cellSize + cellGap)}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={getColor(cell.value)}
              className="cursor-pointer hover:opacity-80 transition-opacity"
            >
              <title>{formatTooltip(cell)}</title>
            </rect>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-4">
        <span className="text-xs text-slate-500">Less</span>
        {colorScale.map((color, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: color }}
          />
        ))}
        <span className="text-xs text-slate-500">More</span>
      </div>
    </div>
  );
}

// Helper to convert standups to heatmap data
export function standupsToHeatmap(
  standups: Array<{ standup_date: string }>
): HeatmapDataPoint[] {
  const counts = new Map<string, number>();

  standups.forEach((standup) => {
    const date = standup.standup_date.split("T")[0];
    counts.set(date, (counts.get(date) || 0) + 1);
  });

  return Array.from(counts.entries()).map(([date, value]) => ({ date, value }));
}

// Helper to convert time entries to heatmap data (total minutes per day)
export function timeEntriesToHeatmap(
  entries: Array<{ entry_date: string; duration_minutes: number }>
): HeatmapDataPoint[] {
  const totals = new Map<string, number>();

  entries.forEach((entry) => {
    const date = entry.entry_date.split("T")[0];
    totals.set(date, (totals.get(date) || 0) + entry.duration_minutes);
  });

  return Array.from(totals.entries()).map(([date, value]) => ({ date, value }));
}
