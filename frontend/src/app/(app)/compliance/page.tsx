"use client";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useReminderDashboard,
} from "@/hooks/useReminders";
import Link from "next/link";
import {
  ShieldCheck,
  Bell,
  FileStack,
  GraduationCap,
  Award,
  Calendar,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  FileSearch,
} from "lucide-react";

export default function ComplianceDashboardPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { stats, isLoading } = useReminderDashboard(workspaceId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const modules = [
    {
      href: "/compliance/reminders",
      label: "Reminders",
      description: "Track compliance commitments, reviews, and recurring tasks",
      icon: Bell,
      stat: stats?.active_reminders || 0,
      statLabel: "Active",
      alert: (stats?.overdue_instances || 0) > 0 ? `${stats?.overdue_instances} overdue` : null,
    },
    {
      href: "/compliance/documents",
      label: "Document Center",
      description: "Upload, organize, and link compliance documents",
      icon: FileStack,
      stat: null,
      statLabel: null,
      alert: null,
    },
    {
      href: "/compliance/reminders/compliance",
      label: "Questionnaires",
      description: "Import and manage compliance questionnaires",
      icon: FileSearch,
      stat: null,
      statLabel: null,
      alert: null,
    },
    {
      href: "/compliance/training",
      label: "Training",
      description: "Mandatory training programs and assignments",
      icon: GraduationCap,
      stat: null,
      statLabel: null,
      alert: null,
    },
    {
      href: "/compliance/certifications",
      label: "Certifications",
      description: "Track employee certifications and renewals",
      icon: Award,
      stat: null,
      statLabel: null,
      alert: null,
    },
    {
      href: "/compliance/calendar",
      label: "Calendar",
      description: "View all compliance deadlines in a calendar",
      icon: Calendar,
      stat: null,
      statLabel: null,
      alert: null,
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Compliance</h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-1 ml-10">
            Manage compliance reminders, documents, training, and certifications
          </p>
        </div>
      </div>

      {/* Stats Overview */}
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

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <mod.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {mod.label}
                  </h3>
                  {mod.stat !== null && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {mod.stat} {mod.statLabel}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              {mod.description}
            </p>
            {mod.alert && (
              <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {mod.alert}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
