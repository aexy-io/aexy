"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Settings,
  Calendar,
  Bell,
  RefreshCw,
  Link as LinkIcon,
  Unlink,
  Globe,
  Clock,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeam, useTeamMembers } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";
import {
  useOnCallConfig,
  useOnCallSchedules,
  useCurrentOnCall,
  useSwapRequests,
  useGoogleCalendarStatus,
  useGoogleCalendarConnect,
  useGoogleCalendars,
} from "@/hooks/useOnCall";
import OnCallScheduleEditor from "@/components/oncall/OnCallScheduleEditor";
import CurrentOnCallBadge from "@/components/oncall/CurrentOnCallBadge";
import SwapRequestsList from "@/components/oncall/SwapRequestsList";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export default function OnCallSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.projectId as string;

  const { user:developer } = useAuth();
  const { currentWorkspace, currentWorkspaceLoading } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { team, isLoading: teamLoading } = useTeam(workspaceId, teamId);
  const { members: teamMembers } = useTeamMembers(workspaceId, teamId);

  // On-call hooks
  const {
    config,
    isLoading: configLoading,
    enableOnCall,
    disableOnCall,
    updateConfig,
    isEnabling,
    isDisabling,
    isUpdating,
  } = useOnCallConfig(workspaceId, teamId);

  // Date range for schedules (current month + next 2 months)
  const dateRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }, []);

  const {
    schedules,
    createSchedule,
    deleteSchedule,
    isCreating,
    isDeleting,
  } = useOnCallSchedules(workspaceId, teamId, dateRange.start, dateRange.end);

  const { isActive, currentSchedule, nextSchedule } = useCurrentOnCall(workspaceId, teamId);

  const {
    swapRequests,
    requestSwap,
    acceptSwap,
    declineSwap,
    isAccepting,
    isDeclining,
  } = useSwapRequests(workspaceId, teamId);

  // Google Calendar hooks
  const { status: calendarStatus, isConnected: isCalendarConnected } = useGoogleCalendarStatus(workspaceId);
  const { getConnectUrl, disconnect, isGettingUrl, isDisconnecting } = useGoogleCalendarConnect(workspaceId);
  const { calendars, selectCalendar, syncCalendar, isSelecting, isSyncing } = useGoogleCalendars(workspaceId, isCalendarConnected);

  // Local state
  const [showSettings, setShowSettings] = useState(false);
  const [timezone, setTimezone] = useState(config?.timezone || "UTC");
  const [selectedCalendarId, setSelectedCalendarId] = useState(config?.google_calendar_id || "");

  const handleEnableOnCall = async () => {
    try {
      await enableOnCall({ timezone });
    } catch (error) {
      console.error("Failed to enable on-call:", error);
    }
  };

  const handleDisableOnCall = async () => {
    if (confirm("Are you sure you want to disable on-call for this team? All schedules will be preserved.")) {
      try {
        await disableOnCall();
      } catch (error) {
        console.error("Failed to disable on-call:", error);
      }
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const { auth_url } = await getConnectUrl();
      window.location.href = auth_url;
    } catch (error) {
      console.error("Failed to get calendar connect URL:", error);
    }
  };

  const handleSelectCalendar = async () => {
    if (!selectedCalendarId) return;
    try {
      await selectCalendar({ teamId, calendarId: selectedCalendarId });
    } catch (error) {
      console.error("Failed to select calendar:", error);
    }
  };

  const handleSyncCalendar = async () => {
    try {
      await syncCalendar(teamId);
    } catch (error) {
      console.error("Failed to sync calendar:", error);
    }
  };

  const isAdmin = true; // TODO: Check actual permissions
  const currentUserId = developer?.id || "";

  if (currentWorkspaceLoading || teamLoading || configLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Ensure workspace is loaded before rendering
  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <p>No workspace selected</p>
          <Link href="/settings/organization" className="text-blue-400 hover:underline mt-2 block">
            Go to Organization Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-12">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/settings/projects"
              className="p-2 hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5 text-slate-400" />
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-green-400" />
                <h1 className="text-xl font-semibold text-white">On-Call Settings</h1>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                {team?.name || "Team"}
              </p>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                showSettings ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Not Enabled State */}
        {!config?.is_enabled && (
          <div className="bg-slate-800 rounded-xl p-8 text-center">
            <Phone className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">On-Call Not Enabled</h2>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              Enable on-call scheduling for this team to manage who&apos;s on-call and when.
              Team members will receive notifications before their shifts.
            </p>
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-slate-400">Timezone:</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleEnableOnCall}
                disabled={isEnabling}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                {isEnabling ? "Enabling..." : "Enable On-Call"}
              </button>
            </div>
          </div>
        )}

        {/* Enabled State */}
        {config?.is_enabled && (
          <div className="space-y-6">
            {/* Current On-Call Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">Current Status</h3>
                <CurrentOnCallBadge
                  currentSchedule={currentSchedule}
                  nextSchedule={nextSchedule}
                  isActive={isActive}
                />
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">Google Calendar</h3>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  {isCalendarConnected ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-green-400" />
                        <span className="text-sm text-white">{calendarStatus?.calendar_email}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSyncCalendar}
                          disabled={isSyncing}
                          className="p-1.5 text-slate-400 hover:text-white transition"
                          title="Sync now"
                        >
                          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          onClick={() => disconnect()}
                          disabled={isDisconnecting}
                          className="p-1.5 text-red-400 hover:text-red-300 transition"
                          title="Disconnect"
                        >
                          <Unlink className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleConnectCalendar}
                      disabled={isGettingUrl}
                      className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition"
                    >
                      <LinkIcon className="h-4 w-4" />
                      {isGettingUrl ? "Connecting..." : "Connect Google Calendar"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Settings Panel (collapsible) */}
            {showSettings && (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Timezone</label>
                    <select
                      value={config.timezone}
                      onChange={(e) => updateConfig({ timezone: e.target.value })}
                      disabled={isUpdating}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Notify before shift (minutes)
                    </label>
                    <input
                      type="number"
                      value={config.notify_before_shift_minutes}
                      onChange={(e) =>
                        updateConfig({ notify_before_shift_minutes: parseInt(e.target.value) })
                      }
                      disabled={isUpdating}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min={0}
                      max={1440}
                    />
                  </div>
                  {isCalendarConnected && calendars.length > 0 && (
                    <div className="md:col-span-2">
                      <label className="block text-sm text-slate-400 mb-1">
                        Sync to Calendar
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={selectedCalendarId || config.google_calendar_id || ""}
                          onChange={(e) => setSelectedCalendarId(e.target.value)}
                          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select a calendar...</option>
                          {calendars.map((cal) => (
                            <option key={cal.id} value={cal.id}>
                              {cal.summary} {cal.primary ? "(Primary)" : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleSelectCalendar}
                          disabled={!selectedCalendarId || isSelecting}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          {isSelecting ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-6 pt-4 border-t border-slate-700">
                  <button
                    onClick={handleDisableOnCall}
                    disabled={isDisabling}
                    className="text-sm text-red-400 hover:text-red-300 transition"
                  >
                    {isDisabling ? "Disabling..." : "Disable On-Call"}
                  </button>
                </div>
              </div>
            )}

            {/* Swap Requests */}
            {swapRequests.filter((r) => r.status === "pending").length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Pending Swap Requests</h3>
                <SwapRequestsList
                  swapRequests={swapRequests}
                  currentUserId={currentUserId}
                  onAccept={acceptSwap}
                  onDecline={(swapId) => declineSwap({ swapId })}
                  isAccepting={isAccepting}
                  isDeclining={isDeclining}
                />
              </div>
            )}

            {/* Schedule Editor */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Schedule</h3>
              <OnCallScheduleEditor
                schedules={schedules}
                teamMembers={teamMembers}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onCreateSchedule={createSchedule}
                onDeleteSchedule={deleteSchedule}
                onRequestSwap={(scheduleId, targetId, message) =>
                  requestSwap({ scheduleId, targetId, message })
                }
                isCreating={isCreating}
                isDeleting={isDeleting}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
