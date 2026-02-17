"use client";

import { X, Calendar, Clock, User, Palmtree, CalendarCheck } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: "leave" | "booking" | "holiday";
  color: string;
  all_day: boolean;
  developer_name: string | null;
  developer_avatar: string | null;
  metadata: Record<string, unknown>;
}

interface EventDetailModalProps {
  event: CalendarEvent | null;
  onClose: () => void;
}

const typeConfig = {
  leave: { label: "Leave", icon: Palmtree, badgeClass: "bg-blue-500/10 text-blue-400" },
  booking: { label: "Booking", icon: CalendarCheck, badgeClass: "bg-indigo-500/10 text-indigo-400" },
  holiday: { label: "Holiday", icon: Calendar, badgeClass: "bg-red-500/10 text-red-400" },
};

export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  if (!event) return null;

  const config = typeConfig[event.type];
  const Icon = config.icon;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr.includes("T")) return null;
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md mx-4 bg-background border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
        {/* Color bar */}
        <div className="h-1" style={{ backgroundColor: event.color }} />

        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${event.color}15` }}
            >
              <Icon className="h-5 w-5" style={{ color: event.color }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {event.title}
              </h3>
              <span
                className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${config.badgeClass}`}
              >
                {config.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Details */}
        <div className="px-5 pb-5 space-y-3">
          {/* Date/time */}
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{formatDate(event.start)}</span>
            {event.start !== event.end && (
              <>
                <span className="text-muted-foreground">-</span>
                <span>{formatDate(event.end)}</span>
              </>
            )}
          </div>

          {!event.all_day && (formatTime(event.start) || formatTime(event.end)) && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                {formatTime(event.start)}
                {formatTime(event.end) && ` - ${formatTime(event.end)}`}
              </span>
            </div>
          )}

          {/* Developer */}
          {event.developer_name && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              {event.developer_avatar ? (
                <img
                  src={event.developer_avatar}
                  alt=""
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              <span>{event.developer_name}</span>
            </div>
          )}

          {/* Metadata */}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="pt-2 border-t border-border space-y-2">
              {event.type === "leave" && (
                <>
                  {event.metadata.leave_type && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Leave Type</span>
                      <span className="text-foreground">
                        {String(event.metadata.leave_type)}
                      </span>
                    </div>
                  )}
                  {event.metadata.total_days && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="text-foreground">
                        {String(event.metadata.total_days)} day
                        {Number(event.metadata.total_days) !== 1 ? "s" : ""}
                        {event.metadata.is_half_day && ` (${event.metadata.half_day_period === "first_half" ? "AM" : "PM"})`}
                      </span>
                    </div>
                  )}
                  {event.metadata.reason && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Reason</span>
                      <p className="mt-1 text-foreground bg-muted/50 rounded-lg p-2">
                        {String(event.metadata.reason)}
                      </p>
                    </div>
                  )}
                </>
              )}

              {event.type === "booking" && (
                <>
                  {event.metadata.event_type && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Event Type</span>
                      <span className="text-foreground">
                        {String(event.metadata.event_type)}
                      </span>
                    </div>
                  )}
                  {event.metadata.invitee_name && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Invitee</span>
                      <span className="text-foreground">
                        {String(event.metadata.invitee_name)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {event.type === "holiday" && (
                <>
                  {event.metadata.description && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Description</span>
                      <p className="mt-1 text-foreground">
                        {String(event.metadata.description)}
                      </p>
                    </div>
                  )}
                  {event.metadata.is_optional !== undefined && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Type</span>
                      <span className="text-foreground">
                        {event.metadata.is_optional ? "Optional" : "Mandatory"}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
