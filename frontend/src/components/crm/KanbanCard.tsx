"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMRecord, CRMAttribute } from "@/lib/api";
import { FieldRenderer } from "@/components/fields";

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragAttributes}
      {...listeners}
      className={cn(
        // Only colours transition. A catch-all transition also eased the
        // card's position, so it lagged behind the cursor while dragging
        // instead of tracking it.
        "bg-muted border border-border rounded-lg p-3 cursor-pointer",
        "hover:border-border hover:bg-muted/80 transition-colors",
        // select-none: without it the browser begins selecting the card's text
        // as soon as you press and move, so the gesture becomes a text
        // selection instead of a drag.
        "group touch-none select-none",
        isDragging && "opacity-50 shadow-lg ring-2 ring-purple-500/50",
        className
      )}
      onClick={() => onClick?.(record)}
    >
      <KanbanCardBody
        record={record}
        attributes={attributes}
        showOwner={showOwner}
        highlightAttributes={highlightAttributes}
        onMenuClick={onMenuClick}
      />
    </div>
  );
}

/** The card's visuals with no drag wiring.
 *
 * The floating card shown while dragging must use this, not the draggable
 * card: rendering the draggable one registered the same record twice at
 * once, and the copy meant to follow the cursor was simultaneously trying to
 * sit in the list, so it barely moved.
 */
export function KanbanCardBody({
  record,
  attributes = [],
  onMenuClick,
  showOwner = true,
  highlightAttributes = [],
}: Omit<KanbanCardProps, "onClick" | "className">) {
  const displayValues = highlightAttributes
    .map((slug) => {
      const attr = attributes.find((a) => a.slug === slug);
      const value = record.values[slug];
      if (!attr || value === null || value === undefined) return null;
      return { attr, value: value as unknown };
    })
    .filter((v): v is { attr: CRMAttribute; value: unknown } => v !== null)
    .slice(0, 3);

  return (
    <>
      {/* Header with drag handle and menu */}
      <div className="flex items-start gap-2 mb-2">
        <button
          aria-hidden
          tabIndex={-1}
          className="p-0.5 -ml-1 cursor-grab opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <h4 className="flex-1 font-medium text-foreground text-sm truncate">
          {record.display_name || "Untitled"}
        </h4>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick?.(record, e);
          }}
          className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Display values */}
      {displayValues.length > 0 && (
        <div className="space-y-1 mb-2">
          {displayValues.map(({ attr, value }) => (
            <div key={attr.slug} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground truncate">{attr.name}:</span>
              <span className="text-foreground truncate">
                <FieldRenderer value={value} attribute={attr} surface="kanban_card" />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer with owner */}
      {showOwner && record.owner && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
          <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
            <User className="h-3 w-3 text-purple-400" />
          </div>
          <span className="text-xs text-muted-foreground truncate">
            {record.owner.name || "Unknown"}
          </span>
        </div>
      )}
    </>
  );
}

// Skeleton for loading state
export function KanbanCardSkeleton() {
  return (
    <div className="bg-muted border border-border rounded-lg p-3 animate-pulse">
      <div className="h-4 w-3/4 bg-accent rounded mb-2" />
      <div className="h-3 w-1/2 bg-accent rounded mb-1" />
      <div className="h-3 w-2/3 bg-accent rounded" />
    </div>
  );
}
