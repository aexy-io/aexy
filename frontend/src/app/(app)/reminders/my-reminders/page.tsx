"use client";

import Link from "next/link";
import {
  ChevronLeft,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bell,
  Users,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useMyReminders } from "@/hooks/useReminders";
import { ReminderInstanceCard } from "@/components/reminders/shared";
import { ReminderInstance } from "@/lib/api";

function Section({
  title,
  icon,
  instances,
  variant = "default",
  onAcknowledge,
  onComplete,
}: {
  title: string;
  icon: React.ReactNode;
  instances: ReminderInstance[];
  variant?: "danger" | "warning" | "default";
  onAcknowledge: (instanceId: string) => void;
  onComplete: (instanceId: string) => void;
}) {
  if (instances.length === 0) return null;

  const wrapperClass =
    variant === "danger"
      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
      : variant === "warning"
      ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700";

  const headerClass =
    variant === "danger"
      ? "border-red-200 dark:border-red-800"
      : variant === "warning"
      ? "border-amber-200 dark:border-amber-800"
      : "border-gray-200 dark:border-gray-700";

  const titleClass =
    variant === "danger"
      ? "text-red-700 dark:text-red-400"
      : variant === "warning"
      ? "text-amber-700 dark:text-amber-400"
      : "text-gray-900 dark:text-white";

  return (
    <div className={`rounded-lg border ${wrapperClass}`}>
      <div className={`p-4 border-b ${headerClass} flex items-center gap-2`}>
        {icon}
        <h2 className={`text-lg font-semibold ${titleClass}`}>
          {title} ({instances.length})
        </h2>
      </div>
      <div className="p-4 space-y-3">
        {instances.map((instance) => (
          <ReminderInstanceCard
            key={instance.id}
            instance={instance}
            showReminderInfo={true}
            showActions={true}
            onAcknowledge={onAcknowledge}
            onComplete={onComplete}
          />
        ))}
      </div>
    </div>
  );
}

export default function MyRemindersPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const {
    assignedToMe,
    myTeamReminders,
    overdue,
    dueToday,
    dueThisWeek,
    isLoading,
    acknowledgeInstance,
    completeInstance,
  } = useMyReminders(workspaceId);

  const handleAcknowledge = (instanceId: string) => {
    acknowledgeInstance({ instanceId });
  };

  const handleComplete = (instanceId: string) => {
    completeInstance({ instanceId });
  };

  const totalItems =
    overdue.length + dueToday.length + assignedToMe.length + myTeamReminders.length + dueThisWeek.length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/reminders"
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Reminders
        </Link>
        <span className="text-gray-300 dark:text-gray-600">/</span>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Reminders</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : totalItems === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            All caught up!
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            You have no pending reminders assigned to you or your team.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <Section
            title="Overdue"
            icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
            instances={overdue}
            variant="danger"
            onAcknowledge={handleAcknowledge}
            onComplete={handleComplete}
          />
          <Section
            title="Due Today"
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            instances={dueToday}
            variant="warning"
            onAcknowledge={handleAcknowledge}
            onComplete={handleComplete}
          />
          <Section
            title="Assigned to Me"
            icon={<Bell className="h-5 w-5 text-blue-500" />}
            instances={assignedToMe.filter(
              (i) =>
                !overdue.find((o) => o.id === i.id) &&
                !dueToday.find((d) => d.id === i.id)
            )}
            variant="default"
            onAcknowledge={handleAcknowledge}
            onComplete={handleComplete}
          />
          <Section
            title="Due This Week"
            icon={<Clock className="h-5 w-5 text-gray-400" />}
            instances={dueThisWeek.filter(
              (i) =>
                !overdue.find((o) => o.id === i.id) &&
                !dueToday.find((d) => d.id === i.id) &&
                !assignedToMe.find((a) => a.id === i.id)
            )}
            variant="default"
            onAcknowledge={handleAcknowledge}
            onComplete={handleComplete}
          />
          <Section
            title="My Team"
            icon={<Users className="h-5 w-5 text-purple-500" />}
            instances={myTeamReminders.filter(
              (i) =>
                !overdue.find((o) => o.id === i.id) &&
                !dueToday.find((d) => d.id === i.id) &&
                !assignedToMe.find((a) => a.id === i.id) &&
                !dueThisWeek.find((w) => w.id === i.id)
            )}
            variant="default"
            onAcknowledge={handleAcknowledge}
            onComplete={handleComplete}
          />
        </div>
      )}
    </div>
  );
}
