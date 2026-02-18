"use client";

import { useState } from "react";
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings } from "lucide-react";
import {
  DASHBOARD_WIDGETS,
} from "@/config/dashboardWidgets";

// Icon map for widget icons
import {
  User,
  BarChart3,
  Target,
  Code,
  Activity,
  Layers,
  Wrench,
  Sparkles,
  Heart,
  TrendingUp,
  Users,
  Shuffle,
  CheckCircle,
  Clock,
  Calendar,
  Ticket,
  FormInput,
  FileText,
  ClipboardCheck,
  GraduationCap,
  Building2,
  DollarSign,
  Eye,
  Bot,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  User, BarChart3, Target, Code, Activity, Layers, Wrench, Sparkles,
  Heart, TrendingUp, Users, Shuffle, CheckCircle, Clock, Calendar,
  Ticket, FormInput, FileText, ClipboardCheck, GraduationCap,
  Building2, DollarSign, Eye, Settings, Bot,
};

interface WidgetReorderListProps {
  widgetOrder: string[];
  onReorder: (newOrder: string[]) => void;
  isLoading?: boolean;
}

interface SortableItemProps {
  id: string;
  isLoading?: boolean;
}

function SortableItem({ id, isLoading }: SortableItemProps) {
  const widget = DASHBOARD_WIDGETS[id];
  const name = widget?.name || id;
  const iconName = widget?.icon || "Settings";
  const Icon = ICON_MAP[iconName] || Settings;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isLoading });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50 ${
        isDragging ? "shadow-lg" : ""
      } ${isLoading ? "opacity-50" : ""}`}
    >
      <button
        className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="text-sm text-foreground flex-1">{name}</span>
      {widget?.defaultSize && (
        <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
          {widget.defaultSize}
        </span>
      )}
    </div>
  );
}

export function WidgetReorderList({
  widgetOrder,
  onReorder,
  isLoading,
}: WidgetReorderListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
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
      const oldIndex = widgetOrder.indexOf(active.id as string);
      const newIndex = widgetOrder.indexOf(over.id as string);
      const newOrder = arrayMove(widgetOrder, oldIndex, newIndex);
      onReorder(newOrder);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Drag and drop to reorder your dashboard widgets.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {widgetOrder.map((widgetId) => (
              <SortableItem key={widgetId} id={widgetId} isLoading={isLoading} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeId ? (
            <div className="opacity-90 shadow-2xl">
              <SortableItem id={activeId} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
