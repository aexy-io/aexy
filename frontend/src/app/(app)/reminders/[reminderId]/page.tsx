"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useReminder, useReminderInstances } from "@/hooks/useReminders";
import { ReminderInstance } from "@/lib/api";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const INSTANCE_STATUS_BADGE: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  notified: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  acknowledged: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  skipped: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const FREQUENCY_LABEL: Record<string, string> = {
  once: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

export default function ReminderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const reminderId = params.reminderId as string;

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const {
    reminder,
    isLoading,
    error,
    updateReminder,
    deleteReminder,
    isUpdating,
    isDeleting,
  } = useReminder(workspaceId, reminderId);

  const {
    instances,
    isLoading: instancesLoading,
  } = useReminderInstances(workspaceId, reminderId);

  const [showInstances, setShowInstances] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error || !reminder) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link
          href="/compliance/reminders"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reminders
        </Link>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            Reminder not found
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This reminder may have been deleted or you don&apos;t have access to it.
          </p>
        </div>
      </div>
    );
  }

  const handleToggleStatus = async () => {
    const newStatus = reminder.status === "active" ? "paused" : "active";
    await updateReminder({ status: newStatus });
  };

  const handleDelete = async () => {
    await deleteReminder();
    router.push("/compliance/reminders");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        href="/compliance/reminders"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reminders
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {reminder.title}
            </h1>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[reminder.status] || STATUS_BADGE.active}`}>
                {reminder.status}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_BADGE[reminder.priority] || PRIORITY_BADGE.medium}`}>
                {reminder.priority}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {FREQUENCY_LABEL[reminder.frequency] || reminder.frequency}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {reminder.category}
              </span>
            </div>
            {reminder.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {reminder.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleToggleStatus}
              disabled={isUpdating}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
              title={reminder.status === "active" ? "Pause" : "Resume"}
            >
              {reminder.status === "active" ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400 block text-xs">Start Date</span>
            <span className="text-gray-900 dark:text-white flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(reminder.start_date).toLocaleDateString()}
            </span>
          </div>
          {reminder.next_occurrence && (
            <div>
              <span className="text-gray-500 dark:text-gray-400 block text-xs">Next Due</span>
              <span className="text-gray-900 dark:text-white flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {new Date(reminder.next_occurrence).toLocaleDateString()}
              </span>
            </div>
          )}
          {reminder.default_owner && (
            <div>
              <span className="text-gray-500 dark:text-gray-400 block text-xs">Owner</span>
              <span className="text-gray-900 dark:text-white">{reminder.default_owner.name}</span>
            </div>
          )}
          {reminder.default_team && (
            <div>
              <span className="text-gray-500 dark:text-gray-400 block text-xs">Team</span>
              <span className="text-gray-900 dark:text-white">{reminder.default_team.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Instances */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setShowInstances(!showInstances)}
          className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 text-left"
        >
          <h2 className="text-sm font-medium text-gray-900 dark:text-white">
            Occurrences ({instances.length})
          </h2>
          {showInstances ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </button>
        {showInstances && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {instancesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
              </div>
            ) : instances.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No occurrences yet. They will appear when the reminder is due.
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {instances.map((instance: ReminderInstance) => (
                  <div
                    key={instance.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${INSTANCE_STATUS_BADGE[instance.status] || INSTANCE_STATUS_BADGE.pending}`}>
                        {instance.status}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white">
                        Due: {new Date(instance.due_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {instance.completed_at && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          Completed {new Date(instance.completed_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
