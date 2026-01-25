"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export interface TimeRange {
  start_time: string;
  end_time: string;
}

export interface DaySchedule {
  day_of_week: number;
  day_name: string;
  is_enabled: boolean;
  slots: TimeRange[];
}

interface AvailabilityEditorProps {
  schedule: DaySchedule[];
  onChange: (schedule: DaySchedule[]) => void;
  className?: string;
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  const hourStr = hour.toString().padStart(2, "0");
  return `${hourStr}:${minute}`;
});

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${ampm}`;
};

export function AvailabilityEditor({
  schedule,
  onChange,
  className = "",
}: AvailabilityEditorProps) {
  const toggleDay = (dayIndex: number) => {
    const newSchedule = schedule.map((day, index) => {
      if (index === dayIndex) {
        return {
          ...day,
          is_enabled: !day.is_enabled,
          slots: day.is_enabled ? [] : [{ start_time: "09:00", end_time: "17:00" }],
        };
      }
      return day;
    });
    onChange(newSchedule);
  };

  const addSlot = (dayIndex: number) => {
    const newSchedule = schedule.map((day, index) => {
      if (index === dayIndex) {
        const lastSlot = day.slots[day.slots.length - 1];
        const newStart = lastSlot ? lastSlot.end_time : "09:00";
        const startIndex = TIME_OPTIONS.indexOf(newStart);
        const newEnd = TIME_OPTIONS[Math.min(startIndex + 16, TIME_OPTIONS.length - 1)] || "17:00";
        return {
          ...day,
          slots: [...day.slots, { start_time: newStart, end_time: newEnd }],
        };
      }
      return day;
    });
    onChange(newSchedule);
  };

  const removeSlot = (dayIndex: number, slotIndex: number) => {
    const newSchedule = schedule.map((day, index) => {
      if (index === dayIndex) {
        const newSlots = day.slots.filter((_, i) => i !== slotIndex);
        return {
          ...day,
          slots: newSlots,
          is_enabled: newSlots.length > 0,
        };
      }
      return day;
    });
    onChange(newSchedule);
  };

  const updateSlot = (dayIndex: number, slotIndex: number, field: "start_time" | "end_time", value: string) => {
    const newSchedule = schedule.map((day, index) => {
      if (index === dayIndex) {
        const newSlots = day.slots.map((slot, i) => {
          if (i === slotIndex) {
            return { ...slot, [field]: value };
          }
          return slot;
        });
        return { ...day, slots: newSlots };
      }
      return day;
    });
    onChange(newSchedule);
  };

  const copyToAll = (dayIndex: number) => {
    const sourceDay = schedule[dayIndex];
    if (!sourceDay.is_enabled || sourceDay.slots.length === 0) return;

    const newSchedule = schedule.map((day) => ({
      ...day,
      is_enabled: true,
      slots: [...sourceDay.slots],
    }));
    onChange(newSchedule);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {schedule.map((day, dayIndex) => (
        <div
          key={day.day_of_week}
          className={`p-4 rounded-lg border ${
            day.is_enabled
              ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              : "bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={day.is_enabled}
                onChange={() => toggleDay(dayIndex)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span
                className={`font-medium ${
                  day.is_enabled
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400 dark:text-gray-500"
                }`}
              >
                {day.day_name}
              </span>
            </label>
            {day.is_enabled && day.slots.length > 0 && (
              <button
                type="button"
                onClick={() => copyToAll(dayIndex)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Copy to all
              </button>
            )}
          </div>

          {day.is_enabled && (
            <div className="space-y-2 ml-8">
              {day.slots.map((slot, slotIndex) => (
                <div key={slotIndex} className="flex items-center gap-2">
                  <select
                    value={slot.start_time}
                    onChange={(e) => updateSlot(dayIndex, slotIndex, "start_time", e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>
                        {formatTime(time)}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-400">-</span>
                  <select
                    value={slot.end_time}
                    onChange={(e) => updateSlot(dayIndex, slotIndex, "end_time", e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>
                        {formatTime(time)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSlot(dayIndex, slotIndex)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addSlot(dayIndex)}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add time range
              </button>
            </div>
          )}

          {!day.is_enabled && (
            <p className="text-sm text-gray-400 dark:text-gray-500 ml-8">
              Unavailable
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
