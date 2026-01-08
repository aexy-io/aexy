"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Clock,
  MapPin,
  Users,
  Link2,
  X,
  AlertCircle,
  Loader2,
  Video,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspace } from "@/hooks/useWorkspace";
import { googleIntegrationApi, developerApi, SyncedCalendarEvent } from "@/lib/api";

type ViewMode = "month" | "week" | "day";

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventTime(event: SyncedCalendarEvent) {
  if (event.is_all_day) return "All day";
  if (!event.start_time || !event.end_time) return "";
  const start = formatTime(event.start_time);
  const end = formatTime(event.end_time);
  return `${start} - ${end}`;
}

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

function EventCard({
  event,
  compact = false,
  onClick,
}: {
  event: SyncedCalendarEvent;
  compact?: boolean;
  onClick: () => void;
}) {
  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left px-2 py-1 text-xs bg-purple-500/20 text-purple-300 rounded truncate hover:bg-purple-500/30 transition-colors"
      >
        {event.is_all_day || !event.start_time ? "" : formatTime(event.start_time) + " "}
        {event.title}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-1 h-full min-h-[40px] rounded-full bg-purple-500" />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white truncate">{event.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatEventTime(event)}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3" />
                {event.location}
              </span>
            )}
          </div>
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
              <Users className="w-3 h-3" />
              {event.attendees.length} attendee{event.attendees.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function EventDetailModal({
  event,
  isOpen,
  onClose,
  workspaceId,
}: {
  event: SyncedCalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  if (!isOpen || !event) return null;

  const eventDate = event.start_time ? new Date(event.start_time) : new Date();
  const endDate = event.end_time ? new Date(event.end_time) : new Date();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-slate-800 rounded-xl w-full max-w-lg border border-slate-700 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white truncate">
            {event.title || "(No title)"}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-white">
                {eventDate.toLocaleDateString([], {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <p className="text-sm text-slate-400">
                {formatEventTime(event)}
              </p>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                {event.location.includes("meet.google.com") ||
                event.location.includes("zoom") ? (
                  <Video className="w-4 h-4 text-blue-400" />
                ) : (
                  <MapPin className="w-4 h-4 text-blue-400" />
                )}
              </div>
              <div>
                {event.location.startsWith("http") ? (
                  <a
                    href={event.location}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    Join meeting
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <p className="text-white">{event.location}</p>
                )}
              </div>
            </div>
          )}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-green-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-400 mb-2">
                  {event.attendees.length} attendee{event.attendees.length !== 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {event.attendees.slice(0, 5).map((attendee, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded"
                    >
                      {typeof attendee === "string" ? attendee : attendee.email}
                    </span>
                  ))}
                  {event.attendees.length > 5 && (
                    <span className="px-2 py-1 text-xs bg-slate-700 text-slate-400 rounded">
                      +{event.attendees.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="pt-4 border-t border-slate-700">
              <p className="text-sm text-slate-300 whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700">
          <button
            onClick={() => {}}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <Link2 className="w-4 h-4" />
            Link to Record
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
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
  events: SyncedCalendarEvent[];
  onEventClick: (event: SyncedCalendarEvent) => void;
  onDayClick: (date: Date) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();

  const weeks = useMemo(() => {
    const result: (number | null)[][] = [];
    let week: (number | null)[] = [];

    // Fill in empty days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      week.push(null);
    }

    // Fill in the days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day);
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
    }

    // Fill in remaining empty days
    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null);
      }
      result.push(week);
    }

    return result;
  }, [year, month, daysInMonth, firstDay]);

  const getEventsForDay = (day: number) => {
    const date = new Date(year, month, day);
    return events.filter((event) => {
      if (!event.start_time) return false;
      const eventDate = new Date(event.start_time);
      return isSameDay(eventDate, date);
    });
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex-1 overflow-auto">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-slate-800">
        {dayNames.map((day) => (
          <div
            key={day}
            className="px-2 py-3 text-center text-sm font-medium text-slate-400"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 flex-1">
        {weeks.map((week, weekIdx) =>
          week.map((day, dayIdx) => {
            if (day === null) {
              return (
                <div
                  key={`${weekIdx}-${dayIdx}`}
                  className="min-h-[120px] border-b border-r border-slate-800/50 bg-slate-900/30"
                />
              );
            }

            const date = new Date(year, month, day);
            const isToday = isSameDay(date, today);
            const dayEvents = getEventsForDay(day);

            return (
              <div
                key={`${weekIdx}-${dayIdx}`}
                onClick={() => onDayClick(date)}
                className="min-h-[120px] border-b border-r border-slate-800 p-2 hover:bg-slate-800/30 cursor-pointer transition-colors"
              >
                <div
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-sm mb-2 ${
                    isToday
                      ? "bg-purple-500 text-white font-medium"
                      : "text-slate-300"
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
                    <p className="text-xs text-slate-500 px-2">
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
  events: SyncedCalendarEvent[];
  onEventClick: (event: SyncedCalendarEvent) => void;
}) {
  const dayEvents = events.filter((event) => {
    if (!event.start_time) return false;
    const eventDate = new Date(event.start_time);
    return isSameDay(eventDate, date);
  });

  // Sort events by time
  dayEvents.sort((a, b) => {
    if (a.is_all_day && !b.is_all_day) return -1;
    if (!a.is_all_day && b.is_all_day) return 1;
    const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
    const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
    return aTime - bTime;
  });

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="text-lg font-semibold text-white mb-4">
        {date.toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </h2>

      {dayEvents.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <p>No events scheduled for this day</p>
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

function EmptyState({
  hasIntegration,
  onConnect,
  onSync,
}: {
  hasIntegration: boolean;
  onConnect: () => void;
  onSync: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-4">
      <div className="bg-slate-800/50 rounded-full p-6 mb-6">
        <CalendarIcon className="h-12 w-12 text-slate-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">
        {hasIntegration ? "No events synced yet" : "Connect your calendar"}
      </h2>
      <p className="text-slate-400 text-center max-w-md mb-6">
        {hasIntegration
          ? "Sync your Google Calendar to see events here and link them to contacts."
          : "Connect your Google account to sync calendar events."}
      </p>
      <button
        onClick={hasIntegration ? onSync : onConnect}
        className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
      >
        {hasIntegration ? (
          <>
            <RefreshCw className="h-4 w-4" />
            Sync Now
          </>
        ) : (
          <>
            <CalendarIcon className="h-4 w-4" />
            Connect Calendar
          </>
        )}
      </button>
    </div>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  // Check if returning from OAuth reconnect
  const isReconnecting = searchParams.get("reconnected") === "true";

  const [events, setEvents] = useState<SyncedCalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SyncedCalendarEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasIntegration, setHasIntegration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  useEffect(() => {
    if (!workspaceId) return;

    const loadEvents = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // First check workspace-level integration status
        let status = await googleIntegrationApi.getStatus(workspaceId);

        // Check developer level and sync tokens if:
        // 1. Not connected at workspace level, OR
        // 2. Returning from reconnect flow (need to refresh tokens)
        if (!status.is_connected || isReconnecting) {
          try {
            const developerStatus = await developerApi.getGoogleStatus();
            if (developerStatus.is_connected) {
              // Link/refresh developer's Google tokens to workspace
              await googleIntegrationApi.connectFromDeveloper(workspaceId);
              status = await googleIntegrationApi.getStatus(workspaceId);

              // Clear the reconnected param from URL
              if (isReconnecting) {
                router.replace("/crm/calendar", { scroll: false });
              }
            }
          } catch (linkError: unknown) {
            // Check if the error is about missing scopes
            const errorMessage = linkError instanceof Error ? linkError.message : String(linkError);
            if (errorMessage.includes("permissions") || errorMessage.includes("scopes")) {
              setError("Your Google connection needs Calendar permissions. Please reconnect with full access.");
              setNeedsReconnect(true);
            }
            // Continue with workspace-only status
          }
        }

        const hasCalendarSync = status.is_connected && status.calendar_sync_enabled;
        setHasIntegration(hasCalendarSync);

        if (hasCalendarSync) {
          const response = await googleIntegrationApi.calendar.listEvents(workspaceId);
          setEvents(response.events);
        }
      } catch (err) {
        console.error("Failed to load events:", err);
        setError("Failed to load calendar events");
      } finally {
        setIsLoading(false);
      }
    };

    loadEvents();
  }, [workspaceId, isReconnecting, router]);

  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const result = await googleIntegrationApi.calendar.sync(workspaceId);

      // Check for errors in response
      if (result.status === "error" || result.error) {
        const errorMessage = result.error || "Calendar sync failed";
        setSyncError(errorMessage);
        console.error("Calendar sync error:", errorMessage);

        // Check if it's a permissions/scope error
        if (errorMessage.includes("403") || errorMessage.includes("scope") || errorMessage.includes("permission")) {
          setNeedsReconnect(true);
          setSyncError("Calendar permissions are insufficient. Please reconnect with full access.");
        }
        return;
      }

      // Reload events after successful sync
      const response = await googleIntegrationApi.calendar.listEvents(workspaceId);
      setEvents(response.events);
    } catch (err) {
      console.error("Failed to sync events:", err);
      setSyncError("Failed to sync calendar. Please try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConnect = async () => {
    if (!workspaceId) return;
    try {
      const { auth_url } = await googleIntegrationApi.getConnectUrl(workspaceId, window.location.href);
      window.location.href = auth_url;
    } catch (err) {
      console.error("Failed to get connect URL:", err);
    }
  };

  const handleReconnect = () => {
    // Redirect to Google CRM connect with full permissions
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    // Add reconnected=true param so we know to refresh tokens when returning
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("reconnected", "true");
    const redirectUrl = encodeURIComponent(currentUrl.toString());
    window.location.href = `${apiBase}/auth/google/connect-crm?redirect_url=${redirectUrl}`;
  };

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

  const monthName = currentDate.toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading workspace...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/crm")}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              CRM
            </button>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-purple-400" />
              Calendar
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {hasIntegration && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
                />
                {isSyncing ? "Syncing..." : "Sync"}
              </button>
            )}
            <button
              onClick={() => router.push("/crm/settings/integrations")}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {(error || syncError) && (
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/30">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-4 h-4" />
              {error || syncError}
            </div>
            <div className="flex items-center gap-3">
              {needsReconnect && (
                <button
                  onClick={handleReconnect}
                  className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
                >
                  Reconnect Google
                </button>
              )}
              {(syncError || error) && (
                <button
                  onClick={() => {
                    setSyncError(null);
                    setError(null);
                    setNeedsReconnect(false);
                  }}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!hasIntegration || events.length === 0 ? (
        <EmptyState
          hasIntegration={hasIntegration}
          onConnect={handleConnect}
          onSync={handleSync}
        />
      ) : (
        <>
          {/* Calendar Controls */}
          <div className="border-b border-slate-800 px-6 py-3">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={goToToday}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  Today
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateMonth(-1)}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => navigateMonth(1)}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                <h2 className="text-lg font-semibold text-white">{monthName}</h2>
              </div>

              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
                {(["month", "week", "day"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                      viewMode === mode
                        ? "bg-slate-700 text-white"
                        : "text-slate-400 hover:text-white"
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
                onEventClick={setSelectedEvent}
                onDayClick={handleDayClick}
              />
            )}
            {viewMode === "day" && (
              <DayView
                date={selectedDay}
                events={events}
                onEventClick={setSelectedEvent}
              />
            )}
            {viewMode === "week" && (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <p>Week view coming soon</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Event Detail Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            isOpen={!!selectedEvent}
            onClose={() => setSelectedEvent(null)}
            workspaceId={workspaceId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
