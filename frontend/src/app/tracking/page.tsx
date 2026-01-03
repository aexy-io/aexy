"use client";

import { useRouter } from "next/navigation";
import {
  Activity,
  MessageSquare,
  Clock,
  AlertTriangle,
  ChevronRight,
  Ticket,
  Zap,
  UserCheck,
  XCircle,
} from "lucide-react";
import { IndividualTrackingDashboard } from "@/components/tracking";
import {
  useTrackingDashboard,
  useSubmitStandup,
  useLogTime,
  useReportBlocker,
  useResolveBlocker,
} from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTicketStats } from "@/hooks/useTicketing";
import { AppHeader } from "@/components/layout/AppHeader";

export default function TrackingPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { data: dashboard, isLoading } = useTrackingDashboard();
  const { stats: ticketStats } = useTicketStats(workspaceId);
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
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Activity className="h-8 w-8 text-emerald-400" />
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

        {/* Ticket Metrics */}
        {ticketStats && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Ticket className="h-5 w-5 text-pink-400" />
                Ticket Overview
              </h2>
              <button
                onClick={() => router.push("/tickets")}
                className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                View all tickets
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-blue-900/20">
                    <Ticket className="h-4 w-4 text-blue-400" />
                  </div>
                  <span className="text-sm text-slate-400">Open</span>
                </div>
                <p className="text-2xl font-bold text-white">{ticketStats.open_tickets}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-purple-900/20">
                    <UserCheck className="h-4 w-4 text-purple-400" />
                  </div>
                  <span className="text-sm text-slate-400">Assigned to Me</span>
                </div>
                <p className="text-2xl font-bold text-white">{ticketStats.assigned_to_me || 0}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-orange-900/20">
                    <Zap className="h-4 w-4 text-orange-400" />
                  </div>
                  <span className="text-sm text-slate-400">Unassigned</span>
                </div>
                <p className="text-2xl font-bold text-white">{ticketStats.unassigned || 0}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-red-900/20">
                    <XCircle className="h-4 w-4 text-red-400" />
                  </div>
                  <span className="text-sm text-slate-400">SLA Breached</span>
                </div>
                <p className="text-2xl font-bold text-white">{ticketStats.sla_breached}</p>
              </div>
            </div>
          </div>
        )}

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
      </main>
    </div>
  );
}
