"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { publicBookingApi } from "@/lib/booking-api";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  Phone,
  User,
  Mail,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Copy,
  CalendarPlus,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface BookingConfirmation {
  id: string;
  event_type: {
    name: string;
    description?: string;
    duration_minutes: number;
    location_type: string;
    color: string;
  };
  host: {
    name: string;
    email: string;
  };
  invitee_name: string;
  invitee_email: string;
  start_time: string;
  end_time: string;
  timezone: string;
  location?: string;
  meeting_link?: string;
  status: string;
  cancel_token?: string;
  reschedule_token?: string;
}

export default function BookingConfirmationPage() {
  const params = useParams();
  const [booking, setBooking] = useState<BookingConfirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.bookingId) {
      loadBooking();
    }
  }, [params.bookingId]);

  const loadBooking = async () => {
    try {
      const data = await publicBookingApi.getBooking(params.bookingId as string);
      setBooking(data);
    } catch (error: any) {
      console.error("Failed to load booking:", error);
      setError(error.response?.data?.detail || "Booking not found");
    } finally {
      setLoading(false);
    }
  };

  const getLocationIcon = (locationType: string) => {
    switch (locationType) {
      case "zoom":
      case "google_meet":
      case "microsoft_teams":
        return <Video className="h-5 w-5" />;
      case "phone":
        return <Phone className="h-5 w-5" />;
      case "in_person":
        return <MapPin className="h-5 w-5" />;
      default:
        return <Video className="h-5 w-5" />;
    }
  };

  const getLocationLabel = (locationType: string) => {
    switch (locationType) {
      case "zoom":
        return "Zoom Meeting";
      case "google_meet":
        return "Google Meet";
      case "microsoft_teams":
        return "Microsoft Teams";
      case "phone":
        return "Phone Call";
      case "in_person":
        return "In Person";
      default:
        return "Video Call";
    }
  };

  const copyMeetingLink = () => {
    if (booking?.meeting_link) {
      navigator.clipboard.writeText(booking.meeting_link);
      toast.success("Meeting link copied!");
    }
  };

  const addToCalendar = (type: "google" | "outlook" | "ical") => {
    if (!booking) return;

    const start = parseISO(booking.start_time);
    const end = parseISO(booking.end_time);
    const title = encodeURIComponent(booking.event_type.name);
    const description = encodeURIComponent(
      `Meeting with ${booking.host.name}\n${booking.meeting_link || ""}`
    );
    const location = encodeURIComponent(booking.meeting_link || booking.location || "");

    if (type === "google") {
      const startStr = format(start, "yyyyMMdd'T'HHmmss");
      const endStr = format(end, "yyyyMMdd'T'HHmmss");
      window.open(
        `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${description}&location=${location}`,
        "_blank"
      );
    } else if (type === "outlook") {
      const startStr = format(start, "yyyy-MM-dd'T'HH:mm:ss");
      const endStr = format(end, "yyyy-MM-dd'T'HH:mm:ss");
      window.open(
        `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${startStr}&enddt=${endStr}&body=${description}&location=${location}`,
        "_blank"
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Booking Not Found
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {error || "This booking could not be found or has been cancelled."}
          </p>
        </div>
      </div>
    );
  }

  const startDate = parseISO(booking.start_time);
  const endDate = parseISO(booking.end_time);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Booking Confirmed!
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            A confirmation email has been sent to {booking.invitee_email}
          </p>
        </div>

        {/* Booking Details Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Event Header */}
          <div
            className="h-2"
            style={{ backgroundColor: booking.event_type.color }}
          />
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
              {booking.event_type.name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              with {booking.host.name}
            </p>
          </div>

          {/* Details */}
          <div className="px-6 pb-6 space-y-4">
            {/* Date & Time */}
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {format(startDate, "EEEE, MMMM d, yyyy")}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}{" "}
                  ({booking.timezone})
                </div>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
              <div className="text-gray-900 dark:text-white">
                {booking.event_type.duration_minutes} minutes
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-3">
              {getLocationIcon(booking.event_type.location_type)}
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  {getLocationLabel(booking.event_type.location_type)}
                </div>
                {booking.meeting_link && (
                  <div className="flex items-center gap-2 mt-1">
                    <a
                      href={booking.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 truncate"
                    >
                      {booking.meeting_link}
                    </a>
                    <button
                      onClick={copyMeetingLink}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {booking.location && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {booking.location}
                  </div>
                )}
              </div>
            </div>

            {/* Invitee */}
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {booking.invitee_name}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {booking.invitee_email}
                </div>
              </div>
            </div>
          </div>

          {/* Add to Calendar */}
          <div className="px-6 pb-6">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Add to calendar
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => addToCalendar("google")}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2"
              >
                <CalendarPlus className="h-4 w-4" />
                Google
              </button>
              <button
                onClick={() => addToCalendar("outlook")}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-2"
              >
                <CalendarPlus className="h-4 w-4" />
                Outlook
              </button>
            </div>
          </div>

          {/* Actions */}
          {(booking.cancel_token || booking.reschedule_token) && (
            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
              <div className="flex gap-3 text-sm">
                {booking.reschedule_token && (
                  <Link
                    href={`/book/reschedule/${booking.id}?token=${booking.reschedule_token}`}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Reschedule
                  </Link>
                )}
                {booking.cancel_token && (
                  <Link
                    href={`/book/cancel/${booking.id}?token=${booking.cancel_token}`}
                    className="text-red-600 hover:text-red-700"
                  >
                    Cancel booking
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
