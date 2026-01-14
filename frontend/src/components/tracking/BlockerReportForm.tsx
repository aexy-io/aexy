"use client";

import { useState } from "react";
import { AlertTriangle, Send, CheckCircle2 } from "lucide-react";
import { BlockerCreate } from "@/lib/api";

interface BlockerReportFormProps {
  onSubmit: (data: BlockerCreate) => Promise<void>;
  isSubmitting?: boolean;
  taskId?: string;
  taskTitle?: string;
  sprintId?: string;
  teamId?: string;
}

const severityOptions = [
  { value: "low", label: "Low", description: "Minor inconvenience, work can continue" },
  { value: "medium", label: "Medium", description: "Slowing progress, needs attention soon" },
  { value: "high", label: "High", description: "Significantly blocking progress" },
  { value: "critical", label: "Critical", description: "Work completely stopped" },
];

const categoryOptions = [
  { value: "technical", label: "Technical", description: "Code, infrastructure, or tooling issue" },
  { value: "dependency", label: "Dependency", description: "Waiting on another task or team" },
  { value: "resource", label: "Resource", description: "Missing people, access, or equipment" },
  { value: "external", label: "External", description: "Third-party or external dependency" },
];

export function BlockerReportForm({
  onSubmit,
  isSubmitting = false,
  taskId,
  taskTitle,
  sprintId,
  teamId,
}: BlockerReportFormProps) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [category, setCategory] = useState("technical");
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !teamId) return;

    try {
      await onSubmit({
        description: description.trim(),
        severity: severity as "low" | "medium" | "high" | "critical",
        category: category as "technical" | "dependency" | "resource" | "external",
        task_id: taskId,
        sprint_id: sprintId,
        team_id: teamId,
      });

      setDescription("");
      setSeverity("medium");
      setCategory("technical");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to report blocker:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        Report Blocker
        {taskTitle && (
          <span className="text-sm font-normal text-slate-400">for {taskTitle}</span>
        )}
      </h3>

      {showSuccess && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg flex items-center gap-2 text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          <span>Blocker reported successfully!</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            What's blocking you?
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the blocker in detail..."
            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            rows={3}
            required
          />
        </div>

        {/* Severity */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Severity</label>
          <div className="grid grid-cols-2 gap-2">
            {severityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSeverity(option.value)}
                className={`p-3 rounded-lg border text-left transition ${
                  severity === option.value
                    ? "bg-slate-700 border-red-500"
                    : "bg-slate-800 border-slate-600 hover:border-slate-500"
                }`}
              >
                <div className="font-medium text-white">{option.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
          <div className="grid grid-cols-2 gap-2">
            {categoryOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={`p-3 rounded-lg border text-left transition ${
                  category === option.value
                    ? "bg-slate-700 border-blue-500"
                    : "bg-slate-800 border-slate-600 hover:border-slate-500"
                }`}
              >
                <div className="font-medium text-white">{option.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{option.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || !description.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Reporting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Report Blocker
            </>
          )}
        </button>
      </div>
    </form>
  );
}
