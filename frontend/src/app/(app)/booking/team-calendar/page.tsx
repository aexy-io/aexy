"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  bookingApi,
  TeamAvailability,
  EventType,
  TeamBookingBrief,
} from "@/lib/booking-api";
import { TeamCalendarView } from "@/components/booking/TeamCalendarView";
import { format, addDays, startOfWeek } from "date-fns";
import { toast } from "sonner";
import { Calendar, Users, RefreshCw } from "lucide-react";

export default function TeamCalendarPage() {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<TeamAvailability | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  // Load event types
  useEffect(() => {
    if (currentWorkspace?.id) {
      loadEventTypes();
    }
  }, [currentWorkspace?.id]);

  // Load availability when event type or date changes
  useEffect(() => {
    if (currentWorkspace?.id && selectedEventTypeId) {
      loadAvailability();
    }
  }, [currentWorkspace?.id, selectedEventTypeId, currentWeekStart]);

  const loadEventTypes = async () => {
    if (!currentWorkspace?.id) return;

    try {
      const data = await bookingApi.eventTypes.list(currentWorkspace.id, {
        is_team_event: true,
      });
      setEventTypes(data.event_types);

      // Auto-select first team event type
      if (data.event_types.length > 0 && !selectedEventTypeId) {
        setSelectedEventTypeId(data.event_types[0].id);
      }
    } catch (error) {
      console.error("Failed to load event types:", error);
      toast.error("Failed to load event types");
    }
  };

  const loadAvailability = useCallback(async () => {
    if (!currentWorkspace?.id || !selectedEventTypeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const startDate = format(currentWeekStart, "yyyy-MM-dd");
      const endDate = format(addDays(currentWeekStart, 6), "yyyy-MM-dd");

      const data = await bookingApi.teamAvailability.get(currentWorkspace.id, {
        start_date: startDate,
        end_date: endDate,
        event_type_id: selectedEventTypeId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setAvailability(data);
    } catch (error) {
      console.error("Failed to load team availability:", error);
      toast.error("Failed to load team availability");
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace?.id, selectedEventTypeId, currentWeekStart]);

  const handleSlotClick = (date: string, time: string) => {
    // Could open a booking modal or navigate to booking page
    console.log("Slot clicked:", date, time);
    toast.info(`Selected ${date} at ${time}`);
  };

  const handleBookingClick = (booking: TeamBookingBrief) => {
    // Could open booking details or navigate
    console.log("Booking clicked:", booking);
    toast.info(`Booking: ${booking.event_name} with ${booking.invitee_name}`);
  };

  const handleDateChange = (date: Date) => {
    setCurrentWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
  };

  // Show empty state if no team event types
  if (!loading && eventTypes.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Team Calendar
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            View your team&apos;s availability at a glance
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No team event types
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Create a team event type first to view team availability. Team event
            types allow multiple team members to be assigned to bookings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Team Calendar
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            View your team&apos;s availability at a glance
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Event type selector */}
          <select
            value={selectedEventTypeId || ""}
            onChange={(e) => setSelectedEventTypeId(e.target.value || null)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">Select team event...</option>
            {eventTypes.map((et) => (
              <option key={et.id} value={et.id}>
                {et.name}
              </option>
            ))}
          </select>

          {/* Refresh button */}
          <button
            onClick={loadAvailability}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Calendar */}
      {loading && !availability ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : availability ? (
        <TeamCalendarView
          availability={availability}
          onSlotClick={handleSlotClick}
          onBookingClick={handleBookingClick}
          startDate={currentWeekStart}
          onDateChange={handleDateChange}
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Select an event type
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Choose a team event type above to view team availability
          </p>
        </div>
      )}
    </div>
  );
}
