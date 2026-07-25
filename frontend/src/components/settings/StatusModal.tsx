"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useState } from "react";
import { AlertCircle, Check, RefreshCw } from "lucide-react";

import { StatusCategory, TaskStatusConfig, WorkspaceStatusCategory } from "@/lib/api";

// Semantics → short tooltip the modal renders under each category cell. Slugs
// can be renamed by admins, but the four semantics buckets are stable.
const SEMANTICS_HINTS: Record<string, string> = {
  open: "Queued — remaining work",
  active: "In flight — counts toward WIP",
  done: "Completed — counts toward velocity",
  cancelled: "Closed without completing",
};

const PRESET_COLORS = [
  "#6B7280",
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
];

export interface StatusModalProps {
  status: TaskStatusConfig | null;
  categories: WorkspaceStatusCategory[];
  onClose: () => void;
  onSave: (data: {
    name: string;
    category: StatusCategory;
    color: string;
    icon?: string;
    is_default?: boolean;
  }) => Promise<void>;
  isSaving: boolean;
}

export function StatusModal({
  status,
  categories,
  onClose,
  onSave,
  isSaving,
}: StatusModalProps) {
  const fallbackCategory = categories[0]?.slug ?? "todo";
  const [name, setName] = useState(status?.name || "");
  const [category, setCategory] = useState<StatusCategory>(
    status?.category || fallbackCategory,
  );
  const [color, setColor] = useState(status?.color || "#6B7280");
  const [isDefault, setIsDefault] = useState(status?.is_default || false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Status name is required");
      return;
    }
    try {
      await onSave({ name: name.trim(), category, color, is_default: isDefault });
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save status"));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold text-foreground mb-4">
          {status ? "Edit Status" : "Create Status"}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="In Review"
                className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1">Category</label>
              {categories.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  No categories defined yet — they'll seed automatically when
                  you save your first status.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.slug)}
                      title={SEMANTICS_HINTS[cat.semantics] ?? cat.semantics}
                      className={`p-2 rounded-lg border text-center transition ${
                        category === cat.slug
                          ? "border-primary-500 bg-primary-900/20"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      <div
                        className="w-3 h-3 rounded-full mx-auto mb-1"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-foreground text-sm">{cat.label}</span>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                        {cat.semantics}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-muted-foreground text-xs mt-1">
                Category semantics drive burndown and velocity calculations.
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

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-muted text-primary-500 focus:ring-primary-500"
              />
              <span className="text-foreground text-sm">Set as default status for new tasks</span>
            </label>

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
