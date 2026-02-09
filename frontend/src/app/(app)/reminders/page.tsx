"use client";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useReminderDashboard,
  useMyReminders,
  useReminders,
} from "@/hooks/useReminders";
import {
  ReminderCard,
  ReminderInstanceCard,
  ReminderCategoryBadge,
  ReminderPriorityBadge,
} from "@/components/reminders/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Plus,
  Calendar,
  Settings,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  BarChart3,
  Upload,
  FileSearch,
} from "lucide-react";
import { ReminderCategory, ReminderPriority } from "@/lib/api";

export default function RemindersPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { stats, isLoading: statsLoading } = useReminderDashboard(workspaceId);
  const { assignedToMe, overdue, isLoading: myRemindersLoading } = useMyReminders(workspaceId);
  const { reminders, isLoading: remindersLoading } = useReminders(workspaceId, {
    status: "active",
    pageSize: 5,
  });

  const isLoading = statsLoading || myRemindersLoading || remindersLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reminders</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Track compliance commitments, reviews, and recurring tasks
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/compliance/reminders/calendar"
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            Calendar
          </Link>
          <Link
            href="/compliance/reminders/compliance"
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <FileSearch className="h-4 w-4" />
            Compliance Center
          </Link>
          <Link
            href="/compliance/reminders/import"
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import Questionnaire
          </Link>
          <Link
            href="/compliance/reminders/new"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Reminder
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Bell className="h-4 w-4" />
            <span>Active Reminders</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {stats?.active_reminders || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Clock className="h-4 w-4" />
            <span>Pending</span>
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {stats?.pending_instances || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-900/50 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span>Overdue</span>
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {stats?.overdue_instances || 0}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span>Completed This Week</span>
          </div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {stats?.completed_this_week || 0}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Tasks Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overdue Section - Prominent if there are any */}
          {overdue.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="p-4 border-b border-red-200 dark:border-red-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">
                    Overdue ({overdue.length})
                  </h2>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {overdue.slice(0, 3).map((instance) => (
                  <ReminderInstanceCard
                    key={instance.id}
                    instance={instance}
                    showReminderInfo={true}
                    showActions={false}
                  />
                ))}
                {overdue.length > 3 && (
                  <Link
                    href="/compliance/reminders?filter=overdue"
                    className="block text-center text-sm text-red-600 hover:text-red-700 py-2"
                  >
                    View all {overdue.length} overdue items
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Assigned to Me */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Assigned to Me
              </h2>
              <Link
                href="/compliance/reminders/my-reminders"
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {assignedToMe.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  All caught up!
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  No pending reminders assigned to you
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {assignedToMe.slice(0, 5).map((instance) => (
                  <ReminderInstanceCard
                    key={instance.id}
                    instance={instance}
                    showReminderInfo={true}
                    showActions={false}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Active Reminders */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Active Reminders
              </h2>
              <Link
                href="/compliance/reminders/all"
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {reminders.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No active reminders
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  Create your first reminder to start tracking compliance tasks
                </p>
                <Link
                  href="/compliance/reminders/new"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Reminder
                </Link>
              </div>
            ) : (
              <div className="p-4 grid gap-3 md:grid-cols-2">
                {reminders.map((reminder) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    showActions={false}
                    onClick={() => {
                      router.push(`/compliance/reminders/${reminder.id}`);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming 7 Days */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Upcoming (7 Days)
              </h2>
            </div>

            {stats?.upcoming_7_days && stats.upcoming_7_days.length > 0 ? (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {stats.upcoming_7_days.slice(0, 5).map((instance) => (
                  <div
                    key={instance.id}
                    className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {instance.reminder?.title || "Reminder"}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="h-3 w-3" />
                      {new Date(instance.due_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center">
                <Calendar className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No upcoming reminders
                </p>
              </div>
            )}
          </div>

          {/* Category Breakdown */}
          {stats?.by_category && Object.keys(stats.by_category).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    By Category
                  </h2>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {Object.entries(stats.by_category).map(([category, total]) => (
                  <div key={category} className="flex items-center justify-between">
                    <ReminderCategoryBadge category={category as ReminderCategory} />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                      {total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              Quick Links
            </h3>
            <div className="space-y-2">
              <Link
                href="/compliance/reminders/calendar"
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              >
                <Calendar className="h-4 w-4" />
                Calendar View
              </Link>
              <Link
                href="/settings/reminders"
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              >
                <Settings className="h-4 w-4" />
                Reminder Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
