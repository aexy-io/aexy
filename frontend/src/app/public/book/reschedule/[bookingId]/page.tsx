"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { publicBookingApi, TimeSlot } from "@/lib/booking-api";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  isBefore,
  startOfDay,
} from "date-fns";
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface BookingDetails {
  id: string;
  event_type: {
    id: string;
    name: string;
    duration_minutes: number;
    color: string;
    max_future_days: number;
  };
  host: {
    name: string;
  };
  workspace_slug: string;
  invitee_name: string;
  invitee_email: string;
  start_time: string;
  end_time: string;
  timezone: string;
  status: string;
}

export default function RescheduleBookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Reschedule state
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  useEffect(() => {
    if (params.bookingId) {
      loadBooking();
    }
  }, [params.bookingId]);

  useEffect(() => {
    if (selectedDate && booking) {
      loadSlots();
    }
  }, [selectedDate, booking]);

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

  const loadSlots = async () => {
    if (!selectedDate || !booking) return;

    setLoadingSlots(true);
    setAvailableSlots([]);
    setSelectedSlot(null);

    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const slots = await publicBookingApi.getSlots(
        booking.workspace_slug,
        booking.event_type.id,
        dateStr,
        timezone
      );
      setAvailableSlots(slots);
    } catch (error) {
      console.error("Failed to load slots:", error);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedSlot || !token || !booking) return;

    setRescheduling(true);
    setError(null);

    try {
      await publicBookingApi.rescheduleBooking(
        params.bookingId as string,
        token,
        selectedSlot.start_time,
        timezone
      );
      setRescheduled(true);
    } catch (error: any) {
      console.error("Failed to reschedule:", error);
      setError(error.response?.data?.detail || "Failed to reschedule booking");
    } finally {
      setRescheduling(false);
    }
  };

  // Calendar helpers
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const firstDayOfMonth = startOfMonth(currentMonth).getDay();
  const maxDate = booking
    ? addMonths(new Date(), Math.ceil(booking.event_type.max_future_days / 30))
    : addMonths(new Date(), 2);

  const isDateDisabled = (date: Date) => {
    if (isBefore(date, startOfDay(new Date()))) return true;
    if (isBefore(maxDate, date)) return true;
    return false;
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

  if (rescheduled) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Booking Rescheduled!
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Your booking has been rescheduled. Both you and the host have been notified.
          </p>
          {selectedSlot && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-left mb-6">
              <div className="font-medium text-gray-900 dark:text-white">
                New time
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {format(parseISO(selectedSlot.start_time), "EEEE, MMMM d, yyyy")} at{" "}
                {format(parseISO(selectedSlot.start_time), "h:mm a")} ({timezone})
              </div>
            </div>
          )}
          <Link
            href={`/book/confirmation/${booking?.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            View Booking Details
          </Link>
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const originalDate = parseISO(booking.start_time);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/book/confirmation/${booking.id}`}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to booking
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Reschedule Booking
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Select a new date and time for your meeting
          </p>
        </div>

        {/* Current Booking */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-8">
          <div className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-1">
            Current booking
          </div>
          <div className="text-yellow-700 dark:text-yellow-400">
            {booking.event_type.name} with {booking.host.name}
          </div>
          <div className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
            {format(originalDate, "EEEE, MMMM d, yyyy")} at{" "}
            {format(originalDate, "h:mm a")} ({booking.timezone})
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Calendar */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                disabled={isSameMonth(currentMonth, new Date())}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {format(currentMonth, "MMMM yyyy")}
              </h2>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                disabled={isSameMonth(currentMonth, maxDate)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOfMonth }).map((_, index) => (
                <div key={`empty-${index}`} />
              ))}
              {days.map((day) => {
                const disabled = isDateDisabled(day);
                const selected = selectedDate && isSameDay(day, selectedDate);
                const today = isToday(day);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => !disabled && setSelectedDate(day)}
                    disabled={disabled}
                    className={`
                      aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-colors
                      ${disabled ? "text-gray-300 dark:text-gray-600 cursor-not-allowed" : "hover:bg-gray-100 dark:hover:bg-gray-700"}
                      ${selected ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
                      ${today && !selected ? "bg-gray-100 dark:bg-gray-700" : ""}
                      ${!disabled && !selected ? "text-gray-900 dark:text-white" : ""}
                    `}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>

            {/* Timezone */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
              >
                <option value="America/New_York">Eastern Time (US)</option>
                <option value="America/Chicago">Central Time (US)</option>
                <option value="America/Denver">Mountain Time (US)</option>
                <option value="America/Los_Angeles">Pacific Time (US)</option>
                <option value="Europe/London">London (UK)</option>
                <option value="Europe/Paris">Paris (France)</option>
                <option value="Asia/Tokyo">Tokyo (Japan)</option>
                <option value="Asia/Shanghai">Shanghai (China)</option>
                <option value="Asia/Kolkata">India (IST)</option>
                <option value="Australia/Sydney">Sydney (Australia)</option>
              </select>
            </div>
          </div>

          {/* Time Slots */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            {!selectedDate ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  Select a date to see available times
                </p>
              </div>
            ) : loadingSlots ? (
              <div className="flex items-center justify-center h-full py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <Clock className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  No available times on this date
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Please select another date
                </p>
              </div>
            ) : (
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-4">
                  {format(selectedDate, "EEEE, MMMM d")}
                </h3>
                <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.start_time}
                      onClick={() => setSelectedSlot(slot)}
                      className={`px-4 py-3 text-sm font-medium rounded-lg border transition-colors ${
                        selectedSlot?.start_time === slot.start_time
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                          : "border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700"
                      }`}
                    >
                      {format(parseISO(slot.start_time), "h:mm a")}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        {selectedSlot && (
          <div className="mt-8 flex justify-end gap-3">
            <button
              onClick={() => setSelectedSlot(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleReschedule}
              disabled={rescheduling}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {rescheduling && <Loader2 className="h-4 w-4 animate-spin" />}
              {rescheduling ? "Rescheduling..." : "Confirm New Time"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
