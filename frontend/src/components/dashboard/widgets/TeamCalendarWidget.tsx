"use client";

import Link from "next/link";
import { Calendar, ChevronRight, ChevronLeft } from "lucide-react";
import { useState, useMemo } from "react";
import { useTeamCalendar } from "@/hooks/useLeave";

export function TeamCalendarWidget() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const startDate = new Date(year, month, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

  const { data: calendarData, isLoading } = useTeamCalendar({
    start_date: startDate,
    end_date: endDate,
  });

  // Build a map of date -> events for dot display
  const eventsByDate = useMemo(() => {
    const map: Record<string, { color: string; type: string }[]> = {};
    if (!calendarData?.events) return map;

    for (const event of calendarData.events) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const cursor = new Date(start);

      while (cursor <= end) {
        const key = cursor.toISOString().split("T")[0];
        if (!map[key]) map[key] = [];
        if (map[key].length < 3) {
          map[key].push({ color: event.color, type: event.type });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [calendarData]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split("T")[0];

  const prevMonth = () =>
    setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () =>
    setCurrentDate(new Date(year, month + 1, 1));

  const monthLabel = currentDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-4" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <Calendar className="h-5 w-5 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Team Calendar</h3>
        </div>
        <Link
          href="/booking/team-calendar"
          className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 transition"
        >
          View full <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={prevMonth}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-foreground">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-muted-foreground py-1"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-9" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === today;
            const events = eventsByDate[dateStr] || [];

            return (
              <div
                key={day}
                className={`h-9 flex flex-col items-center justify-center rounded-lg text-xs transition ${
                  isToday
                    ? "bg-indigo-600/20 text-indigo-300 font-semibold"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <span>{day}</span>
                {events.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {events.map((ev, idx) => (
                      <div
                        key={idx}
                        className="w-1 h-1 rounded-full"
                        style={{ backgroundColor: ev.color }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        {calendarData && calendarData.total > 0 && (
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
            <span>{calendarData.total} events this month</span>
          </div>
        )}
      </div>
    </div>
  );
}
