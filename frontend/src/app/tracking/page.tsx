"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  MessageSquare,
  Clock,
  AlertTriangle,
  Users,
  ChevronRight,
} from "lucide-react";
import { IndividualTrackingDashboard } from "@/components/tracking";
import {
  useTrackingDashboard,
  useSubmitStandup,
  useLogTime,
  useReportBlocker,
  useResolveBlocker,
} from "@/hooks/useTracking";

export default function TrackingPage() {
  const router = useRouter();
  const { data: dashboard, isLoading } = useTrackingDashboard();
  const submitStandup = useSubmitStandup();
  const logTime = useLogTime();
  const reportBlocker = useReportBlocker();
  const resolveBlocker = useResolveBlocker();

  const quickLinks = [
    {
      label: "Standups",
      description: "View standup history",
      icon: MessageSquare,
      color: "text-blue-400",
      bgColor: "bg-blue-900/20",
      href: "/tracking/standups",
    },
    {
      label: "Time Reports",
      description: "Track time logs",
      icon: Clock,
      color: "text-green-400",
      bgColor: "bg-green-900/20",
      href: "/tracking/time",
    },
    {
      label: "Blockers",
      description: "Manage blockers",
      icon: AlertTriangle,
      color: "text-red-400",
      bgColor: "bg-red-900/20",
      href: "/tracking/blockers",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Activity className="h-8 w-8 text-blue-400" />
                My Tracking
              </h1>
              <p className="text-slate-400 mt-2">
                Track your daily progress, time, and blockers
              </p>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.href}
                onClick={() => router.push(link.href)}
                className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${link.bgColor}`}>
                    <Icon className={`h-5 w-5 ${link.color}`} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-white">{link.label}</p>
                    <p className="text-sm text-slate-400">{link.description}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-slate-300 transition" />
              </button>
            );
          })}
        </div>

        {/* Main Dashboard */}
        <IndividualTrackingDashboard
          dashboard={dashboard}
          isLoading={isLoading}
          onSubmitStandup={submitStandup.mutateAsync}
          onLogTime={logTime.mutateAsync}
          onReportBlocker={reportBlocker.mutateAsync}
          onResolveBlocker={(blockerId, notes) =>
            resolveBlocker.mutateAsync({ blockerId, notes })
          }
          isSubmittingStandup={submitStandup.isPending}
          isLoggingTime={logTime.isPending}
          isReportingBlocker={reportBlocker.isPending}
          isResolvingBlocker={resolveBlocker.isPending}
        />
      </div>
    </div>
  );
}
