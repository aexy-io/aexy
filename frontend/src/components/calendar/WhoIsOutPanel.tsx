"use client";

import { Palmtree } from "lucide-react";
import { useWhoIsOut } from "@/hooks/useLeave";

interface WhoIsOutPanelProps {
  date?: string;
  teamId?: string;
}

export function WhoIsOutPanel({ date, teamId }: WhoIsOutPanelProps) {
  const { data: whoIsOut, isLoading } = useWhoIsOut(date, teamId);

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 animate-pulse">
        <div className="h-5 w-32 bg-slate-800 rounded mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-slate-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <Palmtree className="h-4 w-4 text-amber-400" />
        <h4 className="text-sm font-semibold text-white">
          Who&apos;s Out{" "}
          {whoIsOut?.date && (
            <span className="font-normal text-slate-400">
              {new Date(whoIsOut.date + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </h4>
        {whoIsOut && whoIsOut.total_out > 0 && (
          <span className="ml-auto text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-medium">
            {whoIsOut.total_out}
          </span>
        )}
      </div>

      <div className="p-3">
        {!whoIsOut || whoIsOut.entries.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-3">
            Everyone&apos;s available
          </p>
        ) : (
          <div className="space-y-2">
            {whoIsOut.entries.map((entry) => (
              <div
                key={entry.developer_id}
                className="flex items-center gap-2.5 p-2 bg-slate-800/50 rounded-lg"
              >
                {entry.developer_avatar ? (
                  <img
                    src={entry.developer_avatar}
                    alt=""
                    className="w-6 h-6 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0">
                    {entry.developer_name?.[0] || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {entry.developer_name || "Unknown"}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.leave_type_color }}
                    />
                    <span className="text-[10px] text-slate-500 truncate">
                      {entry.leave_type}
                      {entry.is_half_day && ` (${entry.half_day_period === "first_half" ? "AM" : "PM"})`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
