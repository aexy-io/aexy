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
    <div className={cn("flex bg-muted border border-border rounded-lg p-1", className)}>
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
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
    <div className={cn("flex bg-muted border border-border rounded-lg p-1", className)}>
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
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
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
