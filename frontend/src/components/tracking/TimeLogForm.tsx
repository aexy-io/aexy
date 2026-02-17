"use client";

import { useState } from "react";
import { Clock, Save, CheckCircle2 } from "lucide-react";
import { TimeEntryCreate } from "@/lib/api";

interface TimeLogFormProps {
  onSubmit: (data: TimeEntryCreate) => Promise<void>;
  isSubmitting?: boolean;
  taskId?: string;
  taskTitle?: string;
  sprintId?: string;
}

export function TimeLogForm({
  onSubmit,
  isSubmitting = false,
  taskId,
  taskTitle,
  sprintId,
}: TimeLogFormProps) {
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [description, setDescription] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const totalMinutes = (parseInt(hours || "0") * 60) + parseInt(minutes || "0");
    if (totalMinutes <= 0) return;

    try {
      await onSubmit({
        task_id: taskId,
        sprint_id: sprintId,
        duration_minutes: totalMinutes,
        description: description.trim() || undefined,
        entry_date: entryDate,
        source: "web",
      });

      setHours("");
      setMinutes("");
      setDescription("");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to log time:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-muted rounded-xl p-6 border border-border">
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-green-400" />
        Log Time
        {taskTitle && (
          <span className="text-sm font-normal text-muted-foreground">for {taskTitle}</span>
        )}
      </h3>

      {showSuccess && (
        <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-700 rounded-lg flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          <span>Time logged successfully!</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Duration */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Duration</label>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0"
                min="0"
                max="24"
                className="w-16 px-3 py-2 bg-accent border border-border rounded-lg text-foreground text-center focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="text-muted-foreground text-sm">hours</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="0"
                min="0"
                max="59"
                className="w-16 px-3 py-2 bg-accent border border-border rounded-lg text-foreground text-center focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="text-muted-foreground text-sm">minutes</span>
            </div>
          </div>
        </div>

        {/* Quick Time Buttons */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "15m", mins: 15 },
            { label: "30m", mins: 30 },
            { label: "1h", mins: 60 },
            { label: "2h", mins: 120 },
            { label: "4h", mins: 240 },
            { label: "8h", mins: 480 },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => {
                setHours(String(Math.floor(option.mins / 60)));
                setMinutes(String(option.mins % 60));
              }}
              className="px-3 py-1.5 bg-accent text-foreground rounded-lg text-sm hover:bg-muted transition"
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Date</label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on?"
            className="w-full px-4 py-3 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            rows={2}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || ((parseInt(hours || "0") * 60) + parseInt(minutes || "0") <= 0)}
          className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Logging...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Log Time
            </>
          )}
        </button>
      </div>
    </form>
  );
}
