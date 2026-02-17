"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { Standup } from "@/lib/api";
import { StandupCard } from "./StandupCard";

interface StandupTimelineProps {
  standups: Standup[];
  isLoading?: boolean;
  showAuthor?: boolean;
}

export function StandupTimeline({ standups, isLoading = false, showAuthor = false }: StandupTimelineProps) {
  const [selectedWeek, setSelectedWeek] = useState(0); // 0 = current week, -1 = last week, etc.

  const getWeekDates = (weekOffset: number) => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { start: startOfWeek, end: endOfWeek };
  };

  const { start, end } = getWeekDates(selectedWeek);

  const filteredStandups = standups.filter((standup) => {
    const date = new Date(standup.standup_date);
    return date >= start && date <= end;
  });

  const formatWeekRange = () => {
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString("en-US", options)} - ${end.toLocaleDateString("en-US", options)}`;
  };

  const groupByDate = (standups: Standup[]) => {
    const groups: Record<string, Standup[]> = {};
    standups.forEach((standup) => {
      const dateKey = new Date(standup.standup_date).toDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(standup);
    });
    return groups;
  };

  const groupedStandups = groupByDate(filteredStandups);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted rounded-xl p-6 border border-border animate-pulse">
            <div className="h-4 bg-accent rounded w-1/4 mb-4" />
            <div className="space-y-2">
              <div className="h-3 bg-accent rounded w-3/4" />
              <div className="h-3 bg-accent rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between bg-muted rounded-xl p-4 border border-border">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-400" />
          <span className="font-medium text-foreground">{formatWeekRange()}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedWeek(selectedWeek - 1)}
            className="p-2 hover:bg-accent rounded-lg transition"
          >
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setSelectedWeek(0)}
            disabled={selectedWeek === 0}
            className="px-3 py-1.5 text-sm bg-accent text-foreground rounded-lg hover:bg-muted transition disabled:opacity-50"
          >
            This Week
          </button>
          <button
            onClick={() => setSelectedWeek(selectedWeek + 1)}
            disabled={selectedWeek >= 0}
            className="p-2 hover:bg-accent rounded-lg transition disabled:opacity-50"
          >
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Standups */}
      {Object.keys(groupedStandups).length === 0 ? (
        <div className="bg-muted rounded-xl p-8 border border-border text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No standups for this week</p>
          <p className="text-sm text-muted-foreground mt-1">
            Submit your standup to see it here
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedStandups)
            .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
            .map(([dateKey, dayStandups]) => (
              <div key={dateKey}>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  {new Date(dateKey).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </h3>
                <div className="space-y-3">
                  {dayStandups.map((standup) => (
                    <StandupCard key={standup.id} standup={standup} showAuthor={showAuthor} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
