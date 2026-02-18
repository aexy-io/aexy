"use client";

import { useState } from "react";
import { Clock, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkingHoursConfig as WorkingHoursConfigType } from "@/lib/api";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Central European (CET)" },
  { value: "Asia/Tokyo", label: "Japan (JST)" },
  { value: "Asia/Shanghai", label: "China (CST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface WorkingHoursConfigProps {
  value: WorkingHoursConfigType | null;
  onChange: (value: WorkingHoursConfigType | null) => void;
  disabled?: boolean;
  className?: string;
}

export function WorkingHoursConfigPanel({
  value,
  onChange,
  disabled = false,
  className,
}: WorkingHoursConfigProps) {
  const config = value || {
    enabled: false,
    timezone: "UTC",
    start: "09:00",
    end: "17:00",
    days: [1, 2, 3, 4, 5],
  };

  const updateConfig = (updates: Partial<WorkingHoursConfigType>) => {
    if (disabled) return;
    onChange({ ...config, ...updates });
  };

  const toggleDay = (day: number) => {
    if (disabled) return;
    const days = config.days || [1, 2, 3, 4, 5];
    if (days.includes(day)) {
      updateConfig({ days: days.filter((d) => d !== day) });
    } else {
      updateConfig({ days: [...days, day].sort() });
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Enable toggle */}
      <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-accent/30">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => updateConfig({ enabled: e.target.checked })}
          disabled={disabled}
          className="w-4 h-4 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
        />
        <div className="flex-1">
          <div className="font-medium text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Enable Working Hours
          </div>
          <div className="text-sm text-muted-foreground">
            Agent will only respond during specified hours
          </div>
        </div>
      </label>

      {config.enabled && (
        <div className="space-y-4 pl-4 border-l-2 border-border">
          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Timezone
            </label>
            <select
              value={config.timezone}
              onChange={(e) => updateConfig({ timezone: e.target.value })}
              disabled={disabled}
              className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Start Time
              </label>
              <input
                type="time"
                value={config.start}
                onChange={(e) => updateConfig({ start: e.target.value })}
                disabled={disabled}
                className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                End Time
              </label>
              <input
                type="time"
                value={config.end}
                onChange={(e) => updateConfig({ end: e.target.value })}
                disabled={disabled}
                className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Days */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Active Days
            </label>
            <div className="flex gap-2">
              {DAYS.map((day) => {
                const isActive = (config.days || []).includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    disabled={disabled}
                    className={cn(
                      "w-10 h-10 rounded-lg text-sm font-medium transition",
                      isActive
                        ? "bg-purple-500 text-white"
                        : "bg-accent text-muted-foreground hover:bg-muted",
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Display-only version
interface WorkingHoursDisplayProps {
  config: WorkingHoursConfigType | null | undefined;
  className?: string;
}

export function WorkingHoursDisplay({ config, className }: WorkingHoursDisplayProps) {
  if (!config || !config.enabled) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        24/7 (Always active)
      </span>
    );
  }

  const activeDays = (config.days || [1, 2, 3, 4, 5])
    .map((d) => DAYS.find((day) => day.value === d)?.label)
    .filter(Boolean)
    .join(", ");

  const timezone = TIMEZONES.find((tz) => tz.value === config.timezone)?.label || config.timezone;

  return (
    <div className={cn("text-sm", className)}>
      <div className="text-foreground">
        {config.start} - {config.end}
      </div>
      <div className="text-muted-foreground">
        {activeDays} ({timezone})
      </div>
    </div>
  );
}
