"use client";

import { useState } from "react";
import {
  format,
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
import { ChevronLeft, ChevronRight } from "lucide-react";

interface BookingCalendarProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  maxFutureDays?: number;
  availableDates?: string[];
  className?: string;
}

export function BookingCalendar({
  selectedDate,
  onSelectDate,
  maxFutureDays = 60,
  availableDates,
  className = "",
}: BookingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const firstDayOfMonth = startOfMonth(currentMonth).getDay();
  const today = new Date();
  const maxDate = new Date(today.getTime() + maxFutureDays * 24 * 60 * 60 * 1000);

  const isDateDisabled = (date: Date) => {
    if (isBefore(date, startOfDay(today))) return true;
    if (isBefore(maxDate, date)) return true;
    if (availableDates) {
      const dateStr = format(date, "yyyy-MM-dd");
      return !availableDates.includes(dateStr);
    }
    return false;
  };

  const canGoBack = !isSameMonth(currentMonth, today);
  const canGoForward = isBefore(endOfMonth(currentMonth), maxDate);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl ${className}`}>
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          disabled={!canGoBack}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          disabled={!canGoForward}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
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
          <div key={`empty-${index}`} className="aspect-square" />
        ))}
        {days.map((day) => {
          const disabled = isDateDisabled(day);
          const selected = selectedDate && isSameDay(day, selectedDate);
          const todayDate = isToday(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => !disabled && onSelectDate(day)}
              disabled={disabled}
              className={`
                aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all
                ${disabled
                  ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                }
                ${selected
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : ""
                }
                ${todayDate && !selected
                  ? "bg-gray-100 dark:bg-gray-700 font-bold"
                  : ""
                }
                ${!disabled && !selected
                  ? "text-gray-900 dark:text-white"
                  : ""
                }
              `}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
