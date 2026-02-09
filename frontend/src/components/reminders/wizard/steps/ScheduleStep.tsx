"use client";

import { ReminderFrequency } from "@/lib/api";
import { RefreshCw, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const FREQUENCIES: { value: ReminderFrequency; label: string; description: string }[] = [
  { value: "once", label: "One-time", description: "Single occurrence" },
  { value: "daily", label: "Daily", description: "Every day" },
  { value: "weekly", label: "Weekly", description: "Every week" },
  { value: "biweekly", label: "Bi-weekly", description: "Every 2 weeks" },
  { value: "monthly", label: "Monthly", description: "Every month" },
  { value: "quarterly", label: "Quarterly", description: "Every 3 months" },
  { value: "yearly", label: "Yearly", description: "Once a year" },
  { value: "custom", label: "Custom", description: "Cron expression" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

interface ScheduleStepProps {
  frequency: ReminderFrequency;
  setFrequency: (frequency: ReminderFrequency) => void;
  cronExpression: string;
  setCronExpression: (cron: string) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  timezone: string;
  setTimezone: (timezone: string) => void;
}

export function ScheduleStep({
  frequency,
  setFrequency,
  cronExpression,
  setCronExpression,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  timezone,
  setTimezone,
}: ScheduleStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Schedule</h2>
        <p className="text-slate-400">
          Configure when and how often this reminder should occur
        </p>
      </div>

      {/* Frequency */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-3">
          Frequency <span className="text-red-400">*</span>
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FREQUENCIES.map((freq) => (
            <button
              key={freq.value}
              onClick={() => setFrequency(freq.value)}
              className={cn(
                "p-3 rounded-lg border text-left transition-all",
                frequency === freq.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-slate-700 hover:border-slate-600"
              )}
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-white">{freq.label}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{freq.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Cron Expression */}
      {frequency === "custom" && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Cron Expression <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            placeholder="e.g., 0 9 * * 1 (Every Monday at 9 AM)"
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          <p className="text-xs text-slate-500 mt-2">
            Format: minute hour day-of-month month day-of-week
          </p>
          <div className="mt-2 p-3 bg-slate-700/50 rounded-lg">
            <p className="text-xs text-slate-400 font-medium mb-1">Examples:</p>
            <ul className="text-xs text-slate-500 space-y-1">
              <li><code className="text-slate-400">0 9 * * 1</code> - Every Monday at 9 AM</li>
              <li><code className="text-slate-400">0 0 1 * *</code> - First day of every month</li>
              <li><code className="text-slate-400">0 10 * * 1-5</code> - Weekdays at 10 AM</li>
            </ul>
          </div>
        </div>
      )}

      {/* Start Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Start Date <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            End Date (Optional)
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Leave blank for no end date
          </p>
        </div>
      </div>

      {/* Timezone */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Timezone
        </label>
        <div className="relative">
          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
