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
  Palette,
  Trash2,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { getFieldTypeOrFallback } from "@/components/fields";
import type { DisplayVariant } from "@/components/fields";

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
  /** Field type for display variant config */
  fieldType?: string;
  /** Current display variant */
  displayVariant?: string;
  /** Callback when user selects a display variant */
  onDisplayVariantChange?: (variant: string) => void;
  /** Callback to open conditional formatting panel */
  onConditionalFormat?: () => void;
  /** Callback to delete this column */
  onDelete?: () => void;
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
  fieldType,
  displayVariant,
  onDisplayVariantChange,
  onConditionalFormat,
  onDelete,
}: ColumnHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
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

  // Resolve available variants for this field type
  const fieldDef = fieldType ? getFieldTypeOrFallback(fieldType) : null;
  const variants: DisplayVariant[] = fieldDef?.variants || [];

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowVariants(false);
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
        isDragging && "opacity-50 bg-accent z-10",
        className
      )}
      {...attributes}
    >
      <div className="flex items-center gap-1">
        {/* Drag handle */}
        {isDraggable && (
          <div
            {...listeners}
            className="p-1 -ml-1.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}

        {/* Label with sort */}
        <button
          onClick={onSort}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
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
          ref={menuBtnRef}
          onClick={() => {
            if (!showMenu && menuBtnRef.current) {
              const rect = menuBtnRef.current.getBoundingClientRect();
              setMenuPos({ top: rect.bottom + 4, left: rect.left });
            }
            setShowMenu(!showMenu);
            setShowVariants(false);
          }}
          className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      </div>

      {/* Dropdown menu */}
      {showMenu && menuPos && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 bg-muted border border-border rounded-lg shadow-xl py-1"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {onSort && (
            <>
              <button
                onClick={() => {
                  onSort();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <ArrowUp className="h-4 w-4" />
                Sort ascending
              </button>
              <button
                onClick={() => {
                  onSort();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
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
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <Filter className="h-4 w-4" />
              Filter by this column
            </button>
          )}

          {/* Display variant picker */}
          {variants.length > 0 && onDisplayVariantChange && (
            <>
              <div className="border-t border-border my-1" />
              <div className="relative">
                <button
                  onClick={() => setShowVariants(!showVariants)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <Palette className="h-4 w-4" />
                  Display as
                  <span className="ml-auto text-xs text-muted-foreground">
                    {variants.find((v) => v.id === displayVariant)?.label || "Default"}
                  </span>
                </button>
                {showVariants && (
                  <div className="absolute left-full top-0 ml-1 w-48 bg-muted border border-border rounded-lg shadow-xl py-1">
                    {variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          onDisplayVariantChange(v.id);
                          setShowMenu(false);
                          setShowVariants(false);
                        }}
                        className={cn(
                          "w-full flex flex-col items-start px-3 py-2 text-sm hover:bg-accent transition-colors",
                          displayVariant === v.id && "bg-accent text-purple-400"
                        )}
                      >
                        <span className={displayVariant === v.id ? "text-purple-400 font-medium" : "text-foreground"}>
                          {v.label}
                        </span>
                        {v.description && (
                          <span className="text-xs text-muted-foreground">{v.description}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {onConditionalFormat && (
            <button
              onClick={() => {
                onConditionalFormat();
                setShowMenu(false);
                setShowVariants(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <Palette className="h-4 w-4" />
              Conditional formatting...
            </button>
          )}

          {(onHide || onDelete) && (
            <>
              <div className="border-t border-border my-1" />
              {onHide && (
                <button
                  onClick={() => {
                    onHide();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <EyeOff className="h-4 w-4" />
                  Hide column
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete column
                </button>
              )}
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
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
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
