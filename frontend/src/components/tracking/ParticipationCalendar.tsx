"use client";

import { useMemo } from "react";
import { HeatmapCalendar, standupsToHeatmap } from "./charts";
import { Standup } from "@/lib/api";

interface ParticipationCalendarProps {
  standups: Standup[];
  weeks?: number;
  title?: string;
  className?: string;
}

export function ParticipationCalendar({
  standups,
  weeks = 52,
  title = "Standup Participation",
  className = "",
}: ParticipationCalendarProps) {
  const heatmapData = useMemo(() => {
    return standupsToHeatmap(standups);
  }, [standups]);

  const stats = useMemo(() => {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - weeks * 7);

    let totalDays = 0;
    let weekdays = 0;
    let standupDays = 0;

    const standupDates = new Set(
      standups
        .filter((s) => {
          const date = new Date(s.standup_date);
          return date >= startDate && date <= today;
        })
        .map((s) => s.standup_date.split("T")[0])
    );

    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      totalDays++;
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        weekdays++;
      }
      const dateKey = d.toISOString().split("T")[0];
      if (standupDates.has(dateKey)) {
        standupDays++;
      }
    }

    const rate = weekdays > 0 ? Math.round((standupDays / weekdays) * 100) : 0;

    return {
      totalStandups: standupDays,
      weekdays,
      participationRate: rate,
    };
  }, [standups, weeks]);

  // Custom color scale for standups (0 = no standup, 1+ = has standup)
  const colorScale = [
    "#1e293b", // 0: empty (slate-800)
    "#166534", // 1: has standup (green-800)
    "#15803d", // Multiple (shouldn't happen but just in case)
    "#16a34a",
    "#22c55e",
    "#4ade80",
  ];

  return (
    <div className={className}>
      <HeatmapCalendar
        data={heatmapData}
        weeks={weeks}
        title={title}
        colorScale={colorScale}
        valueFormatter={(v) => (v > 0 ? "Standup submitted" : "No standup")}
        maxValue={1}
      />

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="bg-background rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.totalStandups}</p>
          <p className="text-xs text-muted-foreground">Total Standups</p>
        </div>
        <div className="bg-background rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.weekdays}</p>
          <p className="text-xs text-muted-foreground">Weekdays</p>
        </div>
        <div className="bg-background rounded-lg p-3 text-center">
          <p className={`text-2xl font-bold ${
            stats.participationRate >= 80
              ? "text-green-400"
              : stats.participationRate >= 50
              ? "text-yellow-400"
              : "text-red-400"
          }`}>
            {stats.participationRate}%
          </p>
          <p className="text-xs text-muted-foreground">Participation Rate</p>
        </div>
      </div>
    </div>
  );
}

// Streak display component
export function StandupStreak({
  standups,
  className = "",
}: {
  standups: Standup[];
  className?: string;
}) {
  const { currentStreak, longestStreak, lastStandup } = useMemo(() => {
    if (standups.length === 0) {
      return { currentStreak: 0, longestStreak: 0, lastStandup: null };
    }

    // Sort by date descending
    const sorted = [...standups].sort((a, b) =>
      b.standup_date.localeCompare(a.standup_date)
    );

    // Get unique dates
    const uniqueDates = [...new Set(sorted.map((s) => s.standup_date.split("T")[0]))];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate current streak
    let currentStreak = 0;
    let checkDate = new Date(today);

    // Check if today has a standup
    const todayStr = today.toISOString().split("T")[0];
    if (uniqueDates.includes(todayStr)) {
      currentStreak = 1;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Count consecutive days (excluding weekends)
    while (true) {
      const checkStr = checkDate.toISOString().split("T")[0];
      const dayOfWeek = checkDate.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }

      if (uniqueDates.includes(checkStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Calculate longest streak (simplified - just current for now)
    const longestStreak = currentStreak;

    return {
      currentStreak,
      longestStreak,
      lastStandup: sorted[0],
    };
  }, [standups]);

  return (
    <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
      <div className="text-center">
        <div className="text-5xl font-bold text-foreground mb-2">
          {currentStreak}
          <span className="text-2xl text-muted-foreground ml-1">days</span>
        </div>
        <p className="text-muted-foreground text-sm">Current Streak</p>
      </div>

      {currentStreak >= 5 && (
        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-900/30 text-amber-400 text-sm rounded-full">
            {currentStreak >= 20 ? "On Fire!" : currentStreak >= 10 ? "Great Progress!" : "Keep Going!"}
          </span>
        </div>
      )}

      {lastStandup && (
        <div className="mt-4 pt-4 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            Last standup:{" "}
            {new Date(lastStandup.standup_date).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
