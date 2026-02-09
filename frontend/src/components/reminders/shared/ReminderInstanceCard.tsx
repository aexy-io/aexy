"use client";

import React from "react";
import {
  MoreVertical,
  User,
  Users,
  Check,
  CheckCircle2,
  SkipForward,
  UserPlus,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { ReminderInstance } from "@/lib/api";
import { InstanceStatusBadge } from "./InstanceStatusBadge";
import { ReminderPriorityBadge } from "./ReminderPriorityBadge";
import { ReminderCategoryBadge } from "./ReminderCategoryBadge";
import { cn } from "@/lib/utils";
import { format, parseISO, isPast, differenceInHours } from "date-fns";

interface ReminderInstanceCardProps {
  instance: ReminderInstance;
  onClick?: (instance: ReminderInstance) => void;
  onAcknowledge?: (instanceId: string) => void;
  onComplete?: (instanceId: string) => void;
  onSkip?: (instanceId: string) => void;
  onReassign?: (instanceId: string) => void;
  showReminderInfo?: boolean;
  showActions?: boolean;
  className?: string;
}

export function ReminderInstanceCard({
  instance,
  onClick,
  onAcknowledge,
  onComplete,
  onSkip,
  onReassign,
  showReminderInfo = true,
  showActions = true,
  className,
}: ReminderInstanceCardProps) {
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

  const dueDate = parseISO(instance.due_date);
  const isOverdue = isPast(dueDate) && !["completed", "skipped"].includes(instance.status);
  const hoursUntilDue = differenceInHours(dueDate, new Date());
  const isUrgent = hoursUntilDue >= 0 && hoursUntilDue <= 24;

  const handleMenuAction = (action: () => void) => {
    action();
    setShowMenu(false);
  };

  const canAcknowledge = ["pending", "notified"].includes(instance.status) && onAcknowledge;
  const canComplete = ["pending", "notified", "acknowledged", "escalated", "overdue"].includes(instance.status) && onComplete;
  const canSkip = ["pending", "notified", "acknowledged"].includes(instance.status) && onSkip;

  return (
    <div
      className={cn(
        "group relative bg-slate-800/50 border rounded-lg p-4 hover:bg-slate-800/70 transition-all",
        isOverdue ? "border-red-500/50" : isUrgent ? "border-amber-500/50" : "border-slate-700/50",
        onClick && "cursor-pointer",
        className
      )}
      onClick={() => onClick?.(instance)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <InstanceStatusBadge status={instance.status} />
          {showReminderInfo && instance.reminder && (
            <>
              <ReminderCategoryBadge category={instance.reminder.category} />
              <ReminderPriorityBadge priority={instance.reminder.priority} />
            </>
          )}
        </div>
        {showActions && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded hover:bg-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4 text-slate-400" />
          </button>
        )}
      </div>

      {/* Title */}
      {showReminderInfo && instance.reminder && (
        <h3 className="text-sm font-medium text-white mb-2 line-clamp-2">
          {instance.reminder.title}
        </h3>
      )}

      {/* Due Date */}
      <div className={cn(
        "flex items-center gap-1.5 text-sm mb-3",
        isOverdue ? "text-red-400" : isUrgent ? "text-amber-400" : "text-slate-300"
      )}>
        {isOverdue ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Clock className="h-4 w-4" />
        )}
        <span>
          {isOverdue ? "Overdue: " : "Due: "}
          {format(dueDate, "MMM d, yyyy 'at' h:mm a")}
        </span>
      </div>

      {/* Quick Actions for non-completed instances */}
      {(canAcknowledge || canComplete) && (
        <div className="flex items-center gap-2 mb-3">
          {canAcknowledge && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge!(instance.id);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Acknowledge
            </button>
          )}
          {canComplete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onComplete!(instance.id);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Complete
            </button>
          )}
        </div>
      )}

      {/* Completion/Skip info */}
      {instance.status === "completed" && instance.completed_at && (
        <div className="text-xs text-slate-400 mb-3">
          Completed {format(parseISO(instance.completed_at), "MMM d 'at' h:mm a")}
          {instance.completed_by && ` by ${instance.completed_by.name}`}
        </div>
      )}
      {instance.status === "skipped" && instance.skipped_at && (
        <div className="text-xs text-slate-400 mb-3">
          Skipped {format(parseISO(instance.skipped_at), "MMM d 'at' h:mm a")}
          {instance.skip_reason && `: ${instance.skip_reason}`}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {instance.notification_count > 0 && (
            <span>Notified {instance.notification_count}x</span>
          )}
          {instance.current_escalation_level && (
            <span className="text-orange-400">
              Escalation: {instance.current_escalation_level.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {instance.assigned_owner && (
            <div className="flex items-center gap-1" title={`Assigned to ${instance.assigned_owner.name}`}>
              <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center">
                <User className="h-3 w-3 text-slate-300" />
              </div>
              <span className="text-xs text-slate-400 max-w-[80px] truncate">
                {instance.assigned_owner.name}
              </span>
            </div>
          )}
          {!instance.assigned_owner && instance.assigned_team && (
            <div className="flex items-center gap-1" title={`Assigned to ${instance.assigned_team.name}`}>
              <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center">
                <Users className="h-3 w-3 text-slate-300" />
              </div>
              <span className="text-xs text-slate-400 max-w-[80px] truncate">
                {instance.assigned_team.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute right-2 top-10 z-10 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1 min-w-[160px]"
          onClick={(e) => e.stopPropagation()}
        >
          {canAcknowledge && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50 flex items-center gap-2"
              onClick={() => handleMenuAction(() => onAcknowledge!(instance.id))}
            >
              <Check className="h-4 w-4" />
              Acknowledge
            </button>
          )}
          {canComplete && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-green-400 hover:bg-slate-700/50 flex items-center gap-2"
              onClick={() => handleMenuAction(() => onComplete!(instance.id))}
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete
            </button>
          )}
          {canSkip && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-amber-400 hover:bg-slate-700/50 flex items-center gap-2"
              onClick={() => handleMenuAction(() => onSkip!(instance.id))}
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </button>
          )}
          {onReassign && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50 flex items-center gap-2"
              onClick={() => handleMenuAction(() => onReassign(instance.id))}
            >
              <UserPlus className="h-4 w-4" />
              Reassign
            </button>
          )}
        </div>
      )}
    </div>
  );
}
