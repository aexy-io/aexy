"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";

export type DateRangePreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "last_30_days" | "last_90_days" | "custom";

export interface DateRange {
  startDate: Date;
  endDate: Date;
  preset?: DateRangePreset;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: DateRangePreset[];
  showCustomRange?: boolean;
  className?: string;
}

const presetLabels: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  last_month: "Last Month",
  last_30_days: "Last 30 Days",
  last_90_days: "Last 90 Days",
  custom: "Custom Range",
};

function getPresetDateRange(preset: DateRangePreset): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  switch (preset) {
    case "today":
      return { startDate: today, endDate: endOfToday };

    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);
      return { startDate: yesterday, endDate: endOfYesterday };
    }

    case "this_week": {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      return { startDate: startOfWeek, endDate: endOfToday };
    }

    case "last_week": {
      const startOfLastWeek = new Date(today);
      startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
      endOfLastWeek.setHours(23, 59, 59, 999);
      return { startDate: startOfLastWeek, endDate: endOfLastWeek };
    }

    case "this_month": {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: startOfMonth, endDate: endOfToday };
    }

    case "last_month": {
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      endOfLastMonth.setHours(23, 59, 59, 999);
      return { startDate: startOfLastMonth, endDate: endOfLastMonth };
    }

    case "last_30_days": {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 29);
      return { startDate: thirtyDaysAgo, endDate: endOfToday };
    }

    case "last_90_days": {
      const ninetyDaysAgo = new Date(today);
      ninetyDaysAgo.setDate(today.getDate() - 89);
      return { startDate: ninetyDaysAgo, endDate: endOfToday };
    }

    default:
      return { startDate: today, endDate: endOfToday };
  }
}

export function DateRangePicker({
  value,
  onChange,
  presets = ["today", "this_week", "this_month", "last_30_days"],
  showCustomRange = true,
  className = "",
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePresetSelect = (preset: DateRangePreset) => {
    if (preset === "custom") {
      // Keep dropdown open for custom range selection
      return;
    }
    const range = getPresetDateRange(preset);
    onChange({ ...range, preset });
    setIsOpen(false);
  };

  const handleCustomRangeApply = () => {
    if (customStartDate && customEndDate) {
      const startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
      onChange({ startDate, endDate, preset: "custom" });
      setIsOpen(false);
    }
  };

  const formatDateRange = () => {
    if (value.preset && value.preset !== "custom") {
      return presetLabels[value.preset];
    }
    const formatDate = (date: Date) => date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: value.startDate.getFullYear() !== value.endDate.getFullYear() ? "numeric" : undefined
    });
    return `${formatDate(value.startDate)} - ${formatDate(value.endDate)}`;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground hover:border-border transition-colors"
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span>{formatDateRange()}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 z-50 bg-muted border border-border rounded-lg shadow-lg min-w-[240px]">
          {/* Preset options */}
          <div className="p-2 border-b border-border">
            {presets.map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetSelect(preset)}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  value.preset === preset
                    ? "bg-blue-600 text-white"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                {presetLabels[preset]}
              </button>
            ))}
          </div>

          {/* Custom range */}
          {showCustomRange && (
            <div className="p-3">
              <p className="text-xs text-muted-foreground mb-2">Custom Range</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={handleCustomRangeApply}
                  disabled={!customStartDate || !customEndDate}
                  className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper to get default date range for initialization
export function getDefaultDateRange(preset: DateRangePreset = "this_week"): DateRange {
  return {
    ...getPresetDateRange(preset),
    preset,
  };
}
