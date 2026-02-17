"use client";

import { useState, useEffect } from "react";
import { Send, MessageSquare, AlertTriangle, CheckCircle2, Edit3 } from "lucide-react";
import { StandupCreate, Standup } from "@/lib/api";

interface StandupFormProps {
  onSubmit: (data: StandupCreate) => Promise<void>;
  isSubmitting?: boolean;
  sprintId?: string;
  teamId?: string;
  /** Existing standup data for edit mode */
  initialData?: Standup | null;
  /** Whether to show in compact edit mode */
  editMode?: boolean;
}

export function StandupForm({
  onSubmit,
  isSubmitting = false,
  sprintId,
  teamId,
  initialData,
  editMode = false,
}: StandupFormProps) {
  const [yesterday, setYesterday] = useState(initialData?.yesterday_summary || "");
  const [today, setToday] = useState(initialData?.today_plan || "");
  const [blockers, setBlockers] = useState(initialData?.blockers_summary || "");
  const [showSuccess, setShowSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(!initialData);

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      setYesterday(initialData.yesterday_summary || "");
      setToday(initialData.today_plan || "");
      setBlockers(initialData.blockers_summary || "");
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yesterday.trim() && !today.trim()) return;
    if (!teamId) return;

    try {
      await onSubmit({
        yesterday_summary: yesterday.trim(),
        today_plan: today.trim(),
        blockers_summary: blockers.trim() || undefined,
        sprint_id: sprintId,
        team_id: teamId,
        source: "web",
      });

      setShowSuccess(true);
      setIsEditing(false);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to submit standup:", error);
    }
  };

  const isUpdate = !!initialData;

  // If in view mode (has data and not editing), show the view with edit button
  if (isUpdate && !isEditing && editMode) {
    return (
      <div className="bg-muted rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            Today's Standup
          </h3>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded-lg transition"
          >
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase mb-1">Yesterday</p>
            <p className="text-foreground text-sm whitespace-pre-wrap">{yesterday || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase mb-1">Today</p>
            <p className="text-foreground text-sm whitespace-pre-wrap">{today || "—"}</p>
          </div>
          {blockers && (
            <div>
              <p className="text-xs text-amber-500 uppercase mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Blockers
              </p>
              <p className="text-foreground text-sm whitespace-pre-wrap">{blockers}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-muted rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-400" />
            {isUpdate ? "Edit Today's Standup" : "Daily Standup"}
          </h3>
          {isUpdate && isEditing && (
            <button
              type="button"
              onClick={() => {
                // Reset to original values
                setYesterday(initialData?.yesterday_summary || "");
                setToday(initialData?.today_plan || "");
                setBlockers(initialData?.blockers_summary || "");
                setIsEditing(false);
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>

        {showSuccess && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg flex items-center gap-2 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>{isUpdate ? "Standup updated successfully!" : "Standup submitted successfully!"}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Yesterday */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              What did you accomplish yesterday?
            </label>
            <textarea
              value={yesterday}
              onChange={(e) => setYesterday(e.target.value)}
              placeholder="Describe what you completed yesterday..."
              className="w-full px-4 py-3 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          {/* Today */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              What will you work on today?
            </label>
            <textarea
              value={today}
              onChange={(e) => setToday(e.target.value)}
              placeholder="Describe your plans for today..."
              className="w-full px-4 py-3 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          {/* Blockers */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Any blockers or impediments? (optional)
            </label>
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="Describe any blockers holding you back..."
              className="w-full px-4 py-3 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              rows={2}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {isUpdate && isEditing && (
            <button
              type="button"
              onClick={() => {
                setYesterday(initialData?.yesterday_summary || "");
                setToday(initialData?.today_plan || "");
                setBlockers(initialData?.blockers_summary || "");
                setIsEditing(false);
              }}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || (!yesterday.trim() && !today.trim())}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isUpdate ? "Updating..." : "Submitting..."}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {isUpdate ? "Update Standup" : "Submit Standup"}
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
