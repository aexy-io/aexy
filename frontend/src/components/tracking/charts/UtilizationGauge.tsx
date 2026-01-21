"use client";

import { useMemo } from "react";

interface UtilizationGaugeProps {
  value: number; // Current value (e.g., hours logged)
  target: number; // Target value (e.g., expected hours)
  title?: string;
  unit?: string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  thresholds?: {
    low: number; // Below this is "under" (e.g., 0.7 = 70%)
    high: number; // Above this is "over" (e.g., 1.0 = 100%)
  };
  className?: string;
}

const sizeConfig = {
  sm: { radius: 60, strokeWidth: 8, fontSize: "text-lg" },
  md: { radius: 80, strokeWidth: 10, fontSize: "text-2xl" },
  lg: { radius: 100, strokeWidth: 12, fontSize: "text-3xl" },
};

export function UtilizationGauge({
  value,
  target,
  title,
  unit = "h",
  showPercentage = true,
  size = "md",
  thresholds = { low: 0.7, high: 1.0 },
  className = "",
}: UtilizationGaugeProps) {
  const config = sizeConfig[size];
  const percentage = target > 0 ? Math.min((value / target) * 100, 120) : 0;
  const normalizedPercentage = Math.min(percentage, 100);

  const { circumference, dashOffset, color, status } = useMemo(() => {
    const circumference = 2 * Math.PI * config.radius;
    const dashOffset = circumference - (normalizedPercentage / 100) * circumference;

    let color = "#10b981"; // green
    let status: "under" | "on-track" | "over" = "on-track";

    if (percentage < thresholds.low * 100) {
      color = "#f59e0b"; // amber - under
      status = "under";
    } else if (percentage > thresholds.high * 100) {
      color = "#ef4444"; // red - over
      status = "over";
    }

    return { circumference, dashOffset, color, status };
  }, [config.radius, normalizedPercentage, percentage, thresholds]);

  const viewBoxSize = (config.radius + config.strokeWidth) * 2;

  return (
    <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 ${className}`}>
      {title && <h3 className="text-lg font-semibold text-white mb-4 text-center">{title}</h3>}

      <div className="flex flex-col items-center">
        <div className="relative">
          <svg
            width={viewBoxSize}
            height={viewBoxSize}
            viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
            className="-rotate-90"
          >
            {/* Background circle */}
            <circle
              cx={config.radius + config.strokeWidth}
              cy={config.radius + config.strokeWidth}
              r={config.radius}
              fill="none"
              stroke="#1e293b"
              strokeWidth={config.strokeWidth}
            />
            {/* Progress circle */}
            <circle
              cx={config.radius + config.strokeWidth}
              cy={config.radius + config.strokeWidth}
              r={config.radius}
              fill="none"
              stroke={color}
              strokeWidth={config.strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-500"
            />
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`${config.fontSize} font-bold text-white`}>
              {value.toFixed(1)}{unit}
            </span>
            {showPercentage && (
              <span className="text-sm text-slate-400">
                {Math.round(percentage)}%
              </span>
            )}
          </div>
        </div>

        {/* Target and status */}
        <div className="mt-4 text-center">
          <p className="text-sm text-slate-400">
            Target: {target}{unit}
          </p>
          <p className={`text-sm font-medium mt-1 ${
            status === "on-track" ? "text-green-400" :
            status === "under" ? "text-amber-400" : "text-red-400"
          }`}>
            {status === "on-track" && "On Track"}
            {status === "under" && `${(thresholds.low * 100 - percentage).toFixed(0)}% below target`}
            {status === "over" && `${(percentage - thresholds.high * 100).toFixed(0)}% over target`}
          </p>
        </div>
      </div>
    </div>
  );
}

// Mini inline version for use in cards/lists
export function UtilizationMini({
  value,
  target,
  size = 40,
}: {
  value: number;
  target: number;
  size?: number;
}) {
  const percentage = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percentage / 100) * circumference;

  let color = "#10b981"; // green
  if (percentage < 70) color = "#f59e0b"; // amber
  else if (percentage > 100) color = "#ef4444"; // red

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="absolute text-xs font-medium text-white">
        {Math.round(percentage)}%
      </span>
    </div>
  );
}

// Helper to calculate weekly utilization
export function calculateWeeklyUtilization(
  timeEntries: Array<{ duration_minutes: number }>,
  targetHoursPerWeek: number = 40
): { value: number; target: number } {
  const totalMinutes = timeEntries.reduce((sum, e) => sum + e.duration_minutes, 0);
  return {
    value: totalMinutes / 60, // Convert to hours
    target: targetHoursPerWeek,
  };
}
