"use client";

import React from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { UserStoryCreate, UserStoryUpdate, StoryPriority } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StoryFormProps {
  initialData?: Partial<UserStoryCreate>;
  onSubmit: (data: UserStoryCreate | UserStoryUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  mode?: "create" | "edit";
}

export function StoryForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  mode = "create",
}: StoryFormProps) {
  const [formData, setFormData] = React.useState<Partial<UserStoryCreate>>({
    title: "",
    as_a: "",
    i_want: "",
    so_that: "",
    description: "",
    story_points: undefined,
    priority: "medium",
    acceptance_criteria: [],
    labels: [],
    ...initialData,
  });

  const [newCriterion, setNewCriterion] = React.useState("");
  const [newLabel, setNewLabel] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData as UserStoryCreate);
  };

  const addCriterion = () => {
    if (newCriterion.trim()) {
      setFormData((prev) => ({
        ...prev,
        acceptance_criteria: [
          ...(prev.acceptance_criteria || []),
          {
            id: crypto.randomUUID(),
            description: newCriterion.trim(),
            completed: false,
          },
        ],
      }));
      setNewCriterion("");
    }
  };

  const removeCriterion = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      acceptance_criteria: prev.acceptance_criteria?.filter((c) => c.id !== id) || [],
    }));
  };

  const addLabel = () => {
    if (newLabel.trim() && !formData.labels?.includes(newLabel.trim())) {
      setFormData((prev) => ({
        ...prev,
        labels: [...(prev.labels || []), newLabel.trim()],
      }));
      setNewLabel("");
    }
  };

  const removeLabel = (label: string) => {
    setFormData((prev) => ({
      ...prev,
      labels: prev.labels?.filter((l) => l !== label) || [],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Title *</label>
        <input
          type="text"
          value={formData.title || ""}
          onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Brief title for the story"
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          required
        />
      </div>

      {/* User Story Format */}
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg border border-border/50">
        <h4 className="text-sm font-medium text-foreground">User Story</h4>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">As a... *</label>
          <input
            type="text"
            value={formData.as_a || ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, as_a: e.target.value }))}
            placeholder="e.g., product manager, developer, customer"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">I want... *</label>
          <textarea
            value={formData.i_want || ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, i_want: e.target.value }))}
            placeholder="What do you want to accomplish?"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[80px]"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">So that...</label>
          <textarea
            value={formData.so_that || ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, so_that: e.target.value }))}
            placeholder="What benefit does this provide?"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[60px]"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Additional Description</label>
        <textarea
          value={formData.description || ""}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Any additional context or details..."
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[100px]"
        />
      </div>

      {/* Priority and Points */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Priority</label>
          <select
            value={formData.priority || "medium"}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, priority: e.target.value as StoryPriority }))
            }
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Story Points</label>
          <input
            type="number"
            value={formData.story_points ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                story_points: e.target.value ? parseInt(e.target.value) : undefined,
              }))
            }
            placeholder="Estimate"
            min={0}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>

      {/* Acceptance Criteria */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Acceptance Criteria</label>
        <div className="space-y-2 mb-3">
          {formData.acceptance_criteria?.map((criterion) => (
            <div
              key={criterion.id}
              className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-lg"
            >
              <span className="flex-1 text-sm text-foreground">{criterion.description}</span>
              <button
                type="button"
                onClick={() => removeCriterion(criterion.id)}
                className="p-1 text-muted-foreground hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCriterion();
              }
            }}
            placeholder="Add acceptance criterion..."
            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <button
            type="button"
            onClick={addCriterion}
            className="p-2 bg-accent text-foreground rounded-lg hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Labels */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Labels</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {formData.labels?.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 bg-accent text-foreground px-2 py-1 rounded text-sm"
            >
              {label}
              <button
                type="button"
                onClick={() => removeLabel(label)}
                className="text-muted-foreground hover:text-red-400"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLabel();
              }
            }}
            placeholder="Add label..."
            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <button
            type="button"
            onClick={addLabel}
            className="p-2 bg-accent text-foreground rounded-lg hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !formData.title || !formData.as_a || !formData.i_want}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Saving..." : mode === "create" ? "Create Story" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
