"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Settings,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  X,
  Plug,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMProviders } from "@/hooks/useGTMProviders";
import { GTMProviderConfig, GTMProviderStatus } from "@/lib/api";

const SLOT_LABELS: Record<string, string> = {
  visitor_identification: "Visitor Identification",
  email_verification: "Email Verification",
  contact_enrichment: "Contact Enrichment",
  linkedin_automation: "LinkedIn Automation",
  sms: "SMS",
  intent_data: "Intent Data",
  seo_tracking: "SEO Tracking",
  ad_platform: "Ad Platform",
  analytics: "Analytics",
  data_warehouse: "Data Warehouse",
};

const SLOT_RECOMMENDATIONS: Record<string, string> = {
  visitor_identification: "Snitcher",
  email_verification: "MillionVerifier",
  contact_enrichment: "Apollo",
  linkedin_automation: "PhantomBuster",
  sms: "Twilio",
  intent_data: "Bombora",
  seo_tracking: "Ahrefs",
  ad_platform: "Google Ads",
  analytics: "Mixpanel",
  data_warehouse: "BigQuery",
};

const SLOT_DESCRIPTIONS: Record<string, string> = {
  visitor_identification:
    "Identify anonymous website visitors by resolving IP addresses to company data.",
  email_verification:
    "Verify email deliverability and reduce bounce rates before outreach.",
  contact_enrichment:
    "Enrich contact records with job titles, social profiles, and direct dials.",
  linkedin_automation:
    "Automate LinkedIn connection requests, messages, and profile visits.",
  sms: "Send SMS messages for outreach and notifications.",
  intent_data:
    "Track buyer intent signals across the web to prioritize high-intent accounts.",
  seo_tracking:
    "Monitor search rankings, keywords, and organic traffic for SEO optimization.",
  ad_platform:
    "Integrate with advertising platforms for retargeting and campaign tracking.",
  analytics:
    "Product analytics and user behavior tracking for conversion optimization.",
  data_warehouse:
    "Export GTM data to a data warehouse for advanced analysis and reporting.",
};

