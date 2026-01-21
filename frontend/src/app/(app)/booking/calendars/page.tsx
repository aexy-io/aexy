"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { bookingApi, CalendarConnection } from "@/lib/booking-api";
import { toast } from "sonner";
import {
  Calendar,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Star,
  Loader2,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

const CALENDAR_PROVIDERS = [
  {
    value: "google",
    label: "Google Calendar",
    icon: "/icons/google-calendar.svg",
    color: "#4285F4",
  },
  {
    value: "microsoft",
    label: "Microsoft Outlook",
    icon: "/icons/outlook.svg",
    color: "#0078D4",
  },
];

export default function CalendarsPage() {
  const { currentWorkspace } = useWorkspace();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    if (currentWorkspace?.id) {
      loadConnections();
    }
  }, [currentWorkspace?.id]);

  const loadConnections = async () => {
    if (!currentWorkspace?.id) return;

    try {
      const data = await bookingApi.calendars.list(currentWorkspace.id);
      setConnections(data);
    } catch (error) {
      console.error("Failed to load calendar connections:", error);
      toast.error("Failed to load calendar connections");
    } finally {
      setLoading(false);
    }
  };

  const connectCalendar = async (provider: string) => {
    if (!currentWorkspace?.id) return;

    setConnecting(provider);

    try {
      const { auth_url } = await bookingApi.calendars.connect(currentWorkspace.id, provider);
      // Redirect to OAuth flow
      window.location.href = auth_url;
    } catch (error) {
      console.error("Failed to connect calendar:", error);
      toast.error("Failed to connect calendar");
      setConnecting(null);
    }
  };

  const disconnectCalendar = async (connectionId: string) => {
    if (!currentWorkspace?.id) return;
    if (!confirm("Are you sure you want to disconnect this calendar?")) return;

    try {
      await bookingApi.calendars.disconnect(currentWorkspace.id, connectionId);
      await loadConnections();
      toast.success("Calendar disconnected");
    } catch (error) {
      toast.error("Failed to disconnect calendar");
    }
  };

  const syncCalendar = async (connectionId: string) => {
    if (!currentWorkspace?.id) return;

    setSyncing(connectionId);

    try {
      await bookingApi.calendars.sync(currentWorkspace.id, connectionId);
      await loadConnections();
      toast.success("Calendar synced successfully");
    } catch (error) {
      toast.error("Failed to sync calendar");
    } finally {
      setSyncing(null);
    }
  };

  const setPrimaryCalendar = async (connectionId: string) => {
    if (!currentWorkspace?.id) return;

    try {
      await bookingApi.calendars.setPrimary(currentWorkspace.id, connectionId);
      await loadConnections();
      toast.success("Primary calendar updated");
    } catch (error) {
      toast.error("Failed to set primary calendar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const connectedProviders = connections.map((c) => c.provider);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Calendar Connections
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Connect your calendars to check for conflicts and automatically create events
        </p>
      </div>

      {/* Connected Calendars */}
      {connections.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Connected Calendars
          </h2>
          <div className="space-y-3">
            {connections.map((connection) => {
              const provider = CALENDAR_PROVIDERS.find(
                (p) => p.value === connection.provider
              );
              return (
                <div
                  key={connection.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${provider?.color}20` }}
                      >
                        <Calendar
                          className="h-5 w-5"
                          style={{ color: provider?.color }}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {connection.calendar_name || provider?.label}
                          </span>
                          {connection.is_primary && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {provider?.label}
                          {connection.last_synced_at && (
                            <span className="ml-2">
                              · Last synced{" "}
                              {new Date(connection.last_synced_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!connection.is_primary && (
                        <button
                          onClick={() => setPrimaryCalendar(connection.id)}
                          className="p-2 text-gray-400 hover:text-yellow-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                          title="Set as primary"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => syncCalendar(connection.id)}
                        disabled={syncing === connection.id}
                        className="p-2 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        title="Sync now"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${syncing === connection.id ? "animate-spin" : ""}`}
                        />
                      </button>
                      <button
                        onClick={() => disconnectCalendar(connection.id)}
                        className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Disconnect"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {connection.sync_enabled && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <Check className="h-4 w-4" />
                      <span>Automatic sync enabled</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Connect New Calendar */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {connections.length > 0 ? "Connect Another Calendar" : "Connect a Calendar"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CALENDAR_PROVIDERS.map((provider) => {
            const isConnected = connectedProviders.includes(provider.value);
            const isConnecting = connecting === provider.value;

            return (
              <button
                key={provider.value}
                onClick={() => !isConnected && connectCalendar(provider.value)}
                disabled={isConnected || isConnecting}
                className={`p-6 rounded-lg border-2 text-left transition-all ${
                  isConnected
                    ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 cursor-not-allowed"
                    : "border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-gray-800"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${provider.color}20` }}
                  >
                    <Calendar
                      className="h-6 w-6"
                      style={{ color: provider.color }}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {provider.label}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {isConnected
                        ? "Connected"
                        : `Connect your ${provider.label} account`}
                    </div>
                  </div>
                  {isConnected ? (
                    <Check className="h-5 w-5 text-green-500" />
                  ) : isConnecting ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  ) : (
                    <Plus className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-300">
              How calendar sync works
            </h3>
            <ul className="mt-2 text-sm text-blue-700 dark:text-blue-400 space-y-1">
              <li>
                • Events from connected calendars are used to check for scheduling
                conflicts
              </li>
              <li>
                • When someone books a meeting, an event is automatically created in
                your primary calendar
              </li>
              <li>
                • Calendar data is synced every 5 minutes or when you manually sync
              </li>
              <li>
                • Your calendar data is kept private and never shared with invitees
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
