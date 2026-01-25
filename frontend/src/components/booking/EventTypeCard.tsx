"use client";

import Link from "next/link";
import { Clock, Video, MapPin, Phone, Users, ExternalLink, Copy, MoreVertical } from "lucide-react";
import { EventType } from "@/lib/booking-api";

interface EventTypeCardProps {
  eventType: EventType;
  workspaceSlug?: string;
  showMenu?: boolean;
  onCopyLink?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onToggleActive?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function EventTypeCard({
  eventType,
  workspaceSlug,
  showMenu = false,
  onCopyLink,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
  className = "",
}: EventTypeCardProps) {
  const getLocationIcon = (locationType: string) => {
    switch (locationType) {
      case "zoom":
      case "google_meet":
      case "microsoft_teams":
        return <Video className="h-4 w-4" />;
      case "phone":
        return <Phone className="h-4 w-4" />;
      case "in_person":
        return <MapPin className="h-4 w-4" />;
      default:
        return <Video className="h-4 w-4" />;
    }
  };

  const getLocationLabel = (locationType: string) => {
    return locationType.replace(/_/g, " ");
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${
        !eventType.is_active ? "opacity-60" : ""
      } ${className}`}
    >
      <div className="flex">
        {/* Color bar */}
        <div
          className="w-2 flex-shrink-0"
          style={{ backgroundColor: eventType.color }}
        />

        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {eventType.name}
              </h3>
              {eventType.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {eventType.description}
                </p>
              )}
            </div>

            {/* Quick actions */}
            {workspaceSlug && (
              <button
                onClick={onCopyLink}
                className="ml-2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Copy booking link"
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {eventType.duration_minutes} min
            </span>
            <span className="flex items-center gap-1">
              {getLocationIcon(eventType.location_type)}
              {getLocationLabel(eventType.location_type)}
            </span>
            {eventType.is_team_event && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Team
              </span>
            )}
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2 mt-3">
            {!eventType.is_active && (
              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                Inactive
              </span>
            )}
            {eventType.payment_enabled && eventType.payment_amount && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                ${(eventType.payment_amount / 100).toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
