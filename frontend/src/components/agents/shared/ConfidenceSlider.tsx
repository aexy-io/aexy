"use client";

import { cn } from "@/lib/utils";

interface ConfidenceSliderProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  showPercentage?: boolean;
  className?: string;
}

export function ConfidenceSlider({
  value,
  onChange,
  label,
  description,
  min = 0,
  max = 1,
  step = 0.05,
  disabled = false,
  showPercentage = true,
  className,
}: ConfidenceSliderProps) {
  const percentage = Math.round(value * 100);

  // Color based on value
  const getColor = (val: number) => {
    if (val < 0.5) return "text-red-400";
    if (val < 0.7) return "text-amber-400";
    if (val < 0.85) return "text-green-400";
    return "text-emerald-400";
  };

  const getTrackColor = (val: number) => {
    if (val < 0.5) return "bg-red-500";
    if (val < 0.7) return "bg-amber-500";
    if (val < 0.85) return "bg-green-500";
    return "bg-emerald-500";
  };

  return (
    <div className={cn("space-y-2", className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className="text-sm font-medium text-foreground">{label}</label>
          )}
          {showPercentage && (
            <span className={cn("text-sm font-medium", getColor(value))}>
              {percentage}%
            </span>
          )}
        </div>
      )}

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          className={cn(
            "w-full h-2 rounded-lg appearance-none cursor-pointer",
            "bg-accent",
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:w-4",
            "[&::-webkit-slider-thumb]:h-4",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-white",
            "[&::-webkit-slider-thumb]:shadow-md",
            "[&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-webkit-slider-thumb]:border-2",
            "[&::-webkit-slider-thumb]:border-border",
            "[&::-moz-range-thumb]:w-4",
            "[&::-moz-range-thumb]:h-4",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-white",
            "[&::-moz-range-thumb]:border-2",
            "[&::-moz-range-thumb]:border-border",
            "[&::-moz-range-thumb]:cursor-pointer",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          style={{
            background: `linear-gradient(to right, ${
              value < 0.5 ? "#ef4444" : value < 0.7 ? "#f59e0b" : value < 0.85 ? "#22c55e" : "#10b981"
            } 0%, ${
              value < 0.5 ? "#ef4444" : value < 0.7 ? "#f59e0b" : value < 0.85 ? "#22c55e" : "#10b981"
            } ${percentage}%, #334155 ${percentage}%, #334155 100%)`,
          }}
        />
      </div>

      {/* Reference markers */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// Display-only confidence indicator
interface ConfidenceIndicatorProps {
  value: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceIndicator({
  value,
  size = "md",
  showLabel = true,
  className,
}: ConfidenceIndicatorProps) {
  const percentage = Math.round(value * 100);

  const getColor = (val: number) => {
    if (val < 0.5) return { bg: "bg-red-500", text: "text-red-600 dark:text-red-400" };
    if (val < 0.7) return { bg: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
    if (val < 0.85) return { bg: "bg-green-500", text: "text-green-600 dark:text-green-400" };
    return { bg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  };

  const colors = getColor(value);

  const sizeClasses = {
    sm: { bar: "h-1", text: "text-xs" },
    md: { bar: "h-2", text: "text-sm" },
    lg: { bar: "h-3", text: "text-base" },
  };

  return (
    <div className={cn("space-y-1", className)}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className={cn(sizeClasses[size].text, "text-muted-foreground")}>
            Confidence
          </span>
          <span className={cn(sizeClasses[size].text, "font-medium", colors.text)}>
            {percentage}%
          </span>
        </div>
      )}
      <div className={cn("w-full bg-accent rounded-full overflow-hidden", sizeClasses[size].bar)}>
        <div
          className={cn("h-full rounded-full transition-all", colors.bg)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
