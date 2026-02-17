"use client";

import React from "react";
import {
  MoreVertical,
  User,
  Users,
  Bell,
  Edit2,
  Trash2,
  Pause,
  Play,
  Archive,
  Calendar,
} from "lucide-react";
import { Reminder } from "@/lib/api";
import { ReminderStatusBadge } from "./ReminderStatusBadge";
import { ReminderPriorityBadge } from "./ReminderPriorityBadge";
import { ReminderCategoryBadge } from "./ReminderCategoryBadge";
import { FrequencyBadge } from "./RecurrenceDisplay";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface ReminderCardProps {
  reminder: Reminder;
  onClick?: (reminder: Reminder) => void;
  onEdit?: (reminder: Reminder) => void;
  onDelete?: (reminderId: string) => void;
  onPause?: (reminderId: string) => void;
  onResume?: (reminderId: string) => void;
  onArchive?: (reminderId: string) => void;
  showActions?: boolean;
  className?: string;
}

export function ReminderCard({
  reminder,
  onClick,
  onEdit,
  onDelete,
  onPause,
  onResume,
  onArchive,
  showActions = true,
  className,
}: ReminderCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  const handleMenuAction = (action: () => void) => {
    action();
    setShowMenu(false);
  };

  return (
    <div
      className={cn(
        "group relative bg-muted/50 border border-border/50 rounded-lg p-4 hover:border-border/50 hover:bg-muted/70 transition-all",
        onClick && "cursor-pointer",
        className
      )}
      onClick={() => onClick?.(reminder)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ReminderCategoryBadge category={reminder.category} />
          <ReminderPriorityBadge priority={reminder.priority} />
        </div>
        <div className="flex items-center gap-1">
          <ReminderStatusBadge status={reminder.status} size="sm" showIcon={false} />
          {showActions && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 rounded hover:bg-accent/50 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground mb-2 line-clamp-2">{reminder.title}</h3>

      {/* Description preview */}
      {reminder.description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{reminder.description}</p>
      )}

      {/* Schedule Info */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <FrequencyBadge frequency={reminder.frequency} />
        {reminder.next_occurrence && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Next: {format(parseISO(reminder.next_occurrence), "MMM d")}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {reminder.requires_acknowledgment && (
            <span className="flex items-center gap-1 text-amber-400/80">
              <Bell className="h-3 w-3" />
              Requires ACK
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {reminder.default_owner && (
            <div className="flex items-center gap-1" title={`Assigned to ${reminder.default_owner.name}`}>
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                <User className="h-3 w-3 text-foreground" />
              </div>
              <span className="text-xs text-muted-foreground max-w-[80px] truncate">
                {reminder.default_owner.name}
              </span>
            </div>
          )}
          {!reminder.default_owner && reminder.default_team && (
            <div className="flex items-center gap-1" title={`Assigned to ${reminder.default_team.name}`}>
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-3 w-3 text-foreground" />
              </div>
              <span className="text-xs text-muted-foreground max-w-[80px] truncate">
                {reminder.default_team.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute right-2 top-10 z-10 bg-muted border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 flex items-center gap-2"
              onClick={() => handleMenuAction(() => onEdit(reminder))}
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </button>
          )}
          {reminder.status === "active" && onPause && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 flex items-center gap-2"
              onClick={() => handleMenuAction(() => onPause(reminder.id))}
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          )}
          {reminder.status === "paused" && onResume && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 flex items-center gap-2"
              onClick={() => handleMenuAction(() => onResume(reminder.id))}
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
          )}
          {reminder.status !== "archived" && onArchive && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 flex items-center gap-2"
              onClick={() => handleMenuAction(() => onArchive(reminder.id))}
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
          )}
          {onDelete && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-accent/50 flex items-center gap-2"
              onClick={() => handleMenuAction(() => onDelete(reminder.id))}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
