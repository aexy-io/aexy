"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface AvailabilityOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: OverrideFormData) => Promise<void>;
  selectedDate?: Date | null;
}

export interface OverrideFormData {
  date: string;
  is_available: boolean;
  start_time?: string;
  end_time?: string;
  reason?: string;
  notes?: string;
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  const hourStr = hour.toString().padStart(2, "0");
  return `${hourStr}:${minute}`;
});

const formatTimeDisplay = (time: string) => {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${ampm}`;
};

export function AvailabilityOverrideModal({
  isOpen,
  onClose,
  onSubmit,
  selectedDate,
}: AvailabilityOverrideModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<OverrideFormData>({
    date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
    is_available: false,
    start_time: "09:00",
    end_time: "17:00",
    reason: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle>Add Date Override</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Date
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
              className="w-full px-3 py-2 border border-border rounded-lg bg-muted text-foreground"
            />
          </div>

          {/* Availability Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Override Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!formData.is_available}
                  onChange={() => setFormData({ ...formData, is_available: false })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-foreground">
                  Mark as unavailable
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={formData.is_available}
                  onChange={() => setFormData({ ...formData, is_available: true })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-foreground">
                  Set custom hours
                </span>
              </label>
            </div>
          </div>

          {/* Custom Hours */}
          {formData.is_available && (
            <div className="flex items-center gap-2">
              <select
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="flex-1 px-3 py-2 border border-border rounded-lg bg-muted text-foreground text-sm"
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>
                    {formatTimeDisplay(time)}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">to</span>
              <select
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="flex-1 px-3 py-2 border border-border rounded-lg bg-muted text-foreground text-sm"
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>
                    {formatTimeDisplay(time)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Reason (optional)
            </label>
            <select
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-muted text-foreground"
            >
              <option value="">Select a reason</option>
              <option value="vacation">Vacation</option>
              <option value="holiday">Holiday</option>
              <option value="sick">Sick Leave</option>
              <option value="personal">Personal</option>
              <option value="meeting">All-day Meeting</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Notes (optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg bg-muted text-foreground"
              placeholder="Add any notes about this override..."
            />
          </div>

          {/* Actions */}
          <DialogFooter className="flex-row gap-3 pt-2 sm:space-x-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-foreground bg-muted border border-border rounded-lg hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.date}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Saving..." : "Save Override"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
