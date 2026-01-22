"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { bookingApi, AvailabilitySchedule, AvailabilityOverride } from "@/lib/booking-api";
import { toast } from "sonner";
import { format, parseISO, addDays } from "date-fns";
import {
  ArrowLeft,
  Clock,
  Plus,
  Trash2,
  Calendar,
  Save,
} from "lucide-react";
import Link from "next/link";

const DAYS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  const time = `${hour.toString().padStart(2, "0")}:${minute}`;
  const label = format(new Date(`2000-01-01T${time}`), "h:mm a");
  return { value: time, label };
});

const TIMEZONE_OPTIONS = [
  // UTC
  { value: "UTC", label: "UTC (Coordinated Universal Time)", group: "UTC" },

  // Americas
  { value: "America/New_York", label: "Eastern Time (ET) - New York", group: "Americas" },
  { value: "America/Chicago", label: "Central Time (CT) - Chicago", group: "Americas" },
  { value: "America/Denver", label: "Mountain Time (MT) - Denver", group: "Americas" },
  { value: "America/Phoenix", label: "Arizona Time - Phoenix (No DST)", group: "Americas" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT) - Los Angeles", group: "Americas" },
  { value: "America/Anchorage", label: "Alaska Time - Anchorage", group: "Americas" },
  { value: "Pacific/Honolulu", label: "Hawaii Time - Honolulu (No DST)", group: "Americas" },
  { value: "America/Toronto", label: "Eastern Time - Toronto", group: "Americas" },
  { value: "America/Vancouver", label: "Pacific Time - Vancouver", group: "Americas" },
  { value: "America/Mexico_City", label: "Central Time - Mexico City", group: "Americas" },
  { value: "America/Sao_Paulo", label: "Brasília Time - São Paulo", group: "Americas" },
  { value: "America/Buenos_Aires", label: "Argentina Time - Buenos Aires", group: "Americas" },
  { value: "America/Santiago", label: "Chile Time - Santiago", group: "Americas" },
  { value: "America/Bogota", label: "Colombia Time - Bogotá", group: "Americas" },
  { value: "America/Lima", label: "Peru Time - Lima", group: "Americas" },

  // Europe
  { value: "Europe/London", label: "GMT/BST - London", group: "Europe" },
  { value: "Europe/Dublin", label: "GMT/IST - Dublin", group: "Europe" },
  { value: "Europe/Paris", label: "CET/CEST - Paris", group: "Europe" },
  { value: "Europe/Berlin", label: "CET/CEST - Berlin", group: "Europe" },
  { value: "Europe/Amsterdam", label: "CET/CEST - Amsterdam", group: "Europe" },
  { value: "Europe/Brussels", label: "CET/CEST - Brussels", group: "Europe" },
  { value: "Europe/Madrid", label: "CET/CEST - Madrid", group: "Europe" },
  { value: "Europe/Rome", label: "CET/CEST - Rome", group: "Europe" },
  { value: "Europe/Zurich", label: "CET/CEST - Zurich", group: "Europe" },
  { value: "Europe/Vienna", label: "CET/CEST - Vienna", group: "Europe" },
  { value: "Europe/Stockholm", label: "CET/CEST - Stockholm", group: "Europe" },
  { value: "Europe/Oslo", label: "CET/CEST - Oslo", group: "Europe" },
  { value: "Europe/Copenhagen", label: "CET/CEST - Copenhagen", group: "Europe" },
  { value: "Europe/Helsinki", label: "EET/EEST - Helsinki", group: "Europe" },
  { value: "Europe/Athens", label: "EET/EEST - Athens", group: "Europe" },
  { value: "Europe/Warsaw", label: "CET/CEST - Warsaw", group: "Europe" },
  { value: "Europe/Prague", label: "CET/CEST - Prague", group: "Europe" },
  { value: "Europe/Lisbon", label: "WET/WEST - Lisbon", group: "Europe" },
  { value: "Europe/Moscow", label: "Moscow Time - Moscow", group: "Europe" },
  { value: "Europe/Istanbul", label: "Turkey Time - Istanbul", group: "Europe" },

  // Asia
  { value: "Asia/Dubai", label: "Gulf Time - Dubai", group: "Asia" },
  { value: "Asia/Kolkata", label: "India Time (IST) - Mumbai/Delhi", group: "Asia" },
  { value: "Asia/Dhaka", label: "Bangladesh Time - Dhaka", group: "Asia" },
  { value: "Asia/Bangkok", label: "Indochina Time - Bangkok", group: "Asia" },
  { value: "Asia/Ho_Chi_Minh", label: "Indochina Time - Ho Chi Minh", group: "Asia" },
  { value: "Asia/Jakarta", label: "Western Indonesia Time - Jakarta", group: "Asia" },
  { value: "Asia/Singapore", label: "Singapore Time - Singapore", group: "Asia" },
  { value: "Asia/Kuala_Lumpur", label: "Malaysia Time - Kuala Lumpur", group: "Asia" },
  { value: "Asia/Manila", label: "Philippine Time - Manila", group: "Asia" },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time - Hong Kong", group: "Asia" },
  { value: "Asia/Shanghai", label: "China Time (CST) - Shanghai/Beijing", group: "Asia" },
  { value: "Asia/Taipei", label: "Taiwan Time - Taipei", group: "Asia" },
  { value: "Asia/Seoul", label: "Korea Time (KST) - Seoul", group: "Asia" },
  { value: "Asia/Tokyo", label: "Japan Time (JST) - Tokyo", group: "Asia" },
  { value: "Asia/Riyadh", label: "Arabia Time - Riyadh", group: "Asia" },
  { value: "Asia/Jerusalem", label: "Israel Time - Jerusalem", group: "Asia" },
  { value: "Asia/Karachi", label: "Pakistan Time - Karachi", group: "Asia" },

  // Australia & Pacific
  { value: "Australia/Perth", label: "Western Australia - Perth", group: "Australia & Pacific" },
  { value: "Australia/Adelaide", label: "Central Australia - Adelaide", group: "Australia & Pacific" },
  { value: "Australia/Sydney", label: "Eastern Australia - Sydney", group: "Australia & Pacific" },
  { value: "Australia/Melbourne", label: "Eastern Australia - Melbourne", group: "Australia & Pacific" },
  { value: "Australia/Brisbane", label: "Queensland - Brisbane (No DST)", group: "Australia & Pacific" },
  { value: "Pacific/Auckland", label: "New Zealand Time - Auckland", group: "Australia & Pacific" },
  { value: "Pacific/Fiji", label: "Fiji Time - Suva", group: "Australia & Pacific" },

  // Africa
  { value: "Africa/Cairo", label: "Eastern European Time - Cairo", group: "Africa" },
  { value: "Africa/Johannesburg", label: "South Africa Time - Johannesburg", group: "Africa" },
  { value: "Africa/Lagos", label: "West Africa Time - Lagos", group: "Africa" },
  { value: "Africa/Nairobi", label: "East Africa Time - Nairobi", group: "Africa" },
  { value: "Africa/Casablanca", label: "Western European Time - Casablanca", group: "Africa" },
];

