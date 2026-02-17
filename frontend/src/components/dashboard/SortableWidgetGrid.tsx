"use client";

import { ReactNode, useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface SortableWidgetGridProps {
  widgetOrder: string[];
  onReorder: (activeId: string, overId: string) => void;
  isEditing: boolean;
  children?: (widgetId: string) => ReactNode;
  renderWidget: (widgetId: string) => ReactNode;
  getGridClass?: (widgetId: string) => string;
}

interface SortableWidgetProps {
  id: string;
  isEditing: boolean;
  children: ReactNode;
  className?: string;
}

function SortableWidget({ id, isEditing, children, className = "" }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative group ${className}`}>
      {isEditing && (
        <button
          className="absolute top-2 right-2 z-10 p-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </button>
      )}
      {children}
    </div>
  );
}

export function SortableWidgetGrid({
  widgetOrder,
  onReorder,
  isEditing,
  renderWidget,
  getGridClass,
}: SortableWidgetGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState(widgetOrder);

  // Sync local state when the prop changes (e.g. after server confirms)
  useEffect(() => {
    setLocalOrder(widgetOrder);
  }, [widgetOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = localOrder.indexOf(active.id as string);
      const newIndex = localOrder.indexOf(over.id as string);

      // Update local state immediately so the DOM reorders before dnd-kit resets transforms
      setLocalOrder((prev) => arrayMove(prev, oldIndex, newIndex));

      // Propagate widget IDs to parent for persistence
      onReorder(active.id as string, over.id as string);
    }
  };

  // Filter out null renders (composite children that get skipped)
  const renderableWidgets = localOrder.filter(
    (id) => renderWidget(id) !== null
  );

  if (!isEditing) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {renderableWidgets.map((widgetId,index) => (
          <div key={widgetId+index} className={getGridClass?.(widgetId) || ""}>{renderWidget(widgetId)}</div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={renderableWidgets} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {renderableWidgets.map((widgetId,index) => (
            <SortableWidget key={widgetId+index} id={widgetId} isEditing={isEditing} className={getGridClass?.(widgetId) || ""}>
              {renderWidget(widgetId)}
            </SortableWidget>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId ? (
          <div className="opacity-80 shadow-2xl">
            {renderWidget(activeId)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Simpler version for grid layouts with multiple columns
 */
interface SortableGridItemProps {
  id: string;
  isEditing: boolean;
  children: ReactNode;
  className?: string;
}

export function SortableGridItem({
  id,
  isEditing,
  children,
  className = "",
}: SortableGridItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative group ${className}`}>
      {isEditing && (
        <div
          className="absolute top-2 right-2 z-10 p-1.5 bg-slate-800/90 border border-slate-700 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Hook for using sortable grid in custom layouts
 */
export function useSortableGrid(
  items: string[],
  onReorder: (fromIndex: number, toIndex: number) => void
) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      onReorder(oldIndex, newIndex);
    }
  };

  return {
    activeId,
    sensors,
    handleDragStart,
    handleDragEnd,
  };
}
