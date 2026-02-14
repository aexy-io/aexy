"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Calendar,
  Send,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { LeaveRequestCreate } from "@/lib/leave-api";
import {
  useLeaveTypes,
  useLeaveBalances,
  useLeaveRequestMutations,
} from "@/hooks/useLeave";

interface LeaveRequestFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LeaveRequestForm({ isOpen, onClose }: LeaveRequestFormProps) {
  const { data: leaveTypes, isLoading: typesLoading } = useLeaveTypes();
  const { data: balances } = useLeaveBalances();
  const { submit } = useLeaveRequestMutations();

  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState<"first_half" | "second_half">("first_half");
  const [reason, setReason] = useState("");

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setLeaveTypeId("");
      setStartDate("");
      setEndDate("");
      setIsHalfDay(false);
      setHalfDayPeriod("first_half");
      setReason("");
    }
  }, [isOpen]);

  // Auto-select first leave type
  useEffect(() => {
    if (leaveTypes && leaveTypes.length > 0 && !leaveTypeId) {
      setLeaveTypeId(leaveTypes[0].id);
    }
  }, [leaveTypes, leaveTypeId]);

  // Sync end date with start date for half day
  useEffect(() => {
    if (isHalfDay && startDate) {
      setEndDate(startDate);
    }
  }, [isHalfDay, startDate]);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const selectedType = leaveTypes?.find((t) => t.id === leaveTypeId);
  const selectedBalance = balances?.find((b) => b.leave_type_id === leaveTypeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveTypeId || !startDate || !endDate) return;

    const data: LeaveRequestCreate = {
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      is_half_day: isHalfDay,
      half_day_period: isHalfDay ? halfDayPeriod : null,
      reason: reason.trim() || null,
    };

    try {
      await submit.mutateAsync(data);
      onClose();
    } catch {
      // Error is handled by react-query
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-request-title"
        className="relative w-full max-w-lg mx-4 bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 id="leave-request-title" className="text-lg font-semibold text-white">Request Leave</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Submit a new leave request
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Leave Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Leave Type
            </label>
            {typesLoading ? (
              <div className="h-10 bg-slate-800 rounded-lg animate-pulse" />
            ) : (
              <select
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50 transition"
                required
              >
                <option value="" disabled>
                  Select a leave type
                </option>
                {leaveTypes?.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            )}
            {/* Balance for selected type */}
            {selectedBalance && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: selectedType?.color || "#6366f1" }}
                />
                <span className="text-slate-400">
                  <span className="font-medium text-emerald-400">
                    {selectedBalance.available}
                  </span>{" "}
                  days available out of{" "}
                  {selectedBalance.total_allocated + selectedBalance.carried_forward}
                </span>
              </div>
            )}
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50 transition [color-scheme:dark]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                disabled={isHalfDay}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50 transition disabled:opacity-50 disabled:cursor-not-allowed [color-scheme:dark]"
                required
              />
            </div>
          </div>

          {/* Half Day Toggle */}
          {selectedType?.allows_half_day !== false && (
            <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-300">Half Day</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Apply for half a day only
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsHalfDay(!isHalfDay)}
                className="text-slate-400 hover:text-white transition"
              >
                {isHalfDay ? (
                  <ToggleRight className="h-8 w-8 text-blue-400" />
                ) : (
                  <ToggleLeft className="h-8 w-8" />
                )}
              </button>
            </div>
          )}

          {/* Half Day Period */}
          {isHalfDay && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Half Day Period
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHalfDayPeriod("first_half")}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition ${
                    halfDayPeriod === "first_half"
                      ? "bg-blue-600/20 border-blue-500/30 text-blue-400"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  First Half
                </button>
                <button
                  type="button"
                  onClick={() => setHalfDayPeriod("second_half")}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition ${
                    halfDayPeriod === "second_half"
                      ? "bg-blue-600/20 border-blue-500/30 text-blue-400"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  Second Half
                </button>
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Reason <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Briefly describe your reason for leave..."
              rows={3}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 resize-none transition"
            />
          </div>

          {/* Error message */}
          {submit.isError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {(submit.error as Error)?.message || "Failed to submit leave request. Please try again."}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submit.isPending || !leaveTypeId || !startDate || !endDate}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submit.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submit.isPending ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
