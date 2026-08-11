"use client";

/**
 * CRM integrations — Google (Gmail + Calendar) sync and the deal-creation rules
 * that hang off it.
 *
 * This used to be a section of `/crm/settings`, reachable through that page's own
 * left-hand section switcher, plus a `/crm/settings/integrations` route that did
 * nothing but `router.replace("/crm/settings?section=integrations")`. Both are
 * gone: the section switcher was a second navigation tree sitting inside the
 * Settings shell's own, and the redirect existed only to paper over the fact that
 * the section had no URL of its own. It has one now.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Filter,
  Mail,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  DealCreationSettings,
  developerApi,
  googleIntegrationApi,
  GoogleIntegrationStatus,
} from "@/lib/api";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";
import { GmailExclusions } from "@/components/settings/GmailExclusions";
import { GoogleAccounts } from "@/components/settings/GoogleAccounts";
import {
  SettingsEmptyState,
  SettingsPage,
  SettingsSkeleton,
} from "@/components/settings/SettingsPrimitives";

const DEFAULT_DEAL_SETTINGS: DealCreationSettings = {
  auto_create_deals: false,
  deal_creation_mode: "auto",
  skip_personal_domains: true,
  default_deal_stage: "new",
  default_deal_value: null,
  criteria: {
    subject_keywords: [],
    body_keywords: [],
    from_domains: [],
  },
};

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

function IntegrationsTab({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  // Bumped after a disconnect so the sync panels below re-read status.
  const [accountsVersion, setAccountsVersion] = useState(0);
  const [syncResult, setSyncResult] = useState<{ gmail?: string; calendar?: string } | null>(null);
  const [dealSettings, setDealSettings] = useState<DealCreationSettings>(DEFAULT_DEAL_SETTINGS);
  const [showDealSettings, setShowDealSettings] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [customIntervalInput, setCustomIntervalInput] = useState<string>("");
  const [customCalendarIntervalInput, setCustomCalendarIntervalInput] = useState<string>("");
  const skipDebounceRef = useRef(false);
  const skipCalendarDebounceRef = useRef(false);

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
        let data = await googleIntegrationApi.getStatus(workspaceId);

        if (!data.is_connected) {
          try {
            const developerStatus = await developerApi.getGoogleStatus();
            if (developerStatus.is_connected) {
              await googleIntegrationApi.connectFromDeveloper(workspaceId);
              data = await googleIntegrationApi.getStatus(workspaceId);
            }
          } catch {
            // Continue with workspace-only status
          }
        }

        setStatus(data);
        setCustomIntervalInput(String(data.auto_sync_interval_minutes || 0));
        setCustomCalendarIntervalInput(String(data.auto_sync_calendar_interval_minutes || 0));
        if (data.sync_settings?.deal_settings) {
          setDealSettings({ ...DEFAULT_DEAL_SETTINGS, ...data.sync_settings.deal_settings });
        }
      } catch {
        setStatus(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, [workspaceId]);

  // Minimum interval in minutes when enabled (to prevent aggressive syncing)
  const MIN_SYNC_INTERVAL = 5;

  // Debounce custom Gmail interval input
  useEffect(() => {
    if (!status) return;
    if (skipDebounceRef.current) {
      skipDebounceRef.current = false;
      return;
    }
    let value = parseInt(customIntervalInput) || 0;
    // Enforce minimum interval when enabled (not 0)
    if (value > 0 && value < MIN_SYNC_INTERVAL) {
      value = MIN_SYNC_INTERVAL;
      setCustomIntervalInput(String(value));
    }
    if (value < 0 || value === status.auto_sync_interval_minutes) return;

    const timeoutId = setTimeout(() => {
      handleUpdateSettings({ auto_sync_interval_minutes: value });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [customIntervalInput]);

  // Debounce custom Calendar interval input
  useEffect(() => {
    if (!status) return;
    if (skipCalendarDebounceRef.current) {
      skipCalendarDebounceRef.current = false;
      return;
    }
    let value = parseInt(customCalendarIntervalInput) || 0;
    // Enforce minimum interval when enabled (not 0)
    if (value > 0 && value < MIN_SYNC_INTERVAL) {
      value = MIN_SYNC_INTERVAL;
      setCustomCalendarIntervalInput(String(value));
    }
    if (value < 0 || value === status.auto_sync_calendar_interval_minutes) return;

    const timeoutId = setTimeout(() => {
      handleUpdateSettings({ auto_sync_calendar_interval_minutes: value });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [customCalendarIntervalInput]);

  const handleConnect = async () => {
    if (!workspaceId) return;
    try {
      const { auth_url } = await googleIntegrationApi.getConnectUrl(workspaceId, window.location.href);
      window.location.href = auth_url;
    } catch (error) {
      console.error("Failed to get connect URL:", error);
    }
  };


  const handleGmailSync = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await googleIntegrationApi.gmail.sync(workspaceId, { full_sync: false });
      setSyncResult({ gmail: `Synced ${result.messages_synced} emails` });
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
      const newStatus = await googleIntegrationApi.getStatus(workspaceId);
      setStatus(newStatus);
    } catch (error) {
      setSyncResult({ calendar: "Sync failed" });
      console.error("Calendar sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateSettings = async (settings: { gmail_sync_enabled?: boolean; calendar_sync_enabled?: boolean; auto_sync_interval_minutes?: number; auto_sync_calendar_interval_minutes?: number; }) => {
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

  const handleUpdateDealSettings = async (newSettings: Partial<DealCreationSettings>) => {
    if (!workspaceId) return;
    const updatedSettings = { ...dealSettings, ...newSettings };
    setDealSettings(updatedSettings);
    try {
      const newStatus = await googleIntegrationApi.updateSettings(workspaceId, {
        sync_settings: {
          ...status?.sync_settings,
          deal_settings: updatedSettings,
        },
      });
      setStatus(newStatus);
    } catch (error) {
      console.error("Failed to update deal settings:", error);
      setDealSettings(dealSettings);
    }
  };

  const addSubjectKeyword = () => {
    if (!newKeyword.trim()) return;
    const keywords = [...dealSettings.criteria.subject_keywords, newKeyword.trim().toLowerCase()];
    handleUpdateDealSettings({
      criteria: { ...dealSettings.criteria, subject_keywords: keywords },
    });
    setNewKeyword("");
  };

  const removeSubjectKeyword = (keyword: string) => {
    const keywords = dealSettings.criteria.subject_keywords.filter((k) => k !== keyword);
    handleUpdateDealSettings({
      criteria: { ...dealSettings.criteria, subject_keywords: keywords },
    });
  };

  const addDomain = () => {
    if (!newDomain.trim()) return;
    const domains = [...dealSettings.criteria.from_domains, newDomain.trim().toLowerCase()];
    handleUpdateDealSettings({
      criteria: { ...dealSettings.criteria, from_domains: domains },
    });
    setNewDomain("");
  };

  const removeDomain = (domain: string) => {
    const domains = dealSettings.criteria.from_domains.filter((d) => d !== domain);
    handleUpdateDealSettings({
      criteria: { ...dealSettings.criteria, from_domains: domains },
    });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-32 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Google Integration Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-lg">
                <GoogleIcon className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Google Integration</h2>
                <p className="text-muted-foreground">Gmail & Calendar sync for CRM</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {status?.is_connected ? (
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/50 border border-border text-muted-foreground text-sm">
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
            {/* Connected accounts. A list rather than one line, because a
                workspace holds one Google account per address — several people
                can each sync their own mailbox, and a shared desk address is
                its own entry again. */}
            <div className="p-6 border-b border-border/50">
              <div className="flex items-center gap-3 mb-3">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Connected Google accounts
                </p>
              </div>
              <GoogleAccounts
                key={accountsVersion}
                workspaceId={workspaceId}
                onConnectAnother={handleConnect}
                onChanged={() => setAccountsVersion((v) => v + 1)}
              />
            </div>

            {/* Sync options */}
            <div className="p-6 space-y-6">
              {/* Gmail Sync */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">Gmail Sync</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Sync emails to populate contacts and track communication
                    </p>
                    {status.gmail_last_sync_at && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last synced: {new Date(status.gmail_last_sync_at).toLocaleString()}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {status.messages_synced} messages synced
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGmailSync}
                    disabled={isSyncing || !status.gmail_sync_enabled}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent hover:bg-accent disabled:opacity-50 text-foreground rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                    Sync Now
                  </button>
                  <button
                    onClick={() => handleUpdateSettings({ gmail_sync_enabled: !status.gmail_sync_enabled })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      status.gmail_sync_enabled ? "bg-purple-500" : "bg-accent"
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

              {/* What this mailbox keeps out. Directly under the Gmail Sync
                  toggle because the moment somebody turns sync on is the
                  moment they need to know they can keep parts of it out. */}
              {status.gmail_sync_enabled && (
                <GmailExclusions
                  workspaceId={workspaceId}
                  connectedEmail={status.google_email}
                />
              )}

              {/* Auto-Sync Interval */}
              {status.gmail_sync_enabled && (
                <div className="ml-14 pl-4 border-l-2 border-border space-y-3">
                  <div>
                    <h4 className="font-medium text-foreground text-sm">Auto-Sync Schedule</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Automatically sync emails at a regular interval (minimum 5 minutes)
                    </p>
                  </div>

                  {/* Quick preset buttons */}
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 0, label: "Off" },
                      { value: 5, label: "5m" },
                      { value: 15, label: "15m" },
                      { value: 30, label: "30m" },
                      { value: 60, label: "1h" },
                      { value: 1440, label: "24h" },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => {
                          skipDebounceRef.current = true;
                          setCustomIntervalInput(String(preset.value));
                          handleUpdateSettings({ auto_sync_interval_minutes: preset.value });
                        }}
                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                          status.auto_sync_interval_minutes === preset.value
                            ? "bg-blue-500 text-white"
                            : "bg-accent text-foreground hover:bg-accent"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom input */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Or enter custom:</span>
                    <input
                      type="number"
                      min="0"
                      value={customIntervalInput}
                      onChange={(e) => {
                        setCustomIntervalInput(e.target.value);
                      }}
                      className="w-20 px-2 py-1 text-sm bg-accent border border-border text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-muted-foreground">minutes</span>
                  </div>

                  {status.auto_sync_interval_minutes > 0 && (
                    <p className="text-xs text-blue-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Auto-syncing every {status.auto_sync_interval_minutes} minute{status.auto_sync_interval_minutes !== 1 ? 's' : ''}
                      {status.auto_sync_interval_minutes >= 60 && ` (${Math.floor(status.auto_sync_interval_minutes / 60)}h ${status.auto_sync_interval_minutes % 60}m)`}
                    </p>
                  )}
                </div>
              )}

              {/* Calendar Sync */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">Calendar Sync</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Sync events to track meetings with contacts
                    </p>
                    {status.calendar_last_sync_at && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last synced: {new Date(status.calendar_last_sync_at).toLocaleString()}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {status.events_synced} events synced
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCalendarSync}
                    disabled={isSyncing || !status.calendar_sync_enabled}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent hover:bg-accent disabled:opacity-50 text-foreground rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                    Sync Now
                  </button>
                  <button
                    onClick={() => handleUpdateSettings({ calendar_sync_enabled: !status.calendar_sync_enabled })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      status.calendar_sync_enabled ? "bg-purple-500" : "bg-accent"
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

              {/* Calendar Auto-Sync Interval */}
              {status.calendar_sync_enabled && (
                <div className="ml-14 pl-4 border-l-2 border-border space-y-3">
                  <div>
                    <h4 className="font-medium text-foreground text-sm">Auto-Sync Schedule</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Automatically sync calendar events at a regular interval (minimum 5 minutes)
                    </p>
                  </div>

                  {/* Quick preset buttons */}
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 0, label: "Off" },
                      { value: 5, label: "5m" },
                      { value: 15, label: "15m" },
                      { value: 30, label: "30m" },
                      { value: 60, label: "1h" },
                      { value: 1440, label: "24h" },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => {
                          skipCalendarDebounceRef.current = true;
                          setCustomCalendarIntervalInput(String(preset.value));
                          handleUpdateSettings({ auto_sync_calendar_interval_minutes: preset.value });
                        }}
                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                          status.auto_sync_calendar_interval_minutes === preset.value
                            ? "bg-green-500 text-white"
                            : "bg-accent text-foreground hover:bg-accent"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom input */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Or enter custom:</span>
                    <input
                      type="number"
                      min="0"
                      value={customCalendarIntervalInput}
                      onChange={(e) => {
                        setCustomCalendarIntervalInput(e.target.value);
                      }}
                      className="w-20 px-2 py-1 text-sm bg-accent border border-border text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <span className="text-xs text-muted-foreground">minutes</span>
                  </div>

                  {status.auto_sync_calendar_interval_minutes > 0 && (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Auto-syncing every {status.auto_sync_calendar_interval_minutes} minute{status.auto_sync_calendar_interval_minutes !== 1 ? 's' : ''}
                      {status.auto_sync_calendar_interval_minutes >= 60 && ` (${Math.floor(status.auto_sync_calendar_interval_minutes / 60)}h ${status.auto_sync_calendar_interval_minutes % 60}m)`}
                    </p>
                  )}
                </div>
              )}

              {/* AI Enrichment */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">AI Contact Enrichment</h3>
                    <p className="text-sm text-muted-foreground mt-1">
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

              {/* Deal Auto-Creation */}
              <div className="border-t border-border/50 pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">Auto-Create Deals from Emails</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Automatically create deals when new emails are synced
                      </p>
                      {dealSettings.auto_create_deals && (
                        <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          Mode: {dealSettings.deal_creation_mode === "auto" ? "All business emails" :
                                 dealSettings.deal_creation_mode === "ai" ? "AI-detected opportunities" :
                                 "Matching criteria only"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowDealSettings(!showDealSettings)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent hover:bg-accent text-foreground rounded-lg transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Configure
                    </button>
                    <button
                      onClick={() => handleUpdateDealSettings({ auto_create_deals: !dealSettings.auto_create_deals })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        dealSettings.auto_create_deals ? "bg-amber-500" : "bg-accent"
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          dealSettings.auto_create_deals ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Deal Settings Panel */}
                {showDealSettings && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 ml-14 p-4 bg-muted/50 rounded-lg border border-border/50 space-y-4"
                  >
                    {/* Creation Mode */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Deal Creation Mode
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          onClick={() => handleUpdateDealSettings({ deal_creation_mode: "auto" })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            dealSettings.deal_creation_mode === "auto"
                              ? "border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                              : "border-border hover:border-border text-muted-foreground"
                          }`}
                        >
                          <Zap className="w-5 h-5" />
                          <span className="text-xs font-medium">Auto</span>
                          <span className="text-xs text-muted-foreground">All emails</span>
                        </button>
                        <button
                          onClick={() => handleUpdateDealSettings({ deal_creation_mode: "ai" })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            dealSettings.deal_creation_mode === "ai"
                              ? "border-purple-500 bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400"
                              : "border-border hover:border-border text-muted-foreground"
                          }`}
                        >
                          <Bot className="w-5 h-5" />
                          <span className="text-xs font-medium">AI</span>
                          <span className="text-xs text-muted-foreground">Smart detection</span>
                        </button>
                        <button
                          onClick={() => handleUpdateDealSettings({ deal_creation_mode: "criteria" })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            dealSettings.deal_creation_mode === "criteria"
                              ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                              : "border-border hover:border-border text-muted-foreground"
                          }`}
                        >
                          <Filter className="w-5 h-5" />
                          <span className="text-xs font-medium">Criteria</span>
                          <span className="text-xs text-muted-foreground">Rules-based</span>
                        </button>
                      </div>
                    </div>

                    {/* Skip Personal Domains */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Skip personal email domains</p>
                        <p className="text-xs text-muted-foreground">Gmail, Yahoo, Outlook, etc.</p>
                      </div>
                      <button
                        onClick={() => handleUpdateDealSettings({ skip_personal_domains: !dealSettings.skip_personal_domains })}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          dealSettings.skip_personal_domains ? "bg-amber-500" : "bg-accent"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            dealSettings.skip_personal_domains ? "left-5" : "left-0.5"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Default Stage */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Default Deal Stage
                      </label>
                      <input
                        type="text"
                        value={dealSettings.default_deal_stage}
                        onChange={(e) => handleUpdateDealSettings({ default_deal_stage: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-amber-500"
                        placeholder="new"
                      />
                    </div>

                    {/* Criteria Settings */}
                    {dealSettings.deal_creation_mode === "criteria" && (
                      <div className="space-y-4 pt-4 border-t border-border">
                        <p className="text-sm font-medium text-foreground">Filter Criteria</p>

                        {/* Subject Keywords */}
                        <div>
                          <label className="block text-xs text-muted-foreground mb-2">
                            Subject Keywords (creates deal if subject contains any)
                          </label>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={newKeyword}
                              onChange={(e) => setNewKeyword(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addSubjectKeyword()}
                              className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500"
                              placeholder="e.g., quote, proposal, pricing"
                            />
                            <button
                              onClick={addSubjectKeyword}
                              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {dealSettings.criteria.subject_keywords.map((keyword) => (
                              <span
                                key={keyword}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs"
                              >
                                {keyword}
                                <button onClick={() => removeSubjectKeyword(keyword)}>
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* From Domains */}
                        <div>
                          <label className="block text-xs text-muted-foreground mb-2">
                            From Domains (creates deal if sender is from domain)
                          </label>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={newDomain}
                              onChange={(e) => setNewDomain(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addDomain()}
                              className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-green-500"
                              placeholder="e.g., enterprise.com"
                            />
                            <button
                              onClick={addDomain}
                              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {dealSettings.criteria.from_domains.map((domain) => (
                              <span
                                key={domain}
                                className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs"
                              >
                                {domain}
                                <button onClick={() => removeDomain(domain)}>
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Mode descriptions */}
                    <div className="pt-4 border-t border-border">
                      <p className="text-xs text-muted-foreground">
                        {dealSettings.deal_creation_mode === "auto" && (
                          <>
                            <strong>Auto mode:</strong> Creates a deal for every new email from business domains.
                            Existing deals linked to the same company will be updated instead.
                          </>
                        )}
                        {dealSettings.deal_creation_mode === "ai" && (
                          <>
                            <strong>AI mode:</strong> Uses AI to analyze email content and only creates deals
                            for emails that indicate sales opportunities (pricing requests, proposals, demos, etc.)
                          </>
                        )}
                        {dealSettings.deal_creation_mode === "criteria" && (
                          <>
                            <strong>Criteria mode:</strong> Only creates deals when the email matches
                            your specified keywords or domains. Good for high-volume inboxes.
                          </>
                        )}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Sync result message */}
              {syncResult && (
                <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2">
                    {syncResult.gmail?.includes("Error") || syncResult.calendar?.includes("failed") ? (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    )}
                    <span className="text-sm text-foreground">
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
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-6">
              <GoogleIcon className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Connect Google</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
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
              <p className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" />
                Your data is secure
              </p>
              <ul className="space-y-2 text-xs text-muted-foreground">
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
        <div className="grid sm:grid-cols-3 gap-4">
          <button
            onClick={() => router.push("/crm/inbox")}
            className="flex items-center gap-4 p-4 bg-muted/30 border border-border/50 rounded-xl hover:border-border transition-colors text-left"
          >
            <div className="p-3 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">View Inbox</h3>
              <p className="text-sm text-muted-foreground">Browse synced emails</p>
            </div>
          </button>
          <button
            onClick={() => router.push("/crm/person")}
            className="flex items-center gap-4 p-4 bg-muted/30 border border-border/50 rounded-xl hover:border-border transition-colors text-left"
          >
            <div className="p-3 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">View People</h3>
              <p className="text-sm text-muted-foreground">See auto-created contacts</p>
            </div>
          </button>
          <button
            onClick={() => router.push("/crm/deal")}
            className="flex items-center gap-4 p-4 bg-muted/30 border border-border/50 rounded-xl hover:border-border transition-colors text-left"
          >
            <div className="p-3 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">View Deals</h3>
              <p className="text-sm text-muted-foreground">See auto-created deals</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

function CRMIntegrationsContent() {
  const t = useTranslations("settingsCrm");
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  return (
    <SettingsPage
      title={t("integrations.title")}
      description={t("integrations.description")}
      width="wide"
      breadcrumbs={[
        { label: t("breadcrumbRoot"), href: "/settings" },
        { label: t("title"), href: "/settings/crm" },
        { label: t("integrations.title") },
      ]}
    >
      {workspaceId ? (
        <IntegrationsTab workspaceId={workspaceId} />
      ) : (
        <SettingsEmptyState
          icon={<Settings className="h-8 w-8" aria-hidden />}
          title={t("noWorkspace")}
          description={t("noWorkspaceDetail")}
        />
      )}
    </SettingsPage>
  );
}

export default function CRMIntegrationsSettingsPage() {
  return (
    <AppAccessGuard appId="crm">
      <Suspense fallback={<SettingsSkeleton rows={2} />}>
        <CRMIntegrationsContent />
      </Suspense>
    </AppAccessGuard>
  );
}
