"use client";

import { useState, ReactNode } from "react";
import { ChevronRight, Plus } from "lucide-react";

interface SidebarSectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  onAdd?: () => void;
  addTooltip?: string;
  count?: number;
}

export function SidebarSection({
  title,
  icon,
  children,
  defaultExpanded = true,
  onAdd,
  addTooltip,
  count,
}: SidebarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="py-1">
      {/* Section Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 group cursor-pointer hover:bg-accent/50 rounded-md mx-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
          {typeof count === "number" && count > 0 && (
            <span className="text-xs text-muted-foreground ml-1">({count})</span>
          )}
        </div>

        {onAdd && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-accent rounded transition-opacity"
            title={addTooltip}
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Section Content */}
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-1 py-0.5">{children}</div>
      </div>
    </div>
  );
}
