"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { bookingApi, Booking, EventType } from "@/lib/booking-api";
import { format, parseISO, isToday, isTomorrow, isPast } from "date-fns";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  Phone,
  Plus,
  Settings,
  Users,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

export default function BookingDashboard() {
  const { currentWorkspace } = useWorkspace();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentWorkspace?.id) {
      loadData();
    }
  }, [currentWorkspace?.id]);

  const loadData = async () => {
    if (!currentWorkspace?.id) return;

    try {
      const [bookingsData, eventTypesData, statsData] = await Promise.all([
        bookingApi.bookings.getUpcoming(currentWorkspace.id, 5),
        bookingApi.eventTypes.listMy(currentWorkspace.id, { is_active: true }),
        bookingApi.bookings.getStats(currentWorkspace.id),
      ]);

      setUpcomingBookings(bookingsData);
      setEventTypes(eventTypesData.event_types);
      setStats(statsData);
    } catch (error) {
      console.error("Failed to load booking data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "EEE, MMM d");
  };

  const getLocationIcon = (locationType: string) => {
    switch (locationType) {
      case "zoom":
      case "google_meet":
      case "microsoft_teams":
        return <Video className="h-4 w-4" />;
      case "phone":
        return <Phone className="h-4 w-4" />;
      case "in_person":
        return <MapPin className="h-4 w-4" />;
      default:
        return <Video className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Booking</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your event types, availability, and bookings
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/booking/availability"
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            Availability
          </Link>
          <Link
            href="/booking/event-types/new"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Event Type
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Bookings</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {stats.total_bookings || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Confirmed</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {stats.by_status?.confirmed || 0}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Completion Rate</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {stats.completion_rate || 0}%
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">No-Show Rate</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {stats.no_show_rate || 0}%
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Event Types */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Event Types
              </h2>
              <Link
                href="/booking/event-types"
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {eventTypes.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No event types yet
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  Create your first event type to start accepting bookings
                </p>
                <Link
                  href="/booking/event-types/new"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Event Type
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {eventTypes.slice(0, 5).map((eventType) => (
                  <Link
                    key={eventType.id}
                    href={`/booking/event-types/${eventType.id}`}
                    className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div
                      className="w-3 h-12 rounded-full"
                      style={{ backgroundColor: eventType.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {eventType.name}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {eventType.duration_minutes} min
                        </span>
                        <span className="flex items-center gap-1">
                          {getLocationIcon(eventType.location_type)}
                          {eventType.location_type.replace("_", " ")}
                        </span>
                        {eventType.is_team_event && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            Team
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        navigator.clipboard.writeText(
                          `${window.location.origin}/book/${currentWorkspace?.slug}/${eventType.slug}`
                        );
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Copy booking link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Bookings */}
        <div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Upcoming Bookings
              </h2>
            </div>

            {upcomingBookings.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  No upcoming bookings
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {upcomingBookings.map((booking) => (
                  <Link
                    key={booking.id}
                    href={`/booking/bookings/${booking.id}`}
                    className="p-4 block hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-2 h-2 rounded-full mt-2"
                        style={{ backgroundColor: booking.event_type?.color || "#3B82F6" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {booking.invitee_name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {booking.event_type?.name}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                          <span className="font-medium">
                            {getDateLabel(booking.start_time)}
                          </span>
                          <span>
                            {format(parseISO(booking.start_time), "h:mm a")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              Quick Links
            </h3>
            <div className="space-y-2">
              <Link
                href="/booking/calendars"
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              >
                <Calendar className="h-4 w-4" />
                Calendar Connections
              </Link>
              <Link
                href="/booking/availability"
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              >
                <Clock className="h-4 w-4" />
                Manage Availability
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
