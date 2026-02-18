"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Bell,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useReminderCalendar } from "@/hooks/useReminders";
import {
  ReminderCategoryBadge,
  ReminderPriorityBadge,
} from "@/components/reminders/shared";
import { ReminderCalendarEvent, ReminderPriority, ReminderCategory } from "@/lib/api";

type ViewMode = "month" | "week" | "day";

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(date1: Date, date2: Date) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function EventCard({
  event,
  compact = false,
  onClick,
}: {
  event: ReminderCalendarEvent;
  compact?: boolean;
  onClick: () => void;
}) {
  const isOverdue = event.status === "overdue";
  const isCompleted = event.status === "completed";

  if (compact) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={`w-full text-left px-2 py-1 text-xs rounded truncate transition-colors ${
          isOverdue
            ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
            : isCompleted
            ? "bg-green-500/20 text-green-300 hover:bg-green-500/30"
            : "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
        }`}
      >
        {event.title}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl transition-all border ${
        isOverdue
          ? "bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border-red-800"
          : isCompleted
          ? "bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 border-green-800"
          : "bg-gray-800/50 hover:bg-gray-800 border-gray-700 hover:border-gray-600"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-1 h-full min-h-[40px] rounded-full ${
            isOverdue ? "bg-red-500" : isCompleted ? "bg-green-500" : "bg-blue-500"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isOverdue && <AlertTriangle className="w-4 h-4 text-red-400" />}
            {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            <h3 className="font-medium text-white truncate">{event.title}</h3>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(event.due_date)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {event.category && (
              <ReminderCategoryBadge category={event.category as ReminderCategory} size="sm" />
            )}
            {event.priority && (
              <ReminderPriorityBadge priority={event.priority as ReminderPriority} size="sm" />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function MonthView({
  year,
  month,
  events,
  onEventClick,
  onDayClick,
}: {
  year: number;
  month: number;
  events: ReminderCalendarEvent[];
  onEventClick: (event: ReminderCalendarEvent) => void;
  onDayClick: (date: Date) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();

  const weeks = useMemo(() => {
    const result: (number | null)[][] = [];
    let week: (number | null)[] = [];

    for (let i = 0; i < firstDay; i++) {
      week.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day);
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null);
      }
      result.push(week);
    }

    return result;
  }, [daysInMonth, firstDay]);

  const getEventsForDay = (day: number) => {
    const date = new Date(year, month, day);
    return events.filter((event) => {
      const eventDate = new Date(event.due_date);
      return isSameDay(eventDate, date);
    });
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 border-b border-gray-700">
        {dayNames.map((day) => (
          <div
            key={day}
            className="px-2 py-3 text-center text-sm font-medium text-gray-400"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1">
        {weeks.map((week, weekIdx) =>
          week.map((day, dayIdx) => {
            if (day === null) {
              return (
                <div
                  key={`${weekIdx}-${dayIdx}`}
                  className="min-h-[120px] border-b border-r border-gray-800/50 bg-gray-100 dark:bg-gray-900/30"
                />
              );
            }

            const date = new Date(year, month, day);
            const isToday = isSameDay(date, today);
            const dayEvents = getEventsForDay(day);
            const hasOverdue = dayEvents.some((e) => e.status === "overdue");

            return (
              <div
                key={`${weekIdx}-${dayIdx}`}
                onClick={() => onDayClick(date)}
                className="min-h-[120px] border-b border-r border-gray-700 p-2 hover:bg-gray-800/30 cursor-pointer transition-colors"
              >
                <div
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-sm mb-2 ${
                    isToday
                      ? "bg-blue-600 text-white font-medium"
                      : hasOverdue
                      ? "text-red-400"
                      : "text-gray-300"
                  }`}
                >
                  {day}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      compact
                      onClick={() => onEventClick(event)}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-xs text-gray-500 px-2">
                      +{dayEvents.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DayView({
  date,
  events,
  onEventClick,
}: {
  date: Date;
  events: ReminderCalendarEvent[];
  onEventClick: (event: ReminderCalendarEvent) => void;
}) {
  const dayEvents = events.filter((event) => {
    const eventDate = new Date(event.due_date);
    return isSameDay(eventDate, date);
  });

  // Sort: overdue first, then by priority
  dayEvents.sort((a, b) => {
    if (a.status === "overdue" && b.status !== "overdue") return -1;
    if (a.status !== "overdue" && b.status === "overdue") return 1;
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return (priorityOrder[a.priority as keyof typeof priorityOrder] || 4) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] || 4);
  });

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="text-lg font-semibold text-white mb-4">
        {date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </h2>

      {dayEvents.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p>No reminders due on this day</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onClick={() => onEventClick(event)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-4">
      <div className="bg-gray-800/50 rounded-full p-6 mb-6">
        <CalendarIcon className="h-12 w-12 text-gray-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">
        No reminders scheduled
      </h2>
      <p className="text-gray-400 text-center max-w-md mb-6">
        Create your first reminder to see it on the calendar.
      </p>
      <Link
        href="/compliance/reminders/new"
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Reminder
      </Link>
    </div>
  );
}

export default function RemindersCalendarPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Calculate date range for API query (current month plus some buffer)
  const startDate = useMemo(() => {
    const date = new Date(currentYear, currentMonth - 1, 1);
    return date.toISOString().split("T")[0];
  }, [currentYear, currentMonth]);

  const endDate = useMemo(() => {
    const date = new Date(currentYear, currentMonth + 2, 0);
    return date.toISOString().split("T")[0];
  }, [currentYear, currentMonth]);

  const { events, isLoading, error } = useReminderCalendar(
    workspaceId,
    startDate,
    endDate
  );

  const navigateMonth = (delta: number) => {
    setCurrentDate(new Date(currentYear, currentMonth + delta, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDay(new Date());
  };

  const handleDayClick = (date: Date) => {
    setSelectedDay(date);
    setViewMode("day");
  };

  const handleEventClick = (event: ReminderCalendarEvent) => {
    router.push(`/compliance/reminders/${event.reminder_id}`);
  };

  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400">Loading workspace...</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/compliance/reminders"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Reminders
            </Link>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-blue-400" />
              Calendar
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/compliance/reminders/new"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Reminder
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/30">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4 h-4" />
            Failed to load calendar events
          </div>
        </div>
      )}

      {events.length === 0 && !isLoading ? (
        <EmptyState />
      ) : (
        <>
          {/* Calendar Controls */}
          <div className="border-b border-gray-800 px-6 py-3">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={goToToday}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg transition-colors"
                >
                  Today
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateMonth(-1)}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => navigateMonth(1)}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                <h2 className="text-lg font-semibold text-white">{monthName}</h2>
              </div>

              <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
                {(["month", "day"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                      viewMode === mode
                        ? "bg-gray-700 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Calendar Content */}
          <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full">
            {viewMode === "month" && (
              <MonthView
                year={currentYear}
                month={currentMonth}
                events={events}
                onEventClick={handleEventClick}
                onDayClick={handleDayClick}
              />
            )}
            {viewMode === "day" && (
              <DayView
                date={selectedDay}
                events={events}
                onEventClick={handleEventClick}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
