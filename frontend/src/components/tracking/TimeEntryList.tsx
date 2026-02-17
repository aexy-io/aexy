"use client";

import { Clock, Calendar, FileText, Trash2 } from "lucide-react";
import { TimeEntry } from "@/lib/api";

interface TimeEntryListProps {
  entries: TimeEntry[];
  isLoading?: boolean;
  onDelete?: (entryId: string) => Promise<void>;
  showTask?: boolean;
}

export function TimeEntryList({
  entries,
  isLoading = false,
  onDelete,
  showTask = true,
}: TimeEntryListProps) {
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const groupByDate = (entries: TimeEntry[]) => {
    const groups: Record<string, TimeEntry[]> = {};
    entries.forEach((entry) => {
      const dateKey = new Date(entry.entry_date).toDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(entry);
    });
    return groups;
  };

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration_minutes, 0);
  const groupedEntries = groupByDate(entries);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted rounded-lg p-4 border border-border animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg" />
              <div className="flex-1">
                <div className="h-4 bg-accent rounded w-1/3 mb-2" />
                <div className="h-3 bg-accent rounded w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-muted rounded-xl p-8 border border-border text-center">
        <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No time entries yet</p>
        <p className="text-sm text-muted-foreground mt-1">Log your time to see it here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-muted rounded-xl p-4 border border-border">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total Time Logged</span>
          <span className="text-xl font-semibold text-foreground">{formatDuration(totalMinutes)}</span>
        </div>
      </div>

      {/* Grouped Entries */}
      {Object.entries(groupedEntries)
        .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
        .map(([dateKey, dayEntries]) => {
          const dayTotal = dayEntries.reduce((sum, e) => sum + e.duration_minutes, 0);
          return (
            <div key={dateKey}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">{formatDate(dateKey)}</h3>
                <span className="text-sm text-green-400">{formatDuration(dayTotal)}</span>
              </div>
              <div className="space-y-2">
                {dayEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-muted rounded-lg p-4 border border-border hover:border-border transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                          <Clock className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {formatDuration(entry.duration_minutes)}
                            </span>
                            {entry.is_inferred && (
                              <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                                Inferred
                              </span>
                            )}
                          </div>
                          {showTask && entry.task && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                              Task: {entry.task.title}
                            </p>
                          )}
                          {entry.description && (
                            <p className="text-sm text-foreground mt-1">{entry.description}</p>
                          )}
                        </div>
                      </div>
                      {onDelete && (
                        <button
                          onClick={() => onDelete(entry.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
