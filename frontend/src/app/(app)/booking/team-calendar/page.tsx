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
import { Calendar, Users, RefreshCw, ExternalLink, Plus, Copy, Check } from "lucide-react";
import Link from "next/link";
import { useTeams } from "@/hooks/useTeams";
import { TeamListItem } from "@/lib/api";

export default function TeamCalendarPage() {
  const { currentWorkspace } = useWorkspace();
  const { teams } = useTeams(currentWorkspace?.id || null);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<TeamAvailability | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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

  const getBookingUrl = () => {
    if (!currentWorkspace?.slug || !selectedEventTypeId) return null;
    const eventType = eventTypes.find(et => et.id === selectedEventTypeId);
    if (!eventType) return null;

    let url = `${window.location.origin}/book/${currentWorkspace.slug}/${eventType.slug}`;

    // Add team path if a specific team is selected
    if (selectedTeamId) {
      const team = teams.find(t => t.id === selectedTeamId);
      if (team) {
        url += `/team/${team.slug || team.id}`;
      }
    }

    return url;
  };

  const copyBookingLink = async () => {
    const url = getBookingUrl();
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Booking link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
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

        <div className="flex items-center gap-3">
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

          {/* Team selector */}
          {selectedEventTypeId && teams.length > 0 && (
            <select
              value={selectedTeamId || ""}
              onChange={(e) => setSelectedTeamId(e.target.value || null)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All assigned members</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}

          {/* Refresh button */}
          <button
            onClick={loadAvailability}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Copy Link button */}
          {selectedEventTypeId && currentWorkspace?.slug && (
            <button
              onClick={copyBookingLink}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg"
              title="Copy booking link"
            >
              {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
            </button>
          )}

          {/* Book Meeting button */}
          {selectedEventTypeId && currentWorkspace?.slug && (
            <Link
              href={getBookingUrl() || "#"}
              target="_blank"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Book Meeting
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
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
