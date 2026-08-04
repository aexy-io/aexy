"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { reportsApi, CustomReport, ScheduledReport } from "@/lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  report: CustomReport;
  onClose: () => void;
  onCreated: (schedule: ScheduledReport) => void;
}

export function ScheduleReportModal({ report, onClose, onCreated }: Props) {
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [timeUtc, setTimeUtc] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "slack" | "both">("email");
  const [format, setFormat] = useState<"pdf" | "csv" | "json" | "xlsx">("pdf");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const recipients = recipientsRaw
      .split(/[,\n]/)
      .map((r) => r.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      toast.error("Add at least one recipient email.");
      return;
    }

    setSubmitting(true);
    try {
      const schedule = await reportsApi.createSchedule(report.id, {
        schedule: frequency,
        time_utc: timeUtc,
        recipients,
        delivery_method: deliveryMethod,
        export_format: format,
        ...(frequency === "weekly" ? { day_of_week: dayOfWeek } : {}),
        ...(frequency === "monthly" ? { day_of_month: dayOfMonth } : {}),
      });
      onCreated(schedule);
    } catch (error) {
      console.error("Failed to create schedule:", error);
      toast.error("Failed to schedule report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl max-w-lg w-full border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Schedule &quot;{report.name}&quot;</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Frequency */}
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Frequency</label>
            <div className="flex gap-2">
              {(["daily", "weekly", "monthly"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm capitalize transition ${
                    frequency === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent hover:bg-muted text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Day selector */}
          {frequency === "weekly" && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Day of week</label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
          {frequency === "monthly" && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Day of month</label>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
          )}

          {/* Time */}
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Time (UTC)</label>
            <input
              type="time"
              value={timeUtc}
              onChange={(e) => setTimeUtc(e.target.value)}
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
            />
          </div>

          {/* Delivery method */}
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Delivery</label>
            <div className="flex gap-2">
              {(["email", "slack", "both"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setDeliveryMethod(m)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm capitalize transition ${
                    deliveryMethod === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent hover:bg-muted text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              Recipients (comma or newline separated)
            </label>
            <textarea
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              rows={2}
              placeholder="alice@company.com, bob@company.com"
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
            />
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm uppercase"
            >
              <option value="pdf">PDF</option>
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
