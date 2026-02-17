"use client";

import { Filter } from "lucide-react";

export type EventTypeFilter = "leave" | "booking" | "holiday";

interface CalendarFiltersProps {
  selectedTeamId: string | null;
  onTeamChange: (teamId: string | null) => void;
  teams: { id: string; name: string }[];
  enabledEventTypes: EventTypeFilter[];
  onEventTypesChange: (types: EventTypeFilter[]) => void;
}

const EVENT_TYPE_OPTIONS: { id: EventTypeFilter; label: string; color: string }[] = [
  { id: "leave", label: "Leaves", color: "#3b82f6" },
  { id: "booking", label: "Bookings", color: "#6366f1" },
  { id: "holiday", label: "Holidays", color: "#ef4444" },
];

export function CalendarFilters({
  selectedTeamId,
  onTeamChange,
  teams,
  enabledEventTypes,
  onEventTypesChange,
}: CalendarFiltersProps) {
  const toggleEventType = (type: EventTypeFilter) => {
    if (enabledEventTypes.includes(type)) {
      if (enabledEventTypes.length > 1) {
        onEventTypesChange(enabledEventTypes.filter((t) => t !== type));
      }
    } else {
      onEventTypesChange([...enabledEventTypes, type]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span className="text-xs font-medium">Filters</span>
      </div>

      {/* Team filter */}
      {teams.length > 0 && (
        <select
          value={selectedTeamId || ""}
          onChange={(e) => onTeamChange(e.target.value || null)}
          className="px-2.5 py-1.5 text-xs bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:border-blue-500/50"
        >
          <option value="">All Teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      )}

      {/* Event type toggles */}
      <div className="flex items-center gap-1.5">
        {EVENT_TYPE_OPTIONS.map((option) => {
          const isActive = enabledEventTypes.includes(option.id);
          return (
            <button
              key={option.id}
              onClick={() => toggleEventType(option.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition ${
                isActive
                  ? "bg-muted border-border text-foreground"
                  : "bg-transparent border-border/50 text-muted-foreground hover:text-muted-foreground"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full transition ${!isActive ? "opacity-40" : ""}`}
                style={{ backgroundColor: option.color }}
              />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
