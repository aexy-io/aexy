"use client";

import { useState, useMemo } from "react";
import { format, addDays, startOfWeek, parseISO, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import {
  TeamAvailability,
  TeamMemberAvailability,
  TeamBookingBrief,
  OverlappingSlot,
} from "@/lib/booking-api";

interface TeamCalendarViewProps {
  availability: TeamAvailability;
  onSlotClick?: (date: string, time: string) => void;
  onBookingClick?: (booking: TeamBookingBrief) => void;
  startDate?: Date;
  onDateChange?: (date: Date) => void;
}

// Color palette for team members
const MEMBER_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-300 dark:border-blue-600", text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-green-100 dark:bg-green-900/40", border: "border-green-300 dark:border-green-600", text: "text-green-700 dark:text-green-300" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", border: "border-purple-300 dark:border-purple-600", text: "text-purple-700 dark:text-purple-300" },
  { bg: "bg-orange-100 dark:bg-orange-900/40", border: "border-orange-300 dark:border-orange-600", text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-pink-100 dark:bg-pink-900/40", border: "border-pink-300 dark:border-pink-600", text: "text-pink-700 dark:text-pink-300" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", border: "border-cyan-300 dark:border-cyan-600", text: "text-cyan-700 dark:text-cyan-300" },
  { bg: "bg-yellow-100 dark:bg-yellow-900/40", border: "border-yellow-300 dark:border-yellow-600", text: "text-yellow-700 dark:text-yellow-300" },
  { bg: "bg-red-100 dark:bg-red-900/40", border: "border-red-300 dark:border-red-600", text: "text-red-700 dark:text-red-300" },
];

// Hours to display (6am to 10pm)
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

