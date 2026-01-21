"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { publicBookingApi } from "@/lib/booking-api";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  Clock,
  AlertTriangle,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface BookingDetails {
  id: string;
  event_type: {
    name: string;
    duration_minutes: number;
    color: string;
  };
  host: {
    name: string;
  };
  invitee_name: string;
  invitee_email: string;
  start_time: string;
  end_time: string;
  timezone: string;
  status: string;
}

export default function CancelBookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (params.bookingId) {
      loadBooking();
    }
  }, [params.bookingId]);

  const loadBooking = async () => {
    try {
      const data = await publicBookingApi.getBooking(params.bookingId as string);
      setBooking(data);
      if (data.status === "cancelled") {
        setCancelled(true);
      }
    } catch (error: any) {
      console.error("Failed to load booking:", error);
      setError(error.response?.data?.detail || "Booking not found");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!token) {
      setError("Invalid cancellation link");
      return;
    }

    setCancelling(true);

    try {
      await publicBookingApi.cancelBooking(params.bookingId as string, token, reason);
      setCancelled(true);
    } catch (error: any) {
      console.error("Failed to cancel booking:", error);
      setError(error.response?.data?.detail || "Failed to cancel booking");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Error
          </h1>
          <p className="text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-gray-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Booking Cancelled
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            This booking has been cancelled. Both you and the host have been notified.
          </p>
          {booking && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-left mb-6">
              <div className="font-medium text-gray-900 dark:text-white">
                {booking.event_type.name}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                with {booking.host.name}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {format(parseISO(booking.start_time), "EEEE, MMMM d, yyyy")} at{" "}
                {format(parseISO(booking.start_time), "h:mm a")}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const startDate = parseISO(booking.start_time);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Cancel Booking?
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Are you sure you want to cancel this booking?
          </p>
        </div>

        {/* Booking Details */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
          <div
            className="h-2"
            style={{ backgroundColor: booking.event_type.color }}
          />
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {booking.event_type.name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              with {booking.host.name}
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Calendar className="h-5 w-5 text-gray-400" />
                <span>{format(startDate, "EEEE, MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Clock className="h-5 w-5 text-gray-400" />
                <span>
                  {format(startDate, "h:mm a")} ({booking.timezone})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Cancellation Reason */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Reason for cancellation (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
            placeholder="Let the host know why you're cancelling..."
          />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            href={`/book/confirmation/${booking.id}`}
            className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Link>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex-1 px-4 py-3 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
            {cancelling ? "Cancelling..." : "Cancel Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
