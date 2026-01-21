"use client";

import { format, parseISO } from "date-fns";
import { Clock, Loader2 } from "lucide-react";
import { TimeSlot } from "@/lib/booking-api";

interface TimeSlotPickerProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  onSelectSlot: (slot: TimeSlot) => void;
  loading?: boolean;
  selectedDate?: Date | null;
  className?: string;
}

export function TimeSlotPicker({
  slots,
  selectedSlot,
  onSelectSlot,
  loading = false,
  selectedDate,
  className = "",
}: TimeSlotPickerProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!selectedDate) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
        <Clock className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">
          Select a date to see available times
        </p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
        <Clock className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">
          No available times on this date
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Please select another date
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {selectedDate && (
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">
          {format(selectedDate, "EEEE, MMMM d")}
        </h3>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
        {slots.map((slot) => {
          const isSelected = selectedSlot?.start_time === slot.start_time;
          const isDisabled = !slot.available;

          return (
            <button
              key={slot.start_time}
              onClick={() => !isDisabled && onSelectSlot(slot)}
              disabled={isDisabled}
              className={`
                px-4 py-3 text-sm font-medium rounded-lg border transition-all
                ${isDisabled
                  ? "border-gray-100 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed bg-gray-50 dark:bg-gray-800"
                  : isSelected
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                    : "border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700 text-gray-900 dark:text-white"
                }
              `}
            >
              {format(parseISO(slot.start_time), "h:mm a")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
