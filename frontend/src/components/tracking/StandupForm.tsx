"use client";

import { useState } from "react";
import { Send, MessageSquare, AlertTriangle, CheckCircle2 } from "lucide-react";
import { StandupCreate } from "@/lib/api";

interface StandupFormProps {
  onSubmit: (data: StandupCreate) => Promise<void>;
  isSubmitting?: boolean;
  sprintId?: string;
  teamId?: string;
}

export function StandupForm({ onSubmit, isSubmitting = false, sprintId, teamId }: StandupFormProps) {
  const [yesterday, setYesterday] = useState("");
  const [today, setToday] = useState("");
  const [blockers, setBlockers] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

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

      setYesterday("");
      setToday("");
      setBlockers("");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to submit standup:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-400" />
          Daily Standup
        </h3>

        {showSuccess && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg flex items-center gap-2 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>Standup submitted successfully!</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Yesterday */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              What did you accomplish yesterday?
            </label>
            <textarea
              value={yesterday}
              onChange={(e) => setYesterday(e.target.value)}
              placeholder="Describe what you completed yesterday..."
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          {/* Today */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              What will you work on today?
            </label>
            <textarea
              value={today}
              onChange={(e) => setToday(e.target.value)}
              placeholder="Describe your plans for today..."
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          {/* Blockers */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Any blockers or impediments? (optional)
            </label>
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="Describe any blockers holding you back..."
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              rows={2}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || (!yesterday.trim() && !today.trim())}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Standup
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
