"use client";

import { useState, useMemo, useCallback } from "react";
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
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Check, X, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMAttribute, CRMRecord } from "@/lib/api";
import { ColumnHeader, SimpleColumnHeader } from "./ColumnHeader";
import { ColumnSelector } from "./ColumnSelector";
import { StatusBadge } from "./CRMBadge";

// Value renderer for different attribute types
function RecordValue({ value, attribute }: { value: unknown; attribute?: CRMAttribute }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-500">—</span>;
  }

  const type = attribute?.attribute_type || "text";

  switch (type) {
    case "checkbox":
      return value ? (
        <Check className="h-4 w-4 text-green-400" />
      ) : (
        <X className="h-4 w-4 text-slate-500" />
      );
    case "currency":
      return (
        <span className="text-green-400 font-medium">
          ${typeof value === "number" ? value.toLocaleString() : value}
        </span>
      );
    case "status":
    case "select": {
      const config = attribute?.config as { options?: { value: string; label: string; color?: string }[] } | undefined;
      const option = config?.options?.find((o) => o.value === value);
      const color = option?.color || "#6366f1";
      return (
        <StatusBadge label={option?.label || String(value)} color={color} />
      );
    }
    case "email":
      return (
        <a href={`mailto:${value}`} className="text-blue-400 hover:underline">
          {String(value)}
        </a>
      );
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate max-w-[200px] inline-block">
          {String(value)}
        </a>
      );
    case "date":
    case "datetime":
      return <span>{new Date(String(value)).toLocaleDateString()}</span>;
    case "rating": {
      const numValue = typeof value === "number" ? value : 0;
      return (
        <span className="text-yellow-400">
          {"★".repeat(numValue)}
          {"☆".repeat(5 - numValue)}
        </span>
      );
    }
    case "phone":
      return (
        <a href={`tel:${value}`} className="text-slate-300 hover:text-white">
          {String(value)}
        </a>
      );
    default:
      return <span className="truncate max-w-xs">{String(value)}</span>;
  }
}

interface DataTableProps {
  records: CRMRecord[];
  attributes: CRMAttribute[];
  isLoading?: boolean;
  emptyMessage?: string;
  // Column management
  visibleColumns?: string[];
  onVisibleColumnsChange?: (columns: string[]) => void;
  columnOrder?: string[];
  onColumnOrderChange?: (order: string[]) => void;
  columnWidths?: Record<string, number>;
  onColumnWidthChange?: (slug: string, width: number) => void;
  // Sorting
  sortConfig?: { attribute: string; direction: "asc" | "desc" } | null;
  onSort?: (attribute: string) => void;
  // Selection
  selectedRecords?: string[];
  onSelectRecord?: (recordId: string) => void;
  onSelectAll?: () => void;
  // Actions
  onRecordClick?: (record: CRMRecord) => void;
  onRecordDelete?: (recordId: string) => void;
  // Features
  enableColumnReorder?: boolean;
  enableColumnResize?: boolean;
  enableColumnSelector?: boolean;
  showCheckboxes?: boolean;
  showActions?: boolean;
  className?: string;
}

