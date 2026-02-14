"use client";

import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import { useWhoIsOut, useAvailabilitySummary } from "@/hooks/useLeave";

export function TeamAvailabilityWidget() {
  const { data: summary, isLoading: summaryLoading } =
    useAvailabilitySummary();
  const { data: whoIsOut, isLoading: outLoading } = useWhoIsOut();

  const isLoading = summaryLoading || outLoading;

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-44 bg-slate-800 rounded mb-4" />
        <div className="h-20 bg-slate-800 rounded-lg mb-3" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-8 bg-slate-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const total = summary?.total || 0;
  const available = summary?.available || 0;
  const onLeave = summary?.on_leave || 0;
  const onHoliday = summary?.on_holiday || 0;
  const availablePercent = total > 0 ? (available / total) * 100 : 100;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Users className="h-5 w-5 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">
            Team Availability
          </h3>
        </div>
        <Link
          href="/leave"
          className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center gap-1 transition"
        >
          Details <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary ring */}
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-slate-800"
              />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${availablePercent} ${100 - availablePercent}`}
                strokeLinecap="round"
                className="text-emerald-400"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-white">{available}</span>
              <span className="text-[10px] text-slate-500">of {total}</span>
            </div>
          </div>

          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-slate-400">Available</span>
              </div>
              <span className="text-xs font-medium text-white">
                {available}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-xs text-slate-400">On Leave</span>
              </div>
              <span className="text-xs font-medium text-white">{onLeave}</span>
            </div>
            {onHoliday > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs text-slate-400">Holiday</span>
                </div>
                <span className="text-xs font-medium text-white">
                  {onHoliday}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Who is out list */}
        {whoIsOut && whoIsOut.entries.length > 0 && (
          <div className="pt-3 border-t border-slate-800">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              Out Today
            </p>
            <div className="space-y-2">
              {whoIsOut.entries.slice(0, 4).map((entry) => (
                <div
                  key={entry.developer_id}
                  className="flex items-center gap-2"
                >
                  {entry.developer_avatar ? (
                    <img
                      src={entry.developer_avatar}
                      alt=""
                      className="w-5 h-5 rounded-full"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-slate-400">
                      {entry.developer_name?.[0] || "?"}
                    </div>
                  )}
                  <span className="text-xs text-slate-300 truncate flex-1">
                    {entry.developer_name || "Unknown"}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${entry.leave_type_color}15`,
                      color: entry.leave_type_color,
                    }}
                  >
                    {entry.leave_type}
                  </span>
                </div>
              ))}
              {whoIsOut.entries.length > 4 && (
                <p className="text-xs text-slate-500">
                  +{whoIsOut.entries.length - 4} more
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