interface ScheduleSlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export default function AvailabilityPage() {
  const { currentWorkspace } = useWorkspace();
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [newOverride, setNewOverride] = useState({
    date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
    is_available: false,
    start_time: "09:00",
    end_time: "17:00",
    reason: "",
  });

  useEffect(() => {
    if (currentWorkspace?.id) {
      loadAvailability();
    }
  }, [currentWorkspace?.id]);

  const loadAvailability = async () => {
    if (!currentWorkspace?.id) return;

    try {
      const [availabilityData, overridesData] = await Promise.all([
        bookingApi.availability.get(currentWorkspace.id),
        bookingApi.availability.listOverrides(currentWorkspace.id),
      ]);

      // Convert to schedule slots
      const slots: ScheduleSlot[] = [];
      availabilityData.schedule.forEach((day) => {
        day.slots.forEach((slot) => {
          slots.push({
            day_of_week: day.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
          });
        });
      });

      setSchedule(slots);
      setTimezone(availabilityData.timezone);
      setOverrides(overridesData);
    } catch (error) {
      console.error("Failed to load availability:", error);
    } finally {
      setLoading(false);
    }
  };

  const addSlot = (dayOfWeek: number) => {
    setSchedule([
      ...schedule,
      { day_of_week: dayOfWeek, start_time: "09:00", end_time: "17:00" },
    ]);
  };

  const updateSlot = (index: number, field: "start_time" | "end_time", value: string) => {
    const newSchedule = [...schedule];
    newSchedule[index][field] = value;
    setSchedule(newSchedule);
  };

  const removeSlot = (index: number) => {
    const newSchedule = [...schedule];
    newSchedule.splice(index, 1);
    setSchedule(newSchedule);
  };

  const saveSchedule = async () => {
    if (!currentWorkspace?.id) return;

    setSaving(true);
    try {
      await bookingApi.availability.update(currentWorkspace.id, {
        timezone,
        slots: schedule,
      });
      toast.success("Availability saved!");
    } catch (error) {
      toast.error("Failed to save availability");
    } finally {
      setSaving(false);
    }
  };

