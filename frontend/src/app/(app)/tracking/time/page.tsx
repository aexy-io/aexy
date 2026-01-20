"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Plus, Calendar, TrendingUp } from "lucide-react";
import { TimeLogForm, TimeEntryList } from "@/components/tracking";
import { useMyTimeEntries, useLogTime } from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";

export default function TimeTrackingPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});

  const { data: timeData, isLoading } = useMyTimeEntries(dateRange);
  const logTime = useLogTime();

  const handleSubmit = async (data: Parameters<typeof logTime.mutateAsync>[0]) => {
    await logTime.mutateAsync(data);
    setShowForm(false);
  };

  // Calculate stats
  const entries = timeData?.entries || [];
  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
  const todayEntries = entries.filter(
    (e) => new Date(e.entry_date).toDateString() === new Date().toDateString()
  );
  const todayMinutes = todayEntries.reduce((sum, e) => sum + e.duration_minutes, 0);
  const thisWeekEntries = entries.filter((e) => {
    const date = new Date(e.entry_date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return date >= weekAgo;
  });
  const weekMinutes = thisWeekEntries.reduce((sum, e) => sum + e.duration_minutes, 0);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="min-h-screen bg-slate-950">
<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/tracking")}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tracking
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Clock className="h-8 w-8 text-green-400" />
                Time Tracking
              </h1>
              <p className="text-slate-400 mt-2">
                Log and view your time entries
              </p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Plus className="h-4 w-4" />
              Log Time
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Calendar className="h-4 w-4" />
              Today
            </div>
            <p className="text-2xl font-semibold text-white">{formatDuration(todayMinutes)}</p>
            <p className="text-sm text-slate-500">{todayEntries.length} entries</p>
          </div>

          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <TrendingUp className="h-4 w-4" />
              This Week
            </div>
            <p className="text-2xl font-semibold text-white">{formatDuration(weekMinutes)}</p>
            <p className="text-sm text-slate-500">{thisWeekEntries.length} entries</p>
          </div>

          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Clock className="h-4 w-4" />
              Total
            </div>
            <p className="text-2xl font-semibold text-white">{formatDuration(totalMinutes)}</p>
            <p className="text-sm text-slate-500">{entries.length} entries</p>
          </div>
        </div>

        {/* Time Log Form */}
        {showForm && (
          <div className="mb-8">
            <TimeLogForm
              onSubmit={handleSubmit}
              isSubmitting={logTime.isPending}
            />
          </div>
        )}

        {/* Time Entries List */}
        <TimeEntryList entries={entries} isLoading={isLoading} />
      </div>
    </div>
  );
}
