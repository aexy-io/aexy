"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Search, Plus, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMAttribute, CRMAttributeType } from "@/lib/api";
import { AttributeRow } from "./AttributeRow";

interface AttributeListProps {
  attributes: CRMAttribute[];
  onReorder?: (attributes: CRMAttribute[]) => void;
  onEdit?: (attribute: CRMAttribute) => void;
  onDelete?: (attribute: CRMAttribute) => void;
  onAdd?: () => void;
  isLoading?: boolean;
  className?: string;
}

const typeFilters: { value: CRMAttributeType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "status", label: "Status" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "checkbox", label: "Checkbox" },
];

export function AttributeList({
  attributes,
  onReorder,
  onEdit,
  onDelete,
  onAdd,
  isLoading = false,
  className,
}: AttributeListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<CRMAttributeType | "all">("all");
  const [showSystemAttrs, setShowSystemAttrs] = useState(false);

  // Sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Filter attributes
  const filteredAttributes = useMemo(() => {
    return attributes.filter((attr) => {
      // Filter by search query
      const matchesSearch =
        searchQuery === "" ||
        attr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        attr.slug.toLowerCase().includes(searchQuery.toLowerCase());

      // Filter by type
      const matchesType = typeFilter === "all" || attr.attribute_type === typeFilter;

      // Filter by system status
      const matchesSystem = showSystemAttrs || !attr.is_system;

      return matchesSearch && matchesType && matchesSystem;
    });
  }, [attributes, searchQuery, typeFilter, showSystemAttrs]);

  // Separate user and system attributes
  const userAttributes = filteredAttributes.filter((a) => !a.is_system);
  const systemAttributes = filteredAttributes.filter((a) => a.is_system);

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = userAttributes.findIndex((a) => a.id === active.id);
      const newIndex = userAttributes.findIndex((a) => a.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(userAttributes, oldIndex, newIndex);
        // Combine with system attributes
        onReorder?.([...reordered, ...systemAttributes]);
      }
    }
  };

  // Handle delete
  const handleDelete = (attribute: CRMAttribute) => {
    if (attribute.is_system) {
      alert("System attributes cannot be deleted");
      return;
    }
    if (confirm(`Delete "${attribute.name}" attribute?`)) {
      onDelete?.(attribute);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search attributes..."
            className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Type filter */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CRMAttributeType | "all")}
            className="pl-3 pr-8 py-2 bg-muted border border-border rounded-lg text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {typeFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
          <Filter className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>

        {/* Show system toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showSystemAttrs}
            onChange={(e) => setShowSystemAttrs(e.target.checked)}
            className="w-4 h-4 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
          />
          <span className="text-sm text-muted-foreground">Show system</span>
        </label>

        {/* Add button */}
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Attribute
          </button>
        )}
      </div>

      {/* Attribute count */}
      <div className="text-sm text-muted-foreground">
        {filteredAttributes.length} of {attributes.length} attributes
        {searchQuery && ` matching "${searchQuery}"`}
      </div>

      {/* User attributes (draggable) */}
      {userAttributes.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={userAttributes.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {userAttributes.map((attr) => (
                <AttributeRow
                  key={attr.id}
                  attribute={attr}
                  onEdit={onEdit}
                  onDelete={handleDelete}
                  isDraggable={Boolean(onReorder)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* System attributes (not draggable) */}
      {showSystemAttrs && systemAttributes.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-border">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            System Attributes
          </h4>
          {systemAttributes.map((attr) => (
            <AttributeRow
              key={attr.id}
              attribute={attr}
              isDraggable={false}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {filteredAttributes.length === 0 && (
        <div className="text-center py-12 bg-muted/30 rounded-xl border border-border">
          <p className="text-muted-foreground mb-2">No attributes found</p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-sm text-purple-400 hover:text-purple-300"
            >
              Clear search
            </button>
          )}
        </div>
      )}
    </div>
  );
}
