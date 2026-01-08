"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Mail,
  Calendar,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Settings,
  Trash2,
  AlertCircle,
  Sparkles,
  Users,
  Building2,
  Clock,
  Shield,
} from "lucide-react";
import { motion } from "framer-motion";
import { useWorkspace } from "@/hooks/useWorkspace";
import { googleIntegrationApi, developerApi, GoogleIntegrationStatus } from "@/lib/api";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function IntegrationsSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<{ gmail?: string; calendar?: string } | null>(null);

  // Check for callback status
  useEffect(() => {
    const googleStatus = searchParams.get("google");
    if (googleStatus === "connected") {
      setSyncResult({ gmail: "Connected successfully!" });
    } else if (googleStatus === "error") {
      const message = searchParams.get("message") || "Connection failed";
      setSyncResult({ gmail: `Error: ${message}` });
    }
  }, [searchParams]);

  // Fetch status
  useEffect(() => {
    const fetchStatus = async () => {
      if (!workspaceId) return;
      try {
        // First check workspace-level status
        let data = await googleIntegrationApi.getStatus(workspaceId);

        // If not connected at workspace level, check developer level and auto-link
        if (!data.is_connected) {
          try {
            const developerStatus = await developerApi.getGoogleStatus();
            if (developerStatus.is_connected) {
              // Auto-link developer's Google to workspace
              await googleIntegrationApi.connectFromDeveloper(workspaceId);
              data = await googleIntegrationApi.getStatus(workspaceId);
            }
          } catch {
            // Continue with workspace-only status
          }
        }

        setStatus(data);
      } catch {
        setStatus(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, [workspaceId]);

  const handleConnect = async () => {
    if (!workspaceId) return;
    try {
      const { auth_url } = await googleIntegrationApi.getConnectUrl(workspaceId, window.location.href);
      window.location.href = auth_url;
    } catch (error) {
      console.error("Failed to get connect URL:", error);
    }
  };

  const handleDisconnect = async () => {
    if (!workspaceId || !confirm("Are you sure you want to disconnect Google integration? All synced data will be removed.")) return;
    setIsDisconnecting(true);
    try {
      await googleIntegrationApi.disconnect(workspaceId);
      setStatus(null);
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleGmailSync = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await googleIntegrationApi.gmail.sync(workspaceId, { full_sync: false });
      setSyncResult({ gmail: `Synced ${result.messages_synced} emails` });
      // Refresh status
      const newStatus = await googleIntegrationApi.getStatus(workspaceId);
      setStatus(newStatus);
    } catch (error) {
      setSyncResult({ gmail: "Sync failed" });
      console.error("Gmail sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCalendarSync = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await googleIntegrationApi.calendar.sync(workspaceId);
      setSyncResult({ calendar: `Synced ${result.events_synced} events` });
      // Refresh status
      const newStatus = await googleIntegrationApi.getStatus(workspaceId);
      setStatus(newStatus);
    } catch (error) {
      setSyncResult({ calendar: "Sync failed" });
      console.error("Calendar sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateSettings = async (settings: { gmail_sync_enabled?: boolean; calendar_sync_enabled?: boolean }) => {
    if (!workspaceId) return;
    try {
      const newStatus = await googleIntegrationApi.updateSettings(workspaceId, settings);
      setStatus(newStatus);
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  const handleEnrichContacts = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await googleIntegrationApi.enrichContacts(workspaceId);
      setSyncResult({
        gmail: `Processed ${result.emails_processed} emails, created ${result.contacts_created} contacts`,
      });
    } catch (error) {
      setSyncResult({ gmail: "Enrichment failed" });
      console.error("Contact enrichment failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-12 bg-slate-800 rounded-xl w-48" />
            <div className="h-64 bg-slate-800 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/crm/settings")}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Settings
          </button>
          <h1 className="text-2xl font-bold text-white">Integrations</h1>
          <p className="text-slate-400 mt-1">Connect external services to enhance your CRM</p>
        </div>

        {/* Google Integration Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-lg">
                  <GoogleIcon className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Google Integration</h2>
                  <p className="text-slate-400">Gmail & Calendar sync for CRM</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status?.is_connected ? (
                  <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-700/50 border border-slate-600 text-slate-400 text-sm">
                    <XCircle className="w-4 h-4" />
                    Not connected
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Connection status */}
          {status?.is_connected ? (
            <>
              {/* Connected email */}
              <div className="p-6 border-b border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-white font-medium">{status.google_email}</p>
                      <p className="text-sm text-slate-500">Connected Google account</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              </div>

              {/* Sync options */}
              <div className="p-6 space-y-6">
                {/* Gmail Sync */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">Gmail Sync</h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Sync emails to populate contacts and track communication
                      </p>
                      {status.gmail_last_sync_at && (
                        <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last synced: {new Date(status.gmail_last_sync_at).toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {status.messages_synced} messages synced
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleGmailSync}
                      disabled={isSyncing || !status.gmail_sync_enabled}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                      Sync Now
                    </button>
                    <button
                      onClick={() => handleUpdateSettings({ gmail_sync_enabled: !status.gmail_sync_enabled })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        status.gmail_sync_enabled ? "bg-purple-500" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          status.gmail_sync_enabled ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Calendar Sync */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-green-500/10 text-green-400">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">Calendar Sync</h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Sync events to track meetings with contacts
                      </p>
                      {status.calendar_last_sync_at && (
                        <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last synced: {new Date(status.calendar_last_sync_at).toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {status.events_synced} events synced
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleCalendarSync}
                      disabled={isSyncing || !status.calendar_sync_enabled}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                      Sync Now
                    </button>
                    <button
                      onClick={() => handleUpdateSettings({ calendar_sync_enabled: !status.calendar_sync_enabled })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        status.calendar_sync_enabled ? "bg-purple-500" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          status.calendar_sync_enabled ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* AI Enrichment */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">AI Contact Enrichment</h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Extract contact details from email signatures using AI
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleEnrichContacts}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    Run Enrichment
                  </button>
                </div>

                {/* Sync result message */}
                {syncResult && (
                  <div className="mt-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div className="flex items-center gap-2">
                      {syncResult.gmail?.includes("Error") || syncResult.calendar?.includes("failed") ? (
                        <AlertCircle className="w-5 h-5 text-red-400" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      )}
                      <span className="text-sm text-slate-300">
                        {syncResult.gmail || syncResult.calendar}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Error display */}
              {status.last_error && (
                <div className="px-6 pb-6">
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-400">Last Sync Error</p>
                        <p className="text-sm text-red-300/70 mt-1">{status.last_error}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Not connected state */
            <div className="p-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-6">
                <GoogleIcon className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Connect Google</h3>
              <p className="text-slate-400 mb-6 max-w-md mx-auto">
                Sync your Gmail and Calendar to automatically populate your CRM with contacts,
                emails, and meetings.
              </p>

              <button
                onClick={handleConnect}
                className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-white text-slate-900 font-medium hover:bg-slate-100 transition-all shadow-lg"
              >
                <GoogleIcon className="w-5 h-5" />
                Connect with Google
              </button>

              <div className="mt-8 text-left max-w-md mx-auto">
                <p className="text-sm text-slate-400 flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4" />
                  Your data is secure
                </p>
                <ul className="space-y-2 text-xs text-slate-500">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                    We only read email metadata and signatures
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                    Your data stays in your workspace
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                    You can disconnect anytime
                  </li>
                </ul>
              </div>
            </div>
          )}
        </motion.div>

        {/* Quick Links */}
        {status?.is_connected && (
          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            <button
              onClick={() => router.push("/crm/inbox")}
              className="flex items-center gap-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:border-slate-600 transition-colors text-left"
            >
              <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-medium text-white">View Inbox</h3>
                <p className="text-sm text-slate-400">Browse synced emails</p>
              </div>
            </button>
            <button
              onClick={() => router.push("/crm/person")}
              className="flex items-center gap-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:border-slate-600 transition-colors text-left"
            >
              <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-medium text-white">View People</h3>
                <p className="text-sm text-slate-400">See auto-created contacts</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
