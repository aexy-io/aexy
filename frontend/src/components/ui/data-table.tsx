"use client";

import * as React from "react";
import { useState, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination } from "./pagination";

// ─── Types ──────────────────────────────────────────────

export interface DataTableColumn<T> {
  /** Unique key for the column — used for sorting and as React key */
  id: string;
  /** Column header label */
  header: string;
  /** Render function for cell content */
  cell: (row: T) => React.ReactNode;
  /** Value accessor for sorting (return string/number) */
  sortValue?: (row: T) => string | number;
  /** Column header alignment */
  headerClassName?: string;
  /** Cell alignment */
  cellClassName?: string;
  /** Whether the column is sortable (requires sortValue) */
  sortable?: boolean;
}

export type SortDirection = "asc" | "desc";

export interface DataTableProps<T> {
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Row data */
  data: T[];
  /** Unique key extractor for each row */
  rowKey: (row: T) => string;
  /** Optional click handler for rows */
  onRowClick?: (row: T) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Number of skeleton rows to show when loading */
  skeletonRows?: number;
  /** Empty state content */
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Pagination (uncontrolled — component handles sorting; pagination controlled externally) */
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  /** Table wrapper class */
  className?: string;
  /** Compact mode — reduces padding */
  compact?: boolean;
}

// ─── Component ──────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  isLoading = false,
  skeletonRows = 5,
  emptyIcon,
  emptyTitle = "No data",
  emptyDescription,
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  className,
  compact = false,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = useCallback(
    (columnId: string) => {
      if (sortColumn === columnId) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(columnId);
        setSortDirection("asc");
      }
    },
    [sortColumn]
  );

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;
    const col = columns.find((c) => c.id === sortColumn);
    if (!col?.sortValue) return data;

    return [...data].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [data, sortColumn, sortDirection, columns]);

  const cellPadding = compact ? "px-3 py-2" : "px-4 py-3";
  const headerPadding = compact ? "px-3 py-2" : "px-4 py-3";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* Header */}
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {columns.map((col) => {
                  const isSortable = col.sortable !== false && !!col.sortValue;
                  const isSorted = sortColumn === col.id;
                  return (
                    <th
                      key={col.id}
                      className={cn(
                        headerPadding,
                        "text-xs font-medium text-muted-foreground uppercase tracking-wider text-left",
                        isSortable && "cursor-pointer select-none hover:text-foreground transition",
                        col.headerClassName
                      )}
                      onClick={isSortable ? () => handleSort(col.id) : undefined}
                    >
                      <span className="flex items-center gap-1">
                        {col.header}
                        {isSortable && (
                          <span className="flex-shrink-0">
                            {isSorted ? (
                              sortDirection === "asc" ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                            )}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                // Skeleton rows
                Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="animate-pulse">
                    {columns.map((col) => (
                      <td key={col.id} className={cn(cellPadding, col.cellClassName)}>
                        <div className="h-4 bg-accent rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedData.length === 0 ? (
                // Empty state
                <tr>
                  <td colSpan={columns.length} className="py-16 text-center">
                    {emptyIcon && (
                      <div className="flex justify-center mb-3 text-muted-foreground">
                        {emptyIcon}
                      </div>
                    )}
                    <p className="text-sm font-medium text-foreground">
                      {emptyTitle}
                    </p>
                    {emptyDescription && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {emptyDescription}
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                // Data rows
                sortedData.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "transition-colors",
                      onRowClick
                        ? "cursor-pointer hover:bg-accent/50"
                        : "hover:bg-muted/30"
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          cellPadding,
                          "text-sm text-foreground",
                          col.cellClassName
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {onPageChange && totalPages && totalPages > 1 && (
        <Pagination
          currentPage={currentPage || 1}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
