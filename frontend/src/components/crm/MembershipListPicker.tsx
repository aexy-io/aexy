"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LayoutList, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMList } from "@/lib/api";

interface MembershipListPickerProps {
  lists: CRMList[];
  activeListId: string | null;
  onSelectList: (list: CRMList | null) => void;
  onCreateList: (name: string) => Promise<void>;
  isCreating?: boolean;
  className?: string;
}

export function MembershipListPicker({
  lists,
  activeListId,
  onSelectList,
  onCreateList,
  isCreating,
  className,
}: MembershipListPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNaming, setIsNaming] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeList = lists.find((l) => l.id === activeListId) || null;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsNaming(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isNaming && inputRef.current) inputRef.current.focus();
  }, [isNaming]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onCreateList(newName.trim());
    setNewName("");
    setIsNaming(false);
    setIsOpen(false);
  };

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
          activeList
            ? "bg-indigo-600/10 border-indigo-600/30 text-indigo-400 hover:bg-indigo-600/20"
            : "bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <LayoutList className="w-3.5 h-3.5" />
        {activeList ? (
          <span className="max-w-[140px] truncate">
            {activeList.name}
            {typeof activeList.entry_count === "number" ? ` (${activeList.entry_count})` : ""}
          </span>
        ) : (
          <span>Lists</span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-muted border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              onSelectList(null);
              setIsOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
              !activeListId && "bg-accent text-foreground font-medium"
            )}
          >
            All records
          </button>

          {lists.length > 0 && (
            <div className="border-t border-border">
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Membership lists
              </div>
              {lists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => {
                    onSelectList(list);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
                    activeListId === list.id && "bg-accent text-foreground font-medium"
                  )}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: list.color || "#6366f1" }}
                  />
                  <span className="truncate flex-1">{list.name}</span>
                  <span className="text-xs text-muted-foreground">{list.entry_count ?? 0}</span>
                  {activeListId === list.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-border p-1">
            {isNaming ? (
              <div className="p-1 flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreate();
                    if (e.key === "Escape") setIsNaming(false);
                  }}
                  placeholder="List name..."
                  className="flex-1 px-2 py-1.5 text-sm bg-accent border border-border rounded text-foreground placeholder-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={!newName.trim() || isCreating}
                  className="p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded"
                >
                  {isCreating ? "..." : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsNaming(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsNaming(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create list
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface AddToListModalProps {
  isOpen: boolean;
  onClose: () => void;
  lists: CRMList[];
  selectedCount: number;
  onAdd: (listId: string) => Promise<void>;
  onCreateAndAdd: (name: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function AddToListModal({
  isOpen,
  onClose,
  lists,
  selectedCount,
  onAdd,
  onCreateAndAdd,
  isSubmitting,
}: AddToListModalProps) {
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<"pick" | "create">("pick");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl p-5">
        <h3 className="text-lg font-semibold text-foreground mb-1">Add to list</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add {selectedCount} selected record{selectedCount === 1 ? "" : "s"} to a membership list.
        </p>

        {mode === "pick" ? (
          <>
            <div className="max-h-56 overflow-y-auto space-y-1 mb-4">
              {lists.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No lists yet. Create one below.
                </p>
              ) : (
                lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void onAdd(list.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left hover:bg-accent border border-transparent hover:border-border transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: list.color || "#6366f1" }}
                    />
                    <span className="flex-1 truncate">{list.name}</span>
                    <span className="text-xs text-muted-foreground">{list.entry_count ?? 0}</span>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => setMode("create")}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:bg-indigo-500/10 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Create new list
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) void onCreateAndAdd(newName.trim());
              }}
              placeholder="List name..."
              autoFocus
              className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg text-foreground"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setMode("pick")}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!newName.trim() || isSubmitting}
                onClick={() => void onCreateAndAdd(newName.trim())}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg"
              >
                {isSubmitting ? "Working..." : "Create & add"}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
