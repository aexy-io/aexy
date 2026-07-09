"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
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
import { Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMAttribute, CRMRecord, ColumnDisplayConfig } from "@/lib/api";
import { ColumnHeader, SimpleColumnHeader } from "./ColumnHeader";
import { ColumnSelector } from "./ColumnSelector";
import { FieldRenderer, FieldDisplayConfigPanel, InlineCell } from "@/components/fields";
import type { FieldDisplayConfig } from "@/components/fields";

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
  // Display variants (per-column display config from saved view)
  columnDisplayConfig?: ColumnDisplayConfig[];
  onColumnDisplayConfigChange?: (config: ColumnDisplayConfig[]) => void;
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
  enableInlineEdit?: boolean;
  onCellSave?: (recordId: string, slug: string, value: unknown) => Promise<void>;
  onAddColumn?: () => void;
  onDeleteColumn?: (slug: string) => void;
  onBulkDelete?: (recordIds: string[]) => void;
  showCheckboxes?: boolean;
  showActions?: boolean;
  showNameColumn?: boolean;
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
  columnDisplayConfig = [],
  onColumnDisplayConfigChange,
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
  enableInlineEdit = false,
  onCellSave,
  onAddColumn,
  onDeleteColumn,
  onBulkDelete,
  showCheckboxes = true,
  showActions = true,
  showNameColumn = true,
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
      .filter((a): a is CRMAttribute => a !== undefined)
      // The hardcoded "Name" column already renders the record's primary/system
      // name; drop any system attribute here so it isn't shown a second time
      // when a saved view's visible columns include it.
      .filter((a) => !(showNameColumn && a.is_system));
  }, [attributes, visibleColumns, columnOrder, showNameColumn]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  // Handle column reorder
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = columnOrder.indexOf(active.id as string);
      const newIndex = columnOrder.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        setColumnOrder(arrayMove(columnOrder, oldIndex, newIndex));
      }
    }
  };

  const activeDragAttribute = activeDragId
    ? visibleAttributes.find((a) => a.slug === activeDragId)
    : null;

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

  // Conditional formatting panel state
  const [formatPanelSlug, setFormatPanelSlug] = useState<string | null>(null);

  // Handle column resize
  const handleResize = (slug: string, width: number) => {
    onColumnWidthChange?.(slug, width);
  };

  // Get display config for a specific column
  const getColumnDisplayConfig = useCallback((slug: string): FieldDisplayConfig | undefined => {
    const cfg = columnDisplayConfig.find((c) => c.slug === slug);
    if (!cfg?.variant) return undefined;
    return { variant: cfg.variant };
  }, [columnDisplayConfig]);

  // Handle display variant change for a column
  const handleDisplayVariantChange = useCallback((slug: string, variant: string) => {
    if (!onColumnDisplayConfigChange) return;
    const existing = columnDisplayConfig.filter((c) => c.slug !== slug);
    onColumnDisplayConfigChange([...existing, { slug, variant }]);
  }, [columnDisplayConfig, onColumnDisplayConfigChange]);

  // Handle conditional format config update
  const handleConditionalFormatChange = useCallback((slug: string, displayCfg: FieldDisplayConfig) => {
    if (!onColumnDisplayConfigChange) return;
    const existing = columnDisplayConfig.filter((c) => c.slug !== slug);
    const current = columnDisplayConfig.find((c) => c.slug === slug);
    onColumnDisplayConfigChange([
      ...existing,
      {
        slug,
        variant: current?.variant,
        conditional_format: displayCfg.conditionalFormat as Record<string, unknown>[] | undefined,
      },
    ]);
    setFormatPanelSlug(null);
  }, [columnDisplayConfig, onColumnDisplayConfigChange]);

  const isAllSelected = records.length > 0 && selectedRecords.length === records.length;

  return (
    <div className={cn("bg-muted/50 border border-border rounded-xl overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {/* Checkbox column */}
                {showCheckboxes && (
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={onSelectAll}
                      className="w-4 h-4 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
                    />
                  </th>
                )}

                {/* Name column (CRM entities) */}
                {showNameColumn && (
                  <SimpleColumnHeader
                    label="Name"
                    sortDirection={sortConfig?.attribute === "display_name" ? sortConfig.direction : null}
                    onSort={() => onSort?.("display_name")}
                  />
                )}

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
                      fieldType={attr.attribute_type}
                      displayVariant={columnDisplayConfig.find((c) => c.slug === attr.slug)?.variant}
                      onDisplayVariantChange={onColumnDisplayConfigChange ? (v) => handleDisplayVariantChange(attr.slug, v) : undefined}
                      onConditionalFormat={onColumnDisplayConfigChange ? () => setFormatPanelSlug(attr.slug) : undefined}
                      onDelete={onDeleteColumn ? () => onDeleteColumn(attr.slug) : undefined}
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
                    onAddColumn={onAddColumn}
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
                    colSpan={visibleAttributes.length + (showCheckboxes ? 1 : 0) + (showActions ? 1 : 0) + (enableColumnSelector ? 1 : 0) + (showNameColumn ? 1 : 0)}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Loading records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleAttributes.length + (showCheckboxes ? 1 : 0) + (showActions ? 1 : 0) + (enableColumnSelector ? 1 : 0) + (showNameColumn ? 1 : 0)}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    {/* Checkbox */}
                    {showCheckboxes && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedRecords.includes(record.id)}
                          onChange={() => onSelectRecord?.(record.id)}
                          className="w-4 h-4 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
                        />
                      </td>
                    )}

                    {/* Name (CRM entities) */}
                    {showNameColumn && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onRecordClick?.(record)}
                          className="text-foreground font-medium hover:text-purple-400 transition-colors text-left"
                        >
                          {record.display_name || "Untitled"}
                        </button>
                      </td>
                    )}

                    {/* Dynamic columns */}
                    {visibleAttributes.map((attr) => (
                      <td
                        key={attr.slug}
                        className="px-4 py-3 text-foreground"
                        style={{ width: columnWidths[attr.slug] ? `${columnWidths[attr.slug]}px` : undefined }}
                      >
                        {enableInlineEdit && onCellSave ? (
                          <InlineCell
                            value={record.values[attr.slug]}
                            attribute={attr}
                            access="edit"
                            onSave={async (val) => onCellSave(record.id, attr.slug, val)}
                          />
                        ) : (
                          <FieldRenderer value={record.values[attr.slug]} attribute={attr} surface="table_cell" displayConfig={getColumnDisplayConfig(attr.slug)} />
                        )}
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
                            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {onRecordDelete && (
                            <button
                              onClick={() => onRecordDelete(record.id)}
                              className="p-1 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-400"
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
          <DragOverlay>
            {activeDragAttribute ? (
              <div className="px-4 py-3 bg-muted border border-purple-500 rounded-lg shadow-lg text-sm font-medium text-foreground">
                {activeDragAttribute.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Footer with record count or bulk action bar */}
      {!isLoading && records.length > 0 && (
        selectedRecords.length > 0 && onBulkDelete ? (
          <div className="px-4 py-2 border-t border-border flex items-center gap-3">
            <span className="text-sm text-foreground font-medium">
              {selectedRecords.length} selected
            </span>
            <button
              onClick={() => onBulkDelete(selectedRecords)}
              className="flex items-center gap-1 px-2 py-1 text-sm text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        ) : (
          <div className="px-4 py-2 border-t border-border text-sm text-muted-foreground">
            {records.length} record{records.length !== 1 ? "s" : ""}
          </div>
        )
      )}

      {/* Conditional formatting panel */}
      {formatPanelSlug && (() => {
        const attr = attributes.find((a) => a.slug === formatPanelSlug);
        if (!attr) return null;
        const cfg = columnDisplayConfig.find((c) => c.slug === formatPanelSlug);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <FieldDisplayConfigPanel
              fieldName={attr.name}
              displayConfig={cfg?.conditional_format ? {
                conditionalFormat: cfg.conditional_format as unknown as import("@/components/fields").ConditionalFormatRule[],
              } : undefined}
              onChange={(displayCfg) => handleConditionalFormatChange(formatPanelSlug, displayCfg)}
              onClose={() => setFormatPanelSlug(null)}
            />
          </div>
        );
      })()}
    </div>
  );
}
