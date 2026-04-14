"use client";

import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
}

interface CreateProjectModalProps {
  onClose: () => void;
  onCreate: (data: CreateProjectInput) => Promise<unknown>;
  isCreating: boolean;
}

const COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

export function CreateProjectModal({ onClose, onCreate, isCreating }: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
      });
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create project";
      setError(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold text-foreground mb-4">Create Project</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Frontend Redesign"
                className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                rows={2}
                className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-lg transition ${
                      color === c ? "ring-2 ring-white ring-offset-2 ring-offset-card" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
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
              disabled={isCreating}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
