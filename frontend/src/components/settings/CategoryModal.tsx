"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useState } from "react";
import { AlertCircle, Check, RefreshCw } from "lucide-react";

import {
  CategorySemantics,
  WorkspaceStatusCategory,
} from "@/lib/api";

const SEMANTICS_OPTIONS: {
  value: CategorySemantics;
  label: string;
  hint: string;
}[] = [
  { value: "open", label: "Open", hint: "Queued — remaining work" },
  { value: "active", label: "Active", hint: "In flight — counts toward WIP" },
  { value: "done", label: "Done", hint: "Completed — counts toward velocity" },
  { value: "cancelled", label: "Cancelled", hint: "Closed without completing" },
];

const PRESET_COLORS = [
  "#9CA3AF", "#EF4444", "#F59E0B", "#10B981", "#3B82F6",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6366F1",
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[-\s]+/g, "_")
    .replace(/^_|_$/g, "");
}

export interface CategoryModalProps {
  category: WorkspaceStatusCategory | null;
  onClose: () => void;
  onSave: (data: {
    slug?: string;
    label: string;
    color: string;
    semantics: CategorySemantics;
  }) => Promise<void>;
  isSaving: boolean;
}

/**
 * Add / edit a status category. Slug is only editable at create time —
 * existing statuses reference it as a string, so a rename would orphan them.
 * Label, color, and semantics stay editable for the lifetime of the row.
 */
export function CategoryModal({ category, onClose, onSave, isSaving }: CategoryModalProps) {
  const isEdit = category !== null;
  const [label, setLabel] = useState(category?.label ?? "");
  const [color, setColor] = useState(category?.color ?? "#6B7280");
  const [semantics, setSemantics] = useState<CategorySemantics>(
    category?.semantics ?? "open",
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError("Label is required");
      return;
    }
    try {
      await onSave({
        ...(isEdit ? {} : { slug: slugify(label) }),
        label: label.trim(),
        color,
        semantics,
      });
      onClose();
    } catch (err) {
      const msg = getApiErrorMessage(err, "Failed to save category");
      // Surface category_slug_exists distinctly so the operator picks a new label.
      if (/category_slug_exists/i.test(msg)) {
        setError("A category with that slug already exists.");
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold text-foreground mb-4">
          {isEdit ? "Edit Category" : "Create Category"}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Design Review"
                autoFocus
                className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
              />
              {!isEdit && label.trim() && (
                <p className="mt-1 text-xs text-muted-foreground">
                  slug: <span className="font-mono">{slugify(label)}</span>
                </p>
              )}
              {isEdit && (
                <p className="mt-1 text-xs text-muted-foreground">
                  slug: <span className="font-mono">{category!.slug}</span>
                  {" "}
                  (locked — statuses reference it)
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1">
                Semantics
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SEMANTICS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSemantics(opt.value)}
                    title={opt.hint}
                    className={`p-2 rounded-lg border text-left transition ${
                      semantics === opt.value
                        ? "border-primary-500 bg-primary-900/20"
                        : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <div className="text-foreground text-sm font-medium">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {opt.hint}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs mt-1">
                Burndown and velocity branch on semantics — slugs are user-facing.
              </p>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1">Color</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-lg border-2 transition ${
                      color === c ? "border-white" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
