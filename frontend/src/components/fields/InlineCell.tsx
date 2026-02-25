"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { FieldRenderer, FieldEditor } from "./FieldRenderer";
import type { CRMAttribute } from "@/lib/api";

interface InlineCellProps {
  value: unknown;
  attribute: CRMAttribute;
  access?: "hidden" | "readonly" | "edit";
  onSave: (value: unknown) => Promise<void>;
  isCompact?: boolean;
}

export function InlineCell({
  value,
  attribute,
  access = "edit",
  onSave,
  isCompact = true,
}: InlineCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset edit value when external value changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  const handleSave = useCallback(async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
    } catch {
      // Revert on failure
      setEditValue(value);
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  }, [editValue, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        setEditValue(value);
        setIsEditing(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        handleSave();
        // Focus next cell - handled by parent
      }
    },
    [handleSave, value]
  );

  const handleBlur = useCallback(() => {
    // Debounce to allow click events on dropdowns
    saveTimeoutRef.current = setTimeout(() => {
      handleSave();
    }, 150);
  }, [handleSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (access === "hidden") return null;

  if (access === "readonly" || !isEditing) {
    return (
      <div
        ref={cellRef}
        onClick={() => {
          if (access === "edit") {
            setIsEditing(true);
          }
        }}
        className={`min-h-[32px] flex items-center ${
          access === "edit" ? "cursor-text hover:bg-accent/50 rounded px-1 -mx-1" : ""
        }`}
      >
        <FieldRenderer
          value={value}
          type={attribute.attribute_type}
          config={attribute.options || {}}
          surface="table_cell"
        />
      </div>
    );
  }

  // Editing mode
  return (
    <div
      ref={cellRef}
      className="min-h-[32px] flex items-center"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <FieldEditor
        attribute={attribute}
        value={editValue}
        onChange={setEditValue}
        autoFocus
        className="w-full px-2 py-1 bg-accent border border-purple-500 rounded text-foreground text-sm focus:outline-none"
      />
      {isSaving && (
        <span className="ml-1 text-xs text-muted-foreground animate-pulse">...</span>
      )}
    </div>
  );
}
