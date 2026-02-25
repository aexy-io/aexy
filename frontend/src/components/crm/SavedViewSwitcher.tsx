"use client";

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Plus,
  Trash2,
  Save,
  Lock,
  Globe,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TableSavedView, ColumnDisplayConfig } from "@/lib/api";

interface SavedViewSwitcherProps {
  views: TableSavedView[];
  activeViewId: string | null;
  onSelectView: (view: TableSavedView | null) => void;
  onSaveView: (data: {
    name: string;
    view_type?: "table" | "board" | "gallery" | "timeline";
    visible_attributes?: string[];
    column_config?: ColumnDisplayConfig[];
    sorts?: Record<string, unknown>[];
    filters?: Record<string, unknown>[];
    is_private?: boolean;
  }) => Promise<void>;
  onUpdateView: (viewId: string, data: Partial<{
    name: string;
    visible_attributes: string[];
    column_config: ColumnDisplayConfig[];
    sorts: Record<string, unknown>[];
    filters: Record<string, unknown>[];
  }>) => Promise<void>;
  onDeleteView: (viewId: string) => Promise<void>;
  currentConfig?: {
    visible_attributes?: string[];
    column_config?: ColumnDisplayConfig[];
    sorts?: Record<string, unknown>[];
    view_type?: "table" | "board";
  };
  isCreating?: boolean;
  isUpdating?: boolean;
  className?: string;
}

export function SavedViewSwitcher({
  views,
  activeViewId,
  onSelectView,
  onSaveView,
  onUpdateView,
  onDeleteView,
  currentConfig,
  isCreating,
  isUpdating,
  className,
}: SavedViewSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNaming, setIsNaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeView = views.find((v) => v.id === activeViewId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsNaming(false);
        setRenamingId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isNaming && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isNaming]);

  const handleSave = async () => {
    if (!newName.trim()) return;
    await onSaveView({
      name: newName.trim(),
      view_type: currentConfig?.view_type || "table",
      visible_attributes: currentConfig?.visible_attributes,
      column_config: currentConfig?.column_config,
      sorts: currentConfig?.sorts,
    });
    setNewName("");
    setIsNaming(false);
  };

  const handleRename = async (viewId: string) => {
    if (!renameValue.trim()) return;
    await onUpdateView(viewId, { name: renameValue.trim() });
    setRenamingId(null);
  };

  const handleOverwrite = async () => {
    if (!activeViewId || !currentConfig) return;
    await onUpdateView(activeViewId, {
      visible_attributes: currentConfig.visible_attributes,
      column_config: currentConfig.column_config,
      sorts: currentConfig.sorts,
    });
  };

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
          activeView
            ? "bg-purple-600/10 border-purple-600/30 text-purple-400 hover:bg-purple-600/20"
            : "bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        {activeView ? (
          <>
            {activeView.is_private && <Lock className="w-3 h-3" />}
            <span className="max-w-[120px] truncate">{activeView.name}</span>
          </>
        ) : (
          <span>All records</span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-muted border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Default view */}
          <button
            onClick={() => {
              onSelectView(null);
              setIsOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
              !activeViewId && "bg-accent text-foreground font-medium"
            )}
          >
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            All records
          </button>

          {views.length > 0 && (
            <div className="border-t border-border">
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Saved Views
              </div>
              {views.map((view) => (
                <div
                  key={view.id}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer",
                    activeViewId === view.id && "bg-accent text-foreground font-medium"
                  )}
                >
                  {renamingId === view.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(view.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 px-2 py-0.5 text-sm bg-accent border border-border rounded text-foreground"
                        autoFocus
                      />
                      <button onClick={() => handleRename(view.id)} className="p-0.5 text-green-400 hover:text-green-300">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => setRenamingId(null)} className="p-0.5 text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        className="flex-1 flex items-center gap-2 text-left truncate"
                        onClick={() => {
                          onSelectView(view);
                          setIsOpen(false);
                        }}
                      >
                        {view.is_private ? (
                          <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{view.name}</span>
                      </button>
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(view.id);
                            setRenameValue(view.name);
                          }}
                          className="p-1 text-muted-foreground hover:text-foreground rounded"
                          title="Rename"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteView(view.id);
                            if (activeViewId === view.id) onSelectView(null);
                          }}
                          className="p-1 text-muted-foreground hover:text-red-400 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-border">
            {isNaming ? (
              <div className="p-2 flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") setIsNaming(false);
                  }}
                  placeholder="View name..."
                  className="flex-1 px-2 py-1.5 text-sm bg-accent border border-border rounded text-foreground placeholder-muted-foreground"
                />
                <button
                  onClick={handleSave}
                  disabled={!newName.trim() || isCreating}
                  className="p-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-xs"
                >
                  {isCreating ? "..." : <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <div className="p-1">
                <button
                  onClick={() => setIsNaming(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Save current view
                </button>
                {activeViewId && (
                  <button
                    onClick={handleOverwrite}
                    disabled={isUpdating}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isUpdating ? "Saving..." : "Update current view"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
