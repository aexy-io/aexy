"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMRecord, CRMAttribute } from "@/lib/api";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";

interface StatusOption {
  value: string;
  label: string;
  color: string;
}

interface KanbanBoardProps {
  records: CRMRecord[];
  attributes: CRMAttribute[];
  statusAttribute?: string; // slug of status attribute to group by
  onRecordClick?: (record: CRMRecord) => void;
  onRecordUpdate?: (recordId: string, values: Record<string, unknown>) => Promise<void>;
  onCreateInStage?: (stage: string) => void;
  highlightAttributes?: string[];
  isLoading?: boolean;
  className?: string;
}

export function KanbanBoard({
  records,
  attributes,
  statusAttribute,
  onRecordClick,
  onRecordUpdate,
  onCreateInStage,
  highlightAttributes = [],
  isLoading = false,
  className,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Find the status attribute
  const statusAttr = useMemo(() => {
    if (statusAttribute) {
      return attributes.find((a) => a.slug === statusAttribute);
    }
    // Auto-detect first status attribute
    return attributes.find((a) => a.attribute_type === "status");
  }, [attributes, statusAttribute]);

  // Get status options from attribute config
  const statusOptions = useMemo((): StatusOption[] => {
    if (!statusAttr) return [];
    const config = statusAttr.config as { options?: StatusOption[] } | undefined;
    return config?.options || [];
  }, [statusAttr]);

  // Group records by status
  const recordsByStatus = useMemo(() => {
    const groups: Record<string, CRMRecord[]> = {};

    // Initialize all status groups
    statusOptions.forEach((opt) => {
      groups[opt.value] = [];
    });

    // Add "No Status" group for records without status
    groups["__no_status__"] = [];

    // Group records
    records.forEach((record) => {
      const statusValue = statusAttr ? record.values[statusAttr.slug] : null;
      const key = statusValue && typeof statusValue === "string" ? statusValue : "__no_status__";
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(record);
    });

    return groups;
  }, [records, statusAttr, statusOptions]);

  // Get the active record for drag overlay
  const activeRecord = useMemo(() => {
    if (!activeId) return null;
    return records.find((r) => r.id === activeId);
  }, [activeId, records]);

  // Sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over || !statusAttr) return;

    const recordId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a column (status value) or another card
    const isColumn = statusOptions.some((opt) => opt.value === overId) || overId === "__no_status__";

    let newStatus: string | null = null;

    if (isColumn) {
      // Dropped directly on a column
      newStatus = overId === "__no_status__" ? null : overId;
    } else {
      // Dropped on another card - find which column it belongs to
      const targetRecord = records.find((r) => r.id === overId);
      if (targetRecord) {
        const targetStatus = targetRecord.values[statusAttr.slug];
        newStatus = typeof targetStatus === "string" ? targetStatus : null;
      }
    }

    // Get current record status
    const currentRecord = records.find((r) => r.id === recordId);
    const currentStatus = currentRecord?.values[statusAttr.slug];

    // Only update if status changed
    if (currentStatus !== newStatus) {
      await onRecordUpdate?.(recordId, { [statusAttr.slug]: newStatus });
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  // No status attribute found
  if (!statusAttr) {
    return (
      <div className={cn("flex items-center justify-center h-64 text-muted-foreground", className)}>
        <div className="text-center">
          <p className="mb-2">No status field found</p>
          <p className="text-sm text-muted-foreground">
            Add a status attribute to this object to use the board view
          </p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className={cn(
          "flex gap-4 overflow-x-auto pb-4",
          "scrollbar-thin scrollbar-thumb-border scrollbar-track-muted",
          className
        )}
      >
        {statusOptions.map((option) => (
          <KanbanColumn
            key={option.value}
            id={option.value}
            title={option.label}
            color={option.color}
            records={recordsByStatus[option.value] || []}
            attributes={attributes}
            highlightAttributes={highlightAttributes}
            onRecordClick={onRecordClick}
            onCreateClick={onCreateInStage ? () => onCreateInStage(option.value) : undefined}
            isLoading={isLoading}
          />
        ))}

        {/* No Status column */}
        {recordsByStatus["__no_status__"]?.length > 0 && (
          <KanbanColumn
            id="__no_status__"
            title="No Status"
            color="#64748b"
            records={recordsByStatus["__no_status__"]}
            attributes={attributes}
            highlightAttributes={highlightAttributes}
            onRecordClick={onRecordClick}
            isLoading={isLoading}
          />
        )}

        {/* Add stage button (placeholder) */}
        <div className="flex-shrink-0 w-[300px] flex items-start">
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            onClick={() => {
              // Could open a modal to add new status options
              alert("Add stage configuration coming soon");
            }}
          >
            <Plus className="h-4 w-4" />
            Add stage
          </button>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeRecord && (
          <div className="transform rotate-3 shadow-2xl">
            <KanbanCard
              record={activeRecord}
              attributes={attributes}
              highlightAttributes={highlightAttributes}
              className="opacity-90"
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