  const createOverride = async () => {
    if (!currentWorkspace?.id) return;

    try {
      await bookingApi.availability.createOverride(currentWorkspace.id, {
        date: newOverride.date,
        is_available: newOverride.is_available,
        start_time: newOverride.is_available ? newOverride.start_time : undefined,
        end_time: newOverride.is_available ? newOverride.end_time : undefined,
        reason: newOverride.reason || undefined,
      });
      await loadAvailability();
      setShowOverrideModal(false);
      toast.success("Override created!");
    } catch (error) {
      toast.error("Failed to create override");
    }
  };

  const deleteOverride = async (overrideId: string) => {
    if (!currentWorkspace?.id) return;

    try {
      await bookingApi.availability.deleteOverride(currentWorkspace.id, overrideId);
      await loadAvailability();
      toast.success("Override deleted");
    } catch (error) {
      toast.error("Failed to delete override");
    }
  };

  const getSlotsByDay = (dayOfWeek: number) => {
    return schedule
      .map((slot, index) => ({ ...slot, index }))
      .filter((slot) => slot.day_of_week === dayOfWeek);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/booking"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Booking
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Availability
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Set your weekly hours and date-specific overrides
            </p>
          </div>
          <button
            onClick={saveSchedule}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Timezone */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Timezone
        </label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
        >
          {["UTC", "Americas", "Europe", "Asia", "Australia & Pacific", "Africa"].map((group) => (
            <optgroup key={group} label={group}>
              {TIMEZONE_OPTIONS.filter((tz) => tz.group === group).map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Times shown to invitees will be converted to their local timezone
        </p>
      </div>

      {/* Weekly Schedule */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Weekly Hours
          </h2>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {DAYS.map((day) => {
            const daySlots = getSlotsByDay(day.value);

            return (
              <div key={day.value} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="font-medium text-gray-900 dark:text-white w-28">
                    {day.label}
                  </div>

                  <div className="flex-1">
                    {daySlots.length === 0 ? (
                      <span className="text-gray-500 dark:text-gray-400 text-sm">
                        Unavailable
                      </span>
                    ) : (
                      <div className="space-y-2">
                        {daySlots.map((slot) => (
                          <div key={slot.index} className="flex items-center gap-2">
                            <select
                              value={slot.start_time}
                              onChange={(e) => updateSlot(slot.index, "start_time", e.target.value)}
                              className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                            >
                              {TIME_OPTIONS.map((time) => (
                                <option key={time.value} value={time.value}>
                                  {time.label}
                                </option>
                              ))}
                            </select>
                            <span className="text-gray-500">-</span>
                            <select
                              value={slot.end_time}
                              onChange={(e) => updateSlot(slot.index, "end_time", e.target.value)}
                              className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                            >
                              {TIME_OPTIONS.map((time) => (
                                <option key={time.value} value={time.value}>
                                  {time.label}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => removeSlot(slot.index)}
                              className="p-1 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => addSlot(day.value)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Date Overrides */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Date Overrides
          </h2>
          <button
            onClick={() => setShowOverrideModal(true)}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            Add Override
          </button>
        </div>

        {overrides.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No date overrides. Add one for vacations or special hours.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {overrides.map((override) => (
              <div key={override.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {format(parseISO(override.date), "EEEE, MMMM d, yyyy")}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {override.is_available ? (
                      <>Available: {override.start_time} - {override.end_time}</>
                    ) : (
                      <>Unavailable{override.reason && ` - ${override.reason}`}</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteOverride(override.id)}
                  className="p-2 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Add Date Override
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={newOverride.date}
                  onChange={(e) => setNewOverride({ ...newOverride, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={newOverride.is_available}
                    onChange={(e) => setNewOverride({ ...newOverride, is_available: e.target.checked })}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  Available (custom hours)
                </label>
              </div>

              {newOverride.is_available && (
                <div className="flex items-center gap-2">
                  <select
                    value={newOverride.start_time}
                    onChange={(e) => setNewOverride({ ...newOverride, start_time: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time.value} value={time.value}>
                        {time.label}
                      </option>
                    ))}
                  </select>
                  <span>-</span>
                  <select
                    value={newOverride.end_time}
                    onChange={(e) => setNewOverride({ ...newOverride, end_time: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time.value} value={time.value}>
                        {time.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={newOverride.reason}
                  onChange={(e) => setNewOverride({ ...newOverride, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="e.g., Vacation"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={createOverride}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Add Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
