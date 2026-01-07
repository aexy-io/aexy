"use client";

import { LayoutGrid, List, Kanban, Calendar, GalleryHorizontalEnd } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "table" | "board" | "gallery" | "calendar";

interface ViewSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  availableViews?: ViewMode[];
  className?: string;
}

const viewConfig: Record<ViewMode, { icon: React.ElementType; label: string }> = {
  table: { icon: List, label: "Table" },
  board: { icon: Kanban, label: "Board" },
  gallery: { icon: GalleryHorizontalEnd, label: "Gallery" },
  calendar: { icon: Calendar, label: "Calendar" },
};

export function ViewSwitcher({
  value,
  onChange,
  availableViews = ["table", "board"],
  className,
}: ViewSwitcherProps) {
  return (
    <div className={cn("flex bg-slate-800 border border-slate-700 rounded-lg p-1", className)}>
      {availableViews.map((mode) => {
        const config = viewConfig[mode];
        const Icon = config.icon;
        const isActive = value === mode;

        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
            title={config.label}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Compact icon-only version
export function ViewSwitcherCompact({
  value,
  onChange,
  availableViews = ["table", "board"],
  className,
}: ViewSwitcherProps) {
  return (
    <div className={cn("flex bg-slate-800 border border-slate-700 rounded-lg p-1", className)}>
      {availableViews.map((mode) => {
        const config = viewConfig[mode];
        const Icon = config.icon;
        const isActive = value === mode;

        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={cn(
              "p-2 rounded transition-colors",
              isActive
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            )}
            title={config.label}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
