"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  EyeOff,
  Filter,
  GripVertical,
  MoreVertical,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface ColumnHeaderProps {
  id: string;
  label: string;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
  onHide?: () => void;
  onFilter?: () => void;
  isDraggable?: boolean;
  isResizable?: boolean;
  width?: number;
  onResize?: (width: number) => void;
  className?: string;
}

export function ColumnHeader({
  id,
  label,
  sortDirection,
  onSort,
  onHide,
  onFilter,
  isDraggable = false,
  isResizable = false,
  width,
  onResize,
  className,
}: ColumnHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const resizeStartX = useRef<number>(0);
  const startWidth = useRef<number>(0);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: width ? `${width}px` : undefined,
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  // Handle column resize
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    startWidth.current = width || 150;

    const handleResizeMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX.current;
      const newWidth = Math.max(80, startWidth.current + diff);
      onResize?.(newWidth);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const SortIcon = sortDirection === "asc" ? ArrowUp : sortDirection === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={cn(
        "px-4 py-3 text-left relative group",
        isDragging && "opacity-50 bg-slate-700",
        className
      )}
      {...attributes}
    >
      <div className="flex items-center gap-1">
        {/* Drag handle */}
        {isDraggable && (
          <button
            {...listeners}
            className="p-0.5 -ml-1 cursor-grab opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity"
          >
            <GripVertical className="h-3 w-3" />
          </button>
        )}

        {/* Label with sort */}
        <button
          onClick={onSort}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
        >
          <span className="truncate">{label}</span>
          {onSort && (
            <SortIcon className={cn(
              "h-3 w-3 flex-shrink-0",
              sortDirection && "text-purple-400"
            )} />
          )}
        </button>

        {/* Menu button */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-0.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity"
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      </div>

      {/* Dropdown menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 mt-1 z-50 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1"
        >
          {onSort && (
            <>
              <button
                onClick={() => {
                  onSort();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <ArrowUp className="h-4 w-4" />
                Sort ascending
              </button>
              <button
                onClick={() => {
                  onSort();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <ArrowDown className="h-4 w-4" />
                Sort descending
              </button>
            </>
          )}
          {onFilter && (
            <button
              onClick={() => {
                onFilter();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <Filter className="h-4 w-4" />
              Filter by this column
            </button>
          )}
          {onHide && (
            <>
              <div className="border-t border-slate-700 my-1" />
              <button
                onClick={() => {
                  onHide();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <EyeOff className="h-4 w-4" />
                Hide column
              </button>
            </>
          )}
        </div>
      )}

      {/* Resize handle */}
      {isResizable && (
        <div
          onMouseDown={handleResizeStart}
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize",
            "hover:bg-purple-500/50 transition-colors",
            isResizing && "bg-purple-500"
          )}
        />
      )}
    </th>
  );
}

// Non-draggable simple header
export function SimpleColumnHeader({
  label,
  sortDirection,
  onSort,
  className,
}: {
  label: string;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
  className?: string;
}) {
  const SortIcon = sortDirection === "asc" ? ArrowUp : sortDirection === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <th className={cn("px-4 py-3 text-left", className)}>
      <button
        onClick={onSort}
        className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
      >
        {label}
        {onSort && (
          <SortIcon className={cn(
            "h-3 w-3",
            sortDirection && "text-purple-400"
          )} />
        )}
      </button>
    </th>
  );
}