export function TeamCalendarView({
  availability,
  onSlotClick,
  onBookingClick,
  startDate: initialStartDate,
  onDateChange,
}: TeamCalendarViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    if (initialStartDate) {
      return startOfWeek(initialStartDate, { weekStartsOn: 1 }); // Monday start
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });

  // Generate week days
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  // Member color mapping
  const memberColors = useMemo(() => {
    const colorMap: Record<string, (typeof MEMBER_COLORS)[0]> = {};
    availability.members.forEach((member, index) => {
      colorMap[member.user_id] = MEMBER_COLORS[index % MEMBER_COLORS.length];
    });
    return colorMap;
  }, [availability.members]);

  // Navigate weeks
  const goToPreviousWeek = () => {
    const newDate = addDays(currentWeekStart, -7);
    setCurrentWeekStart(newDate);
    onDateChange?.(newDate);
  };

  const goToNextWeek = () => {
    const newDate = addDays(currentWeekStart, 7);
    setCurrentWeekStart(newDate);
    onDateChange?.(newDate);
  };

  const goToToday = () => {
    const newDate = startOfWeek(new Date(), { weekStartsOn: 1 });
    setCurrentWeekStart(newDate);
    onDateChange?.(newDate);
  };

  // Get availability for a specific day and member
  const getMemberDayAvailability = (member: TeamMemberAvailability, day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return member.availability.find((a) => a.date === dateStr);
  };

  // Get overlapping slots for a day
  const getOverlappingForDay = (day: Date): OverlappingSlot | undefined => {
    const dateStr = format(day, "yyyy-MM-dd");
    return availability.overlapping_slots.find((s) => s.date === dateStr);
  };

  // Get bookings for a day
  const getBookingsForDay = (day: Date): TeamBookingBrief[] => {
    return availability.bookings.filter((b) => {
      const bookingDate = parseISO(b.start_time);
      return isSameDay(bookingDate, day);
    });
  };

  // Check if a time slot is within availability windows
  const isTimeInWindows = (
    hour: number,
    minute: number,
    windows: { start: string; end: string }[]
  ): boolean => {
    const timeMinutes = hour * 60 + minute;
    return windows.some((w) => {
      const [startH, startM] = w.start.split(":").map(Number);
      const [endH, endM] = w.end.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return timeMinutes >= startMinutes && timeMinutes < endMinutes;
    });
  };

  // Check if a time slot is within any busy time
  const isTimeInBusyTimes = (
    day: Date,
    hour: number,
    minute: number,
    busyTimes: { start: string; end: string }[]
  ): boolean => {
    const slotStart = new Date(day);
    slotStart.setHours(hour, minute, 0, 0);

    return busyTimes.some((bt) => {
      const busyStart = parseISO(bt.start);
      const busyEnd = parseISO(bt.end);
      return slotStart >= busyStart && slotStart < busyEnd;
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header with navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Team Calendar
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Today
          </button>
          <button
            onClick={goToPreviousWeek}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[180px] text-center">
            {format(currentWeekStart, "MMM d")} -{" "}
            {format(addDays(currentWeekStart, 6), "MMM d, yyyy")}
          </span>
          <button
            onClick={goToNextWeek}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Team member legend */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3">
        {availability.members.map((member) => {
          const color = memberColors[member.user_id];
          return (
            <div key={member.user_id} className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${color.bg} ${color.border} border`}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {member.user.name || member.user.email || "Unknown"}
              </span>
            </div>
          );
        })}
        <div className="flex items-center gap-2 ml-4">
          <div className="w-3 h-3 rounded-full bg-green-200 dark:bg-green-800 border border-green-400 dark:border-green-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            All available
          </span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-200 dark:border-gray-700">
            <div className="p-2" /> {/* Time column header */}
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className="p-2 text-center border-l border-gray-200 dark:border-gray-700"
              >
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                  {format(day, "EEE")}
                </div>
                <div
                  className={`text-lg font-semibold ${
                    isSameDay(day, new Date())
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-900 dark:text-white"
                  }`}
                >
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>

          {/* Time slots grid */}
          <div className="relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-100 dark:border-gray-700"
              >
                {/* Time label */}
                <div className="p-1 text-xs text-gray-500 dark:text-gray-400 text-right pr-2">
                  {format(new Date().setHours(hour, 0), "h a")}
                </div>

                {/* Day cells */}
                {weekDays.map((day) => {
                  const overlapping = getOverlappingForDay(day);
                  const isOverlappingSlot =
                    overlapping &&
                    isTimeInWindows(hour, 0, overlapping.windows);
                  const dayBookings = getBookingsForDay(day);

                  return (
                    <div
                      key={day.toISOString()}
                      className={`h-12 border-l border-gray-200 dark:border-gray-700 relative ${
                        isOverlappingSlot ? "bg-green-50 dark:bg-green-900/20" : ""
                      }`}
                      onClick={() =>
                        onSlotClick?.(
                          format(day, "yyyy-MM-dd"),
                          `${hour.toString().padStart(2, "0")}:00`
                        )
                      }
                    >
                      {/* Member availability bars */}
                      <div className="absolute inset-0 flex flex-col justify-center px-1 gap-0.5">
                        {availability.members.map((member) => {
                          const dayAvail = getMemberDayAvailability(member, day);
                          if (!dayAvail) return null;

                          const isAvailable = isTimeInWindows(
                            hour,
                            0,
                            dayAvail.windows
                          );
                          const isBusy = isTimeInBusyTimes(
                            day,
                            hour,
                            0,
                            dayAvail.busy_times
                          );
                          const color = memberColors[member.user_id];

                          if (!isAvailable) return null;

                          return (
                            <div
                              key={member.user_id}
                              className={`h-1.5 rounded-full ${
                                isBusy
                                  ? "bg-gray-300 dark:bg-gray-600"
                                  : color.bg
                              }`}
                              title={`${member.user.name || "Unknown"}: ${
                                isBusy ? "Busy" : "Available"
                              }`}
                            />
                          );
                        })}
                      </div>

                      {/* Bookings */}
                      {dayBookings.map((booking) => {
                        const bookingStart = parseISO(booking.start_time);
                        const bookingHour = bookingStart.getHours();
                        if (bookingHour !== hour) return null;

                        return (
                          <div
                            key={booking.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onBookingClick?.(booking);
                            }}
                            className="absolute left-1 right-1 top-1 bottom-1 bg-blue-500 dark:bg-blue-600 text-white text-xs rounded px-1 py-0.5 overflow-hidden cursor-pointer hover:bg-blue-600 dark:hover:bg-blue-500 z-10"
                          >
                            <div className="font-medium truncate">
                              {booking.event_name || "Meeting"}
                            </div>
                            <div className="truncate opacity-80">
                              {booking.invitee_name}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