function StatusBadge({ status }: { status: GTMProviderStatus }) {
  const config: Record<
    string,
    { icon: React.ReactNode; label: string; className: string }
  > = {
    active: {
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      label: "Active",
      className: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    },
    inactive: {
      icon: <XCircle className="w-3.5 h-3.5" />,
      label: "Inactive",
      className: "bg-zinc-500/20 text-muted-foreground border-zinc-500/30",
    },
    error: {
      icon: <AlertCircle className="w-3.5 h-3.5" />,
      label: "Error",
      className: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
    },
    pending_setup: {
      icon: <Clock className="w-3.5 h-3.5" />,
      label: "Pending Setup",
      className: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
    },
  };

  const { icon, label, className } = config[status] || config.inactive;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

interface ConfigureModalProps {
  slot: string;
  existingProvider: GTMProviderConfig | null;
  onClose: () => void;
  onSave: (providerName: string, apiKey: string) => Promise<void>;
  onTestCredentials: (slot: string, providerName: string, credentials: Record<string, string>) => Promise<{ success: boolean; message: string }>;
  isSaving: boolean;
  isTesting: boolean;
}

function ConfigureModal({
  slot,
  existingProvider,
  onClose,
  onSave,
  onTestCredentials,
  isSaving,
  isTesting,
}: ConfigureModalProps) {
  const [providerName, setProviderName] = useState(
    existingProvider?.provider_name || ""
  );
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const hasExistingKey = !!existingProvider;

  async function handleTest() {
    if (!providerName || !apiKey) return;
    setTestResult(null);
    try {
      const result = await onTestCredentials(slot, providerName, { api_key: apiKey });
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    }
  }

  async function handleSave() {
    await onSave(providerName, apiKey);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-background border border-border rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Configure {SLOT_LABELS[slot] || slot}
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {SLOT_DESCRIPTIONS[slot] || "Configure this provider slot."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Recommendation */}
          {SLOT_RECOMMENDATIONS[slot] && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
              <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span className="text-indigo-300 text-sm">
                Recommended: {SLOT_RECOMMENDATIONS[slot]}
              </span>
            </div>
          )}

          {/* Provider Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Provider Name
            </label>
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder={SLOT_RECOMMENDATIONS[slot] || "Provider name"}
              className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-colors text-sm"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasExistingKey
                    ? "API key is set (enter new to replace)"
                    : "Enter API key"
                }
                className="w-full px-3 py-2.5 pr-10 bg-muted/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showApiKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Test Result */}
          {testResult !== null && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                testResult.success
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : "bg-red-500/10 border-red-500/20"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span
                className={`text-sm ${
                  testResult.success ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {testResult.message}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={handleTest}
            disabled={!providerName || !apiKey || isTesting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plug className="w-4 h-4" />
            )}
            Test Connection
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={
                !providerName || (!apiKey && !hasExistingKey) || isSaving
              }
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GTMProvidersPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const {
    providers,
    isLoading,
    error,
    refetch,
    createProvider,
    updateProvider,
    testCredentials,
    isCreating,
    isTesting,
  } = useGTMProviders(workspaceId);

  const [configuringSlot, setConfiguringSlot] = useState<string | null>(null);

  const ALL_SLOTS = Object.keys(SLOT_LABELS);

  function getProviderForSlot(slot: string): GTMProviderConfig | null {
    return providers.find((p) => p.slot === slot) || null;
  }

  async function handleSave(providerName: string, apiKey: string) {
    if (!configuringSlot) return;
    const existing = getProviderForSlot(configuringSlot);

    if (existing) {
      await updateProvider({
        slot: existing.slot,
        name: existing.provider_name,
        data: {
          credentials: apiKey ? { api_key: apiKey } : undefined,
          display_name: providerName,
        },
      });
    } else {
      await createProvider({
        slot: configuringSlot as GTMProviderConfig["slot"],
        provider_name: providerName,
        credentials: { api_key: apiKey },
      });
    }
  }

  async function handleTestCredentials(slot: string, providerName: string, credentials: Record<string, string>) {
    return testCredentials({ slot, providerName, credentials });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-muted-foreground text-sm">Loading providers...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-muted/50 border border-red-500/20 rounded-xl p-8 max-w-md text-center">
          <p className="text-red-400 font-medium mb-2">
            Failed to load providers
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            {(error as Error).message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-border hover:bg-accent text-foreground rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/gtm"
              className="flex items-center justify-center w-9 h-9 bg-muted/50 hover:bg-muted border border-border rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                <Settings className="w-7 h-7 text-indigo-400" />
                Provider Settings
              </h1>
              <p className="text-muted-foreground mt-1">
                Configure the data providers that power your GTM pipeline.
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Provider Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ALL_SLOTS.map((slot) => {
            const provider = getProviderForSlot(slot);
            const status: GTMProviderStatus = provider
              ? provider.status
              : "pending_setup";

            return (
              <div
                key={slot}
                className="bg-muted/50 border border-border rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-border/80 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-foreground font-semibold text-sm">
                      {SLOT_LABELS[slot]}
                    </h3>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-muted-foreground text-xs mb-3 leading-relaxed">
                    {SLOT_DESCRIPTIONS[slot]}
                  </p>
                  {provider ? (
                    <div className="flex items-center gap-2">
                      <Plug className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-foreground text-sm">
                        {provider.display_name || provider.provider_name}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm italic">
                        No provider configured
                      </span>
                      {SLOT_RECOMMENDATIONS[slot] && (
                        <span className="text-indigo-400/60 text-xs">
                          (try {SLOT_RECOMMENDATIONS[slot]})
                        </span>
                      )}
                    </div>
                  )}
                  {provider?.last_used_at && (
                    <p className="text-muted-foreground text-xs mt-2">
                      Last used:{" "}
                      {new Date(provider.last_used_at).toLocaleDateString()}
                    </p>
                  )}
                  {provider?.error_message && (
                    <p className="text-red-400/80 text-xs mt-2">
                      {provider.error_message}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setConfiguringSlot(slot)}
                  className="w-full px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm font-medium transition-colors"
                >
                  Configure
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Configure Modal */}
      {configuringSlot && (
        <ConfigureModal
          slot={configuringSlot}
          existingProvider={getProviderForSlot(configuringSlot)}
          onClose={() => setConfiguringSlot(null)}
          onSave={handleSave}
          onTestCredentials={handleTestCredentials}
          isSaving={isCreating}
          isTesting={isTesting}
        />
      )}
    </div>
  );
}
