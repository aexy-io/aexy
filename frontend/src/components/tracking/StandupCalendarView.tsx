"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, MessageSquare, Check, X } from "lucide-react";
import { Standup } from "@/lib/api";
import { SentimentBadge } from "./shared";

interface StandupCalendarViewProps {
  standups: Standup[];
  onSelectDate?: (date: Date, standup?: Standup) => void;
  className?: string;
}

export function StandupCalendarView({
  standups,
  onSelectDate,
  className = "",
}: StandupCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Build a map of date to standup
  const standupMap = useMemo(() => {
    const map = new Map<string, Standup>();
    standups.forEach((standup) => {
      const dateKey = standup.standup_date.split("T")[0];
      map.set(dateKey, standup);
    });
    return map;
  }, [standups]);

  // Get calendar data for current month
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // First day of the month
    const firstDay = new Date(year, month, 1);
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);

    // Start from Sunday of the week containing the first day
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // End on Saturday of the week containing the last day
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const days: Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      standup?: Standup;
    }> = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split("T")[0];
      const isCurrentMonth = d.getMonth() === month;
      const isToday = d.getTime() === today.getTime();

      days.push({
        date: new Date(d),
        isCurrentMonth,
        isToday,
        standup: standupMap.get(dateKey),
      });
    }

    return days;
  }, [currentMonth, standupMap]);

  const navigateMonth = (direction: number) => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1)
    );
  };

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-400" />
          Standup Calendar
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-2 hover:bg-slate-700 rounded-lg transition"
          >
            <ChevronLeft className="h-4 w-4 text-slate-400" />
          </button>
          <span className="text-white font-medium min-w-[140px] text-center">
            {currentMonth.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <button
            onClick={() => navigateMonth(1)}
            className="p-2 hover:bg-slate-700 rounded-lg transition"
          >
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekdays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-slate-500 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          const hasStandup = !!day.standup;
          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
          const isPast = day.date < new Date() && !day.isToday;
          const isMissed = isPast && !hasStandup && day.isCurrentMonth && !isWeekend;

          return (
            <button
              key={index}
              onClick={() => onSelectDate?.(day.date, day.standup)}
              className={`
                relative aspect-square p-1 rounded-lg transition flex flex-col items-center justify-center
                ${day.isCurrentMonth ? "text-white" : "text-slate-600"}
                ${day.isToday ? "ring-2 ring-blue-500" : ""}
                ${hasStandup ? "bg-green-900/30 hover:bg-green-900/50" : "hover:bg-slate-700"}
                ${isMissed ? "bg-red-900/20" : ""}
              `}
            >
              <span
                className={`text-sm ${
                  day.isToday ? "font-bold text-blue-400" : ""
                }`}
              >
                {day.date.getDate()}
              </span>
              {hasStandup && (
                <div className="absolute bottom-1">
                  <Check className="h-3 w-3 text-green-400" />
                </div>
              )}
              {isMissed && (
                <div className="absolute bottom-1">
                  <X className="h-3 w-3 text-red-400/50" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-3 h-3 rounded bg-green-900/30" />
          <span>Submitted</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-3 h-3 rounded bg-red-900/20" />
          <span>Missed</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-3 h-3 rounded ring-2 ring-blue-500" />
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

// Compact calendar widget for sidebar
export function StandupCalendarWidget({
  standups,
  onViewAll,
}: {
  standups: Standup[];
  onViewAll?: () => void;
}) {
  // Get last 7 days
  const last7Days = useMemo(() => {
    const days = [];
    const standupDates = new Set(
      standups.map((s) => s.standup_date.split("T")[0])
    );

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      days.push({
        date,
        hasStandup: standupDates.has(dateKey),
        isToday: i === 0,
      });
    }
    return days;
  }, [standups]);

  const completedCount = last7Days.filter((d) => d.hasStandup).length;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">This Week</span>
        <span className="text-xs text-slate-400">{completedCount}/7 days</span>
      </div>
      <div className="flex gap-1">
        {last7Days.map((day, i) => (
          <div
            key={i}
            className={`flex-1 aspect-square rounded flex items-center justify-center ${
              day.hasStandup
                ? "bg-green-600"
                : day.isToday
                ? "bg-slate-600 ring-1 ring-blue-500"
                : "bg-slate-700"
            }`}
          >
            <span className="text-[10px] text-white/70">
              {day.date.toLocaleDateString("en-US", { weekday: "narrow" })}
            </span>
          </div>
        ))}
      </div>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="w-full mt-3 text-xs text-blue-400 hover:text-blue-300 transition"
        >
          View full calendar
        </button>
      )}
    </div>
  );
}
