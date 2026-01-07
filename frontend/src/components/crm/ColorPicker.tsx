"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Default color palette (Attio-inspired)
const DEFAULT_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#64748b", // slate
];

// Status colors (semantic)
export const STATUS_COLORS = [
  { color: "#3b82f6", label: "Blue" },    // Lead
  { color: "#ec4899", label: "Pink" },    // In Progress
  { color: "#22c55e", label: "Green" },   // Won
  { color: "#ef4444", label: "Red" },     // Lost
  { color: "#f59e0b", label: "Amber" },   // Warning
  { color: "#8b5cf6", label: "Purple" },  // Review
  { color: "#64748b", label: "Gray" },    // Neutral
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  colors = DEFAULT_COLORS,
  size = "md",
  className,
}: ColorPickerProps) {
  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  const checkSize = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {colors.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          className={cn(
            "rounded-md flex items-center justify-center transition-all",
            "hover:scale-110 hover:ring-2 hover:ring-white/20",
            sizeClasses[size],
            value === color && "ring-2 ring-white/50"
          )}
          style={{ backgroundColor: color }}
          title={color}
        >
          {value === color && (
            <Check className={cn("text-white drop-shadow", checkSize[size])} />
          )}
        </button>
      ))}
    </div>
  );
}

// Dropdown color picker
interface ColorPickerDropdownProps extends ColorPickerProps {
  trigger?: React.ReactNode;
}

export function ColorPickerDropdown({
  value,
  onChange,
  colors = DEFAULT_COLORS,
  size = "md",
  trigger,
  className,
}: ColorPickerDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "rounded-md border border-slate-600 transition-all hover:border-slate-500",
          sizeClasses[size]
        )}
        style={{ backgroundColor: value }}
      >
        {trigger}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={cn(
              "absolute z-50 mt-2 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-xl",
              className
            )}
          >
            <ColorPicker
              value={value}
              onChange={(color) => {
                onChange(color);
                setIsOpen(false);
              }}
              colors={colors}
              size={size}
            />
          </div>
        </>
      )}
    </div>
  );
}

// Color dot indicator
interface ColorDotProps {
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ColorDot({ color, size = "md", className }: ColorDotProps) {
  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  return (
    <span
      className={cn("rounded-full inline-block", sizeClasses[size], className)}
      style={{ backgroundColor: color }}
    />
  );
}
