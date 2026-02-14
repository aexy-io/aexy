"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTeamCalendar } from "@/hooks/useLeave";
import { EventDetailModal } from "./EventDetailModal";

interface TeamCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: "leave" | "booking" | "holiday";
  color: string;
  all_day: boolean;
  developer_id: string | null;
  developer_name: string | null;
  developer_avatar: string | null;
  metadata: Record<string, unknown>;
}

interface TeamCalendarProps {
  teamId?: string;
  eventTypes?: string[];
}

export function TeamCalendar({ teamId, eventTypes }: TeamCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<TeamCalendarEvent | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const startDate = new Date(year, month, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

  const { data: calendarData, isLoading } = useTeamCalendar({
    start_date: startDate,
    end_date: endDate,
    team_id: teamId,
    event_types: eventTypes,
  });

  // Build events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, TeamCalendarEvent[]> = {};
    if (!calendarData?.events) return map;

    for (const event of calendarData.events) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const cursor = new Date(start);

      while (cursor <= end) {
        const key = cursor.toISOString().split("T")[0];
        if (!map[key]) map[key] = [];
        map[key].push(event as TeamCalendarEvent);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [calendarData]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split("T")[0];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const monthLabel = currentDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded mb-4" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-800/50 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="text-lg font-semibold text-white min-w-[180px] text-center">
            {monthLabel}
          </h3>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
        >
          Today
        </button>
      </div>

      {/* Calendar grid */}
      <div className="p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-slate-500 py-2"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="min-h-[90px] bg-slate-800/20 rounded-lg"
            />
          ))}

          {/* Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === today;
            const dayEvents = eventsByDate[dateStr] || [];
            const isWeekend = new Date(year, month, day).getDay() % 6 === 0;

            return (
              <div
                key={day}
                className={`min-h-[90px] rounded-lg p-1.5 transition ${
                  isToday
                    ? "bg-blue-600/10 border border-blue-500/30"
                    : isWeekend
                      ? "bg-slate-800/30"
                      : "bg-slate-800/10 hover:bg-slate-800/30"
                }`}
              >
                <span
                  className={`text-xs font-medium block mb-1 ${
                    isToday
                      ? "text-blue-400"
                      : isWeekend
                        ? "text-slate-600"
                        : "text-slate-400"
                  }`}
                >
                  {day}
                </span>

                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate transition hover:opacity-80"
                      style={{
                        backgroundColor: `${ev.color}20`,
                        color: ev.color,
                      }}
                      title={ev.title}
                    >
                      {ev.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-slate-500 pl-1.5">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event detail modal */}
      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