export function DataTable({
  records,
  attributes,
  isLoading = false,
  emptyMessage = "No records",
  visibleColumns: externalVisibleColumns,
  onVisibleColumnsChange,
  columnOrder: externalColumnOrder,
  onColumnOrderChange,
  columnWidths = {},
  onColumnWidthChange,
  sortConfig,
  onSort,
  selectedRecords = [],
  onSelectRecord,
  onSelectAll,
  onRecordClick,
  onRecordDelete,
  enableColumnReorder = true,
  enableColumnResize = false,
  enableColumnSelector = true,
  showCheckboxes = true,
  showActions = true,
  className,
}: DataTableProps) {
  // Internal state for uncontrolled mode
  const [internalVisibleColumns, setInternalVisibleColumns] = useState<string[]>(() =>
    attributes.filter((a) => !a.is_system).slice(0, 5).map((a) => a.slug)
  );
  const [internalColumnOrder, setInternalColumnOrder] = useState<string[]>(() =>
    attributes.filter((a) => !a.is_system).map((a) => a.slug)
  );

  // Use external or internal state
  const visibleColumns = externalVisibleColumns ?? internalVisibleColumns;
  const setVisibleColumns = onVisibleColumnsChange ?? setInternalVisibleColumns;
  const columnOrder = externalColumnOrder ?? internalColumnOrder;
  const setColumnOrder = onColumnOrderChange ?? setInternalColumnOrder;

  // Get visible attributes in order
  const visibleAttributes = useMemo(() => {
    const slugSet = new Set(visibleColumns);
    const ordered = columnOrder.filter((slug) => slugSet.has(slug));
    // Add any visible columns not in order at the end
    visibleColumns.forEach((slug) => {
      if (!ordered.includes(slug)) ordered.push(slug);
    });
    return ordered
      .map((slug) => attributes.find((a) => a.slug === slug))
      .filter((a): a is CRMAttribute => a !== undefined);
  }, [attributes, visibleColumns, columnOrder]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Handle column reorder
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = columnOrder.indexOf(active.id as string);
      const newIndex = columnOrder.indexOf(over.id as string);
      setColumnOrder(arrayMove(columnOrder, oldIndex, newIndex));
    }
  };

  // Toggle column visibility
  const handleToggleColumn = useCallback((slug: string) => {
    if (visibleColumns.includes(slug)) {
      setVisibleColumns(visibleColumns.filter((s) => s !== slug));
    } else {
      setVisibleColumns([...visibleColumns, slug]);
    }
  }, [visibleColumns, setVisibleColumns]);

  // Show/hide all columns
  const handleShowAll = useCallback(() => {
    setVisibleColumns(attributes.filter((a) => !a.is_system).map((a) => a.slug));
  }, [attributes, setVisibleColumns]);

  const handleHideAll = useCallback(() => {
    setVisibleColumns([]);
  }, [setVisibleColumns]);

  // Handle column resize
  const handleResize = (slug: string, width: number) => {
    onColumnWidthChange?.(slug, width);
  };

  const isAllSelected = records.length > 0 && selectedRecords.length === records.length;

  return (
    <div className={cn("bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                {/* Checkbox column */}
                {showCheckboxes && (
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={onSelectAll}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
                    />
                  </th>
                )}

                {/* Name column (always first) */}
                <SimpleColumnHeader
                  label="Name"
                  sortDirection={sortConfig?.attribute === "display_name" ? sortConfig.direction : null}
                  onSort={() => onSort?.("display_name")}
                />

                {/* Dynamic columns */}
                <SortableContext
                  items={visibleAttributes.map((a) => a.slug)}
                  strategy={horizontalListSortingStrategy}
                  disabled={!enableColumnReorder}
                >
                  {visibleAttributes.map((attr) => (
                    <ColumnHeader
                      key={attr.slug}
                      id={attr.slug}
                      label={attr.name}
                      sortDirection={sortConfig?.attribute === attr.slug ? sortConfig.direction : null}
                      onSort={() => onSort?.(attr.slug)}
                      onHide={() => handleToggleColumn(attr.slug)}
                      isDraggable={enableColumnReorder}
                      isResizable={enableColumnResize}
                      width={columnWidths[attr.slug]}
                      onResize={(width) => handleResize(attr.slug, width)}
                    />
                  ))}
                </SortableContext>

                {/* Add column button */}
                {enableColumnSelector && (
                  <ColumnSelector
                    attributes={attributes}
                    visibleColumns={visibleColumns}
                    onToggleColumn={handleToggleColumn}
                    onShowAll={handleShowAll}
                    onHideAll={handleHideAll}
                  />
                )}

                {/* Actions column */}
                {showActions && <th className="w-20 px-4 py-3" />}
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={visibleAttributes.length + (showCheckboxes ? 1 : 0) + (showActions ? 1 : 0) + (enableColumnSelector ? 1 : 0) + 1}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    Loading records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleAttributes.length + (showCheckboxes ? 1 : 0) + (showActions ? 1 : 0) + (enableColumnSelector ? 1 : 0) + 1}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors"
                  >
                    {/* Checkbox */}
                    {showCheckboxes && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedRecords.includes(record.id)}
                          onChange={() => onSelectRecord?.(record.id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
                        />
                      </td>
                    )}

                    {/* Name */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onRecordClick?.(record)}
                        className="text-white font-medium hover:text-purple-400 transition-colors text-left"
                      >
                        {record.display_name || "Untitled"}
                      </button>
                    </td>

                    {/* Dynamic columns */}
                    {visibleAttributes.map((attr) => (
                      <td
                        key={attr.slug}
                        className="px-4 py-3 text-slate-300"
                        style={{ width: columnWidths[attr.slug] ? `${columnWidths[attr.slug]}px` : undefined }}
                      >
                        <RecordValue value={record.values[attr.slug]} attribute={attr} />
                      </td>
                    ))}

                    {/* Column selector spacer */}
                    {enableColumnSelector && <td className="px-2 py-3" />}

                    {/* Actions */}
                    {showActions && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onRecordClick?.(record)}
                            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {onRecordDelete && (
                            <button
                              onClick={() => onRecordDelete(record.id)}
                              className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DndContext>
      </div>

      {/* Footer with record count */}
      {!isLoading && records.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-700 text-sm text-slate-500">
          {records.length} record{records.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
