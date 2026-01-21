"use client";

import { format, parseISO, isToday, isTomorrow, isPast } from "date-fns";
import Link from "next/link";
import { Video, MapPin, Phone, User, Clock, Calendar } from "lucide-react";
import { Booking } from "@/lib/booking-api";

interface BookingCardProps {
  booking: Booking;
  showHost?: boolean;
  showActions?: boolean;
  onCancel?: () => void;
  onReschedule?: () => void;
  onMarkNoShow?: () => void;
  className?: string;
}

export function BookingCard({
  booking,
  showHost = false,
  showActions = false,
  onCancel,
  onReschedule,
  onMarkNoShow,
  className = "",
}: BookingCardProps) {
  const startDate = parseISO(booking.start_time);
  const endDate = parseISO(booking.end_time);
  const isPastBooking = isPast(endDate);

  const getDateLabel = () => {
    if (isToday(startDate)) return "Today";
    if (isTomorrow(startDate)) return "Tomorrow";
    return format(startDate, "EEE, MMM d");
  };

  const getLocationIcon = () => {
    const locationType = booking.event_type?.location_type || "video";
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

  const getStatusBadge = () => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      pending: {
        label: "Pending",
        className: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
      },
      confirmed: {
        label: "Confirmed",
        className: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
      },
      cancelled: {
        label: "Cancelled",
        className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
      },
      completed: {
        label: "Completed",
        className: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400",
      },
      no_show: {
        label: "No Show",
        className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
      },
    };

    const config = statusConfig[booking.status] || statusConfig.pending;
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${config.className}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${
        isPastBooking ? "opacity-60" : ""
      } ${className}`}
    >
      <div className="flex">
        {/* Color bar */}
        <div
          className="w-2 flex-shrink-0"
          style={{ backgroundColor: booking.event_type?.color || "#3B82F6" }}
        />

        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {/* Event name */}
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {booking.event_type?.name || "Meeting"}
              </h3>

              {/* Invitee or Host */}
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <User className="h-4 w-4" />
                {showHost && booking.host ? (
                  <span>with {booking.host.name || booking.host.email}</span>
                ) : (
                  <span>{booking.invitee_name}</span>
                )}
              </div>

              {/* Date & Time */}
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">{getDateLabel()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
                  </span>
                </div>
              </div>

              {/* Location */}
              {(booking.meeting_link || booking.location) && (
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {getLocationIcon()}
                  {booking.meeting_link ? (
                    <a
                      href={booking.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 truncate max-w-[200px]"
                    >
                      Join meeting
                    </a>
                  ) : (
                    <span className="truncate">{booking.location}</span>
                  )}
                </div>
              )}
            </div>

            {/* Status badge */}
            <div className="ml-4">{getStatusBadge()}</div>
          </div>

          {/* Actions */}
          {showActions && booking.status !== "cancelled" && booking.status !== "completed" && !isPastBooking && (
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              {onReschedule && (
                <button
                  onClick={onReschedule}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Reschedule
                </button>
              )}
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Cancel
                </button>
              )}
              {onMarkNoShow && isPastBooking && booking.status === "confirmed" && (
                <button
                  onClick={onMarkNoShow}
                  className="text-sm text-gray-600 hover:text-gray-700"
                >
                  Mark as No Show
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
