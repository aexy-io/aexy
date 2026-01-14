"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMRecord, CRMAttribute } from "@/lib/api";

interface KanbanCardProps {
  record: CRMRecord;
  attributes?: CRMAttribute[];
  onClick?: (record: CRMRecord) => void;
  onMenuClick?: (record: CRMRecord, e: React.MouseEvent) => void;
  showOwner?: boolean;
  highlightAttributes?: string[]; // attribute slugs to show
  className?: string;
}

export function KanbanCard({
  record,
  attributes = [],
  onClick,
  onMenuClick,
  showOwner = true,
  highlightAttributes = [],
  className,
}: KanbanCardProps) {
  const {
    attributes: dragAttributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: record.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Get attribute values to display
  const displayValues = highlightAttributes
    .map((slug) => {
      const attr = attributes.find((a) => a.slug === slug);
      const value = record.values[slug];
      if (!attr || value === null || value === undefined) return null;
      return { attr, value: value as unknown };
    })
    .filter((v): v is { attr: CRMAttribute; value: unknown } => v !== null)
    .slice(0, 3); // Max 3 fields

  // Format value for display
  const formatValue = (value: unknown, attr: CRMAttribute): string => {
    if (attr.attribute_type === "currency" && typeof value === "number") {
      return `$${value.toLocaleString()}`;
    }
    if (attr.attribute_type === "date" || attr.attribute_type === "datetime") {
      return new Date(String(value)).toLocaleDateString();
    }
    return String(value);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragAttributes}
      className={cn(
        "bg-slate-800 border border-slate-700 rounded-lg p-3 cursor-pointer",
        "hover:border-slate-600 hover:bg-slate-800/80 transition-all",
        "group",
        isDragging && "opacity-50 shadow-lg ring-2 ring-purple-500/50",
        className
      )}
      onClick={() => onClick?.(record)}
    >
      {/* Header with drag handle and menu */}
      <div className="flex items-start gap-2 mb-2">
        <button
          {...listeners}
          className="p-0.5 -ml-1 cursor-grab opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <h4 className="flex-1 font-medium text-white text-sm truncate">
          {record.display_name || "Untitled"}
        </h4>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick?.(record, e);
          }}
          className="p-0.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Display values */}
      {displayValues.length > 0 && (
        <div className="space-y-1 mb-2">
          {displayValues.map(({ attr, value }) => (
            <div key={attr.slug} className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 truncate">{attr.name}:</span>
              <span className="text-slate-300 truncate">{formatValue(value, attr)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer with owner */}
      {showOwner && record.owner && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-700/50">
          <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
            <User className="h-3 w-3 text-purple-400" />
          </div>
          <span className="text-xs text-slate-400 truncate">
            {record.owner.name || "Unknown"}
          </span>
        </div>
      )}
    </div>
  );
}

// Skeleton for loading state
export function KanbanCardSkeleton() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 animate-pulse">
      <div className="h-4 w-3/4 bg-slate-700 rounded mb-2" />
      <div className="h-3 w-1/2 bg-slate-700 rounded mb-1" />
      <div className="h-3 w-2/3 bg-slate-700 rounded" />
    </div>
  );
}
