"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspace } from "@/hooks/useWorkspace";
import { bookingApi, Booking } from "@/lib/booking-api";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Mail,
  Phone,
  User,
  Video,
  MapPin,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
  Ban,
  UserX,
  CheckSquare,
} from "lucide-react";

export default function BookingDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;
  const { currentWorkspace } = useWorkspace();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (currentWorkspace?.id && bookingId) {
      loadBooking();
    }
  }, [currentWorkspace?.id, bookingId]);

  const loadBooking = async () => {
    if (!currentWorkspace?.id) return;

    try {
      setLoading(true);
      const data = await bookingApi.bookings.get(currentWorkspace.id, bookingId);
      setBooking(data);
    } catch (error) {
      console.error("Failed to load booking:", error);
      toast.error("Failed to load booking details");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!currentWorkspace?.id || !booking) return;

    if (!confirm("Are you sure you want to cancel this booking?")) return;

    try {
      setActionLoading(true);
      await bookingApi.bookings.cancel(currentWorkspace.id, booking.id);
      toast.success("Booking cancelled");
      await loadBooking();
    } catch (error) {
      toast.error("Failed to cancel booking");
    } finally {
      setActionLoading(false);
    }
  };

  const handleNoShow = async () => {
    if (!currentWorkspace?.id || !booking) return;

    if (!confirm("Mark this booking as no-show?")) return;

    try {
      setActionLoading(true);
      await bookingApi.bookings.markNoShow(currentWorkspace.id, booking.id);
      toast.success("Booking marked as no-show");
      await loadBooking();
    } catch (error) {
      toast.error("Failed to mark as no-show");
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "pending":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "cancelled":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "completed":
        return <CheckSquare className="h-5 w-5 text-blue-500" />;
      case "no_show":
        return <UserX className="h-5 w-5 text-gray-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "completed":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "no_show":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const getLocationIcon = (locationType: string | undefined) => {
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

  const canCancel = booking?.status === "confirmed" || booking?.status === "pending";
  const canMarkNoShow = booking?.status === "confirmed";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Booking not found
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            The booking you're looking for doesn't exist or you don't have access to it.
          </p>
          <Link
            href="/booking"
            className="text-blue-600 hover:text-blue-700 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Booking
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/booking"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Booking
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Booking with {booking.invitee_name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {booking.event_type?.name || "Meeting"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {getStatusIcon(booking.status)}
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full capitalize ${getStatusColor(
                booking.status
              )}`}
            >
              {booking.status.replace("_", " ")}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Date & Time */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Date & Time
            </h2>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {format(parseISO(booking.start_time), "EEEE, MMMM d, yyyy")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {format(parseISO(booking.start_time), "h:mm a")} -{" "}
                    {format(parseISO(booking.end_time), "h:mm a")}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {booking.timezone}
                  </p>
                </div>
              </div>

              {booking.event_type && (
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-gray-400" />
                  <p className="text-gray-600 dark:text-gray-300">
                    {booking.event_type.duration_minutes} minutes
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Invitee Details */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Invitee Details
            </h2>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-gray-400" />
                <p className="font-medium text-gray-900 dark:text-white">
                  {booking.invitee_name}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <a
                  href={`mailto:${booking.invitee_email}`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {booking.invitee_email}
                </a>
              </div>

              {booking.invitee_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-gray-400" />
                  <a
                    href={`tel:${booking.invitee_phone}`}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    {booking.invitee_phone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Location / Meeting Link */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              {getLocationIcon(booking.event_type?.location_type)}
              <span className="text-blue-600">Location</span>
            </h2>

            <div className="space-y-3">
              {booking.meeting_link ? (
                <a
                  href={booking.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Join Meeting
                </a>
              ) : booking.location ? (
                <p className="text-gray-900 dark:text-white">{booking.location}</p>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">
                  {booking.event_type?.location_type?.replace("_", " ") || "Not specified"}
                </p>
              )}
            </div>
          </div>

          {/* Custom Answers */}
          {booking.answers && Object.keys(booking.answers).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Additional Information
              </h2>

              <div className="space-y-4">
                {Object.entries(booking.answers).map(([question, answer]) => (
                  <div key={question}>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{question}</p>
                    <p className="text-gray-900 dark:text-white">{String(answer)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancellation Info */}
          {booking.status === "cancelled" && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-6">
              <h2 className="text-lg font-semibold text-red-800 dark:text-red-400 mb-2 flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Cancelled
              </h2>
              {booking.cancellation_reason && (
                <p className="text-red-700 dark:text-red-300">
                  Reason: {booking.cancellation_reason}
                </p>
              )}
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                Cancelled by: {booking.cancelled_by || "Unknown"} on{" "}
                {booking.cancelled_at
                  ? format(parseISO(booking.cancelled_at), "MMM d, yyyy 'at' h:mm a")
                  : "Unknown"}
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Actions
            </h2>

            <div className="space-y-3">
              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" />
                  Cancel Booking
                </button>
              )}

              {canMarkNoShow && (
                <button
                  onClick={handleNoShow}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  <UserX className="h-4 w-4" />
                  Mark as No-Show
                </button>
              )}

              {booking.invitee_email && (
                <a
                  href={`mailto:${booking.invitee_email}`}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30"
                >
                  <Mail className="h-4 w-4" />
                  Email Invitee
                </a>
              )}
            </div>
          </div>

          {/* Host Info */}
          {booking.host && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Host
              </h2>

              <div className="flex items-center gap-3">
                {booking.host.avatar_url ? (
                  <img
                    src={booking.host.avatar_url}
                    alt={booking.host.name || "Host"}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {booking.host.name || "Unknown"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {booking.host.email}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Event Type */}
          {booking.event_type && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Event Type
              </h2>

              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-10 rounded-full"
                  style={{ backgroundColor: booking.event_type.color }}
                />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {booking.event_type.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {booking.event_type.duration_minutes} min •{" "}
                    {booking.event_type.location_type?.replace("_", " ")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Details
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Created</span>
                <span className="text-gray-900 dark:text-white">
                  {format(parseISO(booking.created_at), "MMM d, yyyy")}
                </span>
              </div>

              {booking.reminder_sent && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Reminder</span>
                  <span className="text-green-600 dark:text-green-400">Sent</span>
                </div>
              )}

              {booking.payment_status !== "none" && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Payment</span>
                  <span className="text-gray-900 dark:text-white capitalize">
                    {booking.payment_status}
                    {booking.payment_amount && booking.payment_currency && (
                      <span className="ml-1">
                        ({(booking.payment_amount / 100).toFixed(2)} {booking.payment_currency.toUpperCase()})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
