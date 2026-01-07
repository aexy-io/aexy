"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMAttribute } from "@/lib/api";
import { TypeBadge } from "./CRMBadge";

interface ColumnSelectorProps {
  attributes: CRMAttribute[];
  visibleColumns: string[]; // attribute slugs
  onToggleColumn: (slug: string) => void;
  onShowAll?: () => void;
  onHideAll?: () => void;
  className?: string;
}

export function ColumnSelector({
  attributes,
  visibleColumns,
  onToggleColumn,
  onShowAll,
  onHideAll,
  className,
}: ColumnSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter out system attributes and apply search
  const selectableAttributes = attributes.filter((attr) => {
    if (attr.is_system) return false;
    if (search) {
      return attr.name.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <th className={cn("px-2 py-3", className)}>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            isOpen
              ? "bg-purple-500/20 text-purple-400"
              : "text-slate-500 hover:text-slate-300 hover:bg-slate-700"
          )}
          title="Add column"
        >
          <Plus className="h-4 w-4" />
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
            {/* Search */}
            <div className="p-2 border-b border-slate-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search columns..."
                  className="w-full pl-8 pr-8 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick actions */}
            {(onShowAll || onHideAll) && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
                {onShowAll && (
                  <button
                    onClick={() => {
                      onShowAll();
                    }}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    Show all
                  </button>
                )}
                {onShowAll && onHideAll && (
                  <span className="text-slate-600">•</span>
                )}
                {onHideAll && (
                  <button
                    onClick={() => {
                      onHideAll();
                    }}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    Hide all
                  </button>
                )}
              </div>
            )}

            {/* Column list */}
            <div className="max-h-64 overflow-y-auto py-1">
              {selectableAttributes.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-slate-400">
                  {search ? "No columns match your search" : "No columns available"}
                </div>
              ) : (
                selectableAttributes.map((attr) => {
                  const isVisible = visibleColumns.includes(attr.slug);
                  return (
                    <button
                      key={attr.id}
                      onClick={() => onToggleColumn(attr.slug)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700 transition-colors"
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          isVisible
                            ? "bg-purple-500 border-purple-500"
                            : "border-slate-600"
                        )}
                      >
                        {isVisible && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span className="flex-1 text-left text-sm text-slate-300 truncate">
                        {attr.name}
                      </span>
                      <TypeBadge type={attr.attribute_type} />
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-slate-700 text-xs text-slate-500">
              {visibleColumns.length} of {attributes.filter((a) => !a.is_system).length} columns visible
            </div>
          </div>
        )}
      </div>
    </th>
  );
}

// Standalone column visibility menu (not in table header)
export function ColumnVisibilityMenu({
  attributes,
  visibleColumns,
  onToggleColumn,
  onShowAll,
  onHideAll,
  className,
}: ColumnSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const selectableAttributes = attributes.filter((attr) => {
    if (attr.is_system) return false;
    if (search) {
      return attr.name.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className={cn("relative", className)} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isOpen
            ? "bg-slate-700 text-white"
            : "bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700"
        )}
      >
        <Plus className="h-4 w-4" />
        Columns
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search columns..."
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          {(onShowAll || onHideAll) && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
              {onShowAll && (
                <button onClick={onShowAll} className="text-xs text-purple-400 hover:text-purple-300">
                  Show all
                </button>
              )}
              {onShowAll && onHideAll && <span className="text-slate-600">•</span>}
              {onHideAll && (
                <button onClick={onHideAll} className="text-xs text-purple-400 hover:text-purple-300">
                  Hide all
                </button>
              )}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {selectableAttributes.map((attr) => {
              const isVisible = visibleColumns.includes(attr.slug);
              return (
                <button
                  key={attr.id}
                  onClick={() => onToggleColumn(attr.slug)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700 transition-colors"
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      isVisible ? "bg-purple-500 border-purple-500" : "border-slate-600"
                    )}
                  >
                    {isVisible && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="flex-1 text-left text-sm text-slate-300 truncate">{attr.name}</span>
                  <TypeBadge type={attr.attribute_type} />
                </button>
              );
            })}
          </div>

          <div className="px-3 py-2 border-t border-slate-700 text-xs text-slate-500">
            {visibleColumns.length} of {attributes.filter((a) => !a.is_system).length} columns visible
          </div>
        </div>
      )}
    </div>
  );
}
