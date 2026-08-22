"use client";

import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

/*
  Widgets are as tall as their contents, and the grid packs around them.

  The grid used to force every card in a row to the height of the tallest one
  (`[&>*]:h-full` plus `flex-1` on the card's last section). With "My Work"
  setting a 669px row, "Work by type" — five bars, 295px of content — was
  stretched to 669 and drew 374px of empty card. Two of those voids were
  visible above the fold at 1600×900.

  Instead each item now spans as many 1px rows as its content actually needs,
  and `grid-flow-row-dense` backfills the holes that leaves, so a short widget
  rises to sit beside a tall one rather than being inflated to match it.

  The row gap is baked into the span (ROW_GAP below) rather than set with
  `gap-y`, because a real row gap would quantise every card to a multiple of
  the gap. Column gap stays a normal `gap-x-4`.
*/
const ROW_GAP = 16;

const GRID_CLASS =
  "grid grid-flow-row-dense grid-cols-1 gap-x-4 [grid-auto-rows:1px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/**
 * How many 1px grid rows this item's content occupies.
 *
 * The setState bails out when the number has not changed. That is not a
 * micro-optimisation: a ResizeObserver that sets state unconditionally, on an
 * element whose height that state controls, is an infinite render loop, and
 * this is exactly that shape.
 */
function useContentRowSpan() {
  // Measures an inner wrapper, never the grid item: the grid item's height is
  // what this hook sets, so measuring it would feed the span back into itself.
  const ref = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState<number | null>(null);

  const measure = useCallback(() => {
    const content = ref.current;
    if (!content) return;
    const height = content.getBoundingClientRect().height;
    // 0 means the widget returned null — Sprint Overview with no sprint, say.
    // Kept distinct from "one row of content" so the style below can collapse
    // the item instead of leaving a ROW_GAP-tall sliver in the grid.
    const next = height === 0 ? 0 : Math.ceil(height + ROW_GAP);
    setSpan((prev) => (prev === next ? prev : next));
  }, []);

  useLayoutEffect(() => {
    const content = ref.current;
    if (!content) return;
    // No explicit first measure: ResizeObserver delivers one for every element
    // the moment it is observed, and that callback runs after layout but
    // before paint — so the span is set for the first frame either way, and
    // this stays off the wrong side of react-hooks/set-state-in-effect.
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    return () => ro.disconnect();
  }, [measure]);

  /*
    `null` until measured: the item keeps auto placement for that first pass,
    so nothing is collapsed to a sliver before the first measurement.

    `0` means the widget rendered nothing. The item collapses to a single 1px
    row, which is invisible — and, unlike `display: none`, still participates
    in layout. That matters: a hidden element measures 0 forever, so a widget
    that starts empty and later has something to show (Sprint Overview once
    its team query resolves) could never measure its way back into view.
    `overflow: hidden` covers the one frame between content appearing and the
    span catching up; it is only ever set while the item is empty, so it can
    never clip a real widget's menus.
  */
  const style =
    span === null
      ? undefined
      : span === 0
        ? ({ gridRowEnd: "span 1", overflow: "hidden" } as const)
        : ({ gridRowEnd: `span ${span}` } as const);

  return { ref, style };
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
  const { ref: measureRef, style: spanStyle } = useContentRowSpan();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...spanStyle,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative group ${className}`}>
      {isEditing && (
        <button
          className="absolute top-2 right-2 z-10 p-1.5 bg-muted border border-border rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      <div ref={measureRef}>{children}</div>
    </div>
  );
}

/** The read-only grid's item: same span behaviour, no drag machinery. */
function MasonryItem({ className, children }: { className: string; children: ReactNode }) {
  const { ref, style } = useContentRowSpan();
  return (
    <div style={style} className={className}>
      <div ref={ref}>{children}</div>
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
      <div className={GRID_CLASS}>
        {renderableWidgets.map((widgetId, index) => (
          <MasonryItem key={widgetId + index} className={getGridClass?.(widgetId) || ""}>
            {renderWidget(widgetId)}
          </MasonryItem>
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
        <div className={GRID_CLASS}>
          {renderableWidgets.map((widgetId, index) => (
            <SortableWidget
              key={widgetId + index}
              id={widgetId}
              isEditing={isEditing}
              className={getGridClass?.(widgetId) || ""}
            >
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
          className="absolute top-2 right-2 z-10 p-1.5 bg-muted/90 border border-border rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
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
