"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Globe,
  Zap,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Settings,
  Shield,
  TrendingUp,
  Mail,
  TestTube,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";
import { useSendingDomains, useEmailProviders } from "@/hooks/useEmailMarketing";
import { SendingDomain, EmailProvider } from "@/lib/api";

type TabType = "domains" | "providers";

function DomainCard({
  domain,
  onVerify,
  onPause,
  onResume,
  onStartWarming,
  onDelete,
}: {
  domain: SendingDomain;
  onVerify: () => void;
  onPause: () => void;
  onResume: () => void;
  onStartWarming: () => void;
  onDelete: () => void;
}) {
  const getStatusIcon = () => {
    if (!domain.is_active) return <Pause className="h-4 w-4 text-slate-400" />;
    if (!domain.is_verified) return <AlertCircle className="h-4 w-4 text-amber-400" />;
    if (domain.warming_status === "in_progress") return <TrendingUp className="h-4 w-4 text-amber-400" />;
    if (domain.health_score >= 90) return <CheckCircle className="h-4 w-4 text-emerald-400" />;
    if (domain.health_score >= 70) return <AlertCircle className="h-4 w-4 text-amber-400" />;
    return <XCircle className="h-4 w-4 text-red-400" />;
  };

  const getStatusText = () => {
    if (!domain.is_active) return "Paused";
    if (!domain.is_verified) return "Pending Verification";
    if (domain.warming_status === "in_progress") return `Warming (Day ${domain.warming_day})`;
    if (domain.health_score >= 90) return "Healthy";
    if (domain.health_score >= 70) return "Moderate";
    return "Poor Health";
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Globe className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-white font-medium">{domain.domain}</h3>
            <div className="flex items-center gap-2 mt-1">
              {getStatusIcon()}
              <span className="text-sm text-slate-400">{getStatusText()}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!domain.is_verified && (
            <button
              onClick={onVerify}
              className="p-2 text-amber-400 hover:bg-amber-500/20 rounded-lg transition"
              title="Verify DNS"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          {domain.is_verified && domain.warming_status === "not_started" && (
            <button
              onClick={onStartWarming}
              className="p-2 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition"
              title="Start Warming"
            >
              <TrendingUp className="h-4 w-4" />
            </button>
          )}
          {domain.is_active ? (
            <button
              onClick={onPause}
              className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
              title="Pause"
            >
              <Pause className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onResume}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition"
              title="Resume"
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-slate-800/50 rounded-lg">
          <p className="text-lg font-semibold text-white">{domain.health_score}%</p>
          <p className="text-xs text-slate-500">Health Score</p>
        </div>
        <div className="text-center p-3 bg-slate-800/50 rounded-lg">
          <p className="text-lg font-semibold text-white">{domain.daily_limit.toLocaleString()}</p>
          <p className="text-xs text-slate-500">Daily Limit</p>
        </div>
        <div className="text-center p-3 bg-slate-800/50 rounded-lg">
          <p className="text-lg font-semibold text-white">{domain.today_sent_count?.toLocaleString() || 0}</p>
          <p className="text-xs text-slate-500">Sent Today</p>
        </div>
      </div>

      {!domain.is_verified && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-sm text-amber-400 mb-2">DNS records need verification</p>
          <div className="text-xs text-slate-400 space-y-1">
            <p>Add these DNS records to verify your domain:</p>
            <code className="block p-2 bg-slate-800 rounded mt-2 text-slate-300">
              TXT @ aexy-verification={domain.id?.slice(0, 8)}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  onToggle,
  onTest,
  onDelete,
}: {
  provider: EmailProvider;
  onToggle: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await onTest();
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <Zap className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-white font-medium">{provider.name}</h3>
            <p className="text-sm text-slate-500 capitalize">{provider.provider_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            provider.is_active
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-slate-500/20 text-slate-400"
          }`}>
            {provider.is_active ? "Active" : "Inactive"}
          </span>
          {provider.is_default && (
            <span className="px-2 py-1 bg-sky-500/20 text-sky-400 rounded-full text-xs font-medium">
              Default
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={isTesting}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-slate-300 hover:text-white rounded-lg transition text-sm"
        >
          {isTesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TestTube className="h-4 w-4" />
          )}
          Test Connection
        </button>
        <button
          onClick={onToggle}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            provider.is_active
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
          }`}
        >
          {provider.is_active ? "Disable" : "Enable"}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-slate-400 hover:text-red-400 transition"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function EmailSettingsPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
  const workspaceId = currentWorkspace?.id || null;

  const [activeTab, setActiveTab] = useState<TabType>("domains");
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderType, setNewProviderType] = useState("ses");

  const {
    domains,
    isLoading: domainsLoading,
    error: domainsError,
    refetch: refetchDomains,
    createDomain,
    deleteDomain,
    verifyDomain,
    pauseDomain,
    resumeDomain,
    startWarming,
  } = useSendingDomains(workspaceId);

  const {
    providers,
    isLoading: providersLoading,
    error: providersError,
    refetch: refetchProviders,
    createProvider,
    updateProvider,
    deleteProvider,
    testProvider,
  } = useEmailProviders(workspaceId);

  const handleCreateDomain = async () => {
    if (!newDomain) return;
    try {
      await createDomain({ domain: newDomain });
      setNewDomain("");
      setShowAddDomain(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleCreateProvider = async () => {
    if (!newProviderName) return;
    try {
      await createProvider({
        name: newProviderName,
        provider_type: newProviderType,
        credentials: {},
      });
      setNewProviderName("");
      setShowAddProvider(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteDomain = async (id: string) => {
    if (confirm("Are you sure you want to delete this domain?")) {
      await deleteDomain(id);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (confirm("Are you sure you want to delete this provider?")) {
      await deleteProvider(id);
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen bg-slate-950">
        <AppHeader user={user} logout={logout} />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Workspace Selected</h2>
            <p className="text-slate-400">Please select a workspace to manage email settings.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.push("/settings")}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-500/20 rounded-lg">
                  <Mail className="h-5 w-5 text-sky-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Email Settings</h1>
                  <p className="text-sm text-slate-400">Configure email infrastructure and providers</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-900/50 border border-slate-800 rounded-xl mb-6 w-fit">
            <button
              onClick={() => setActiveTab("domains")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "domains"
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Globe className="h-4 w-4" />
              Sending Domains ({domains.length})
            </button>
            <button
              onClick={() => setActiveTab("providers")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "providers"
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Zap className="h-4 w-4" />
              Providers ({providers.length})
            </button>
          </div>

          {/* Domains Tab */}
          {activeTab === "domains" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-slate-400">
                  Manage your sending domains and warming schedules
                </p>
                <button
                  onClick={() => setShowAddDomain(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition"
                >
                  <Plus className="h-4 w-4" />
                  Add Domain
                </button>
              </div>

              {domainsError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-400">Failed to load domains</p>
                  <button
                    onClick={() => refetchDomains()}
                    className="mt-2 text-sm text-sky-400 hover:text-sky-300"
                  >
                    Try Again
                  </button>
                </div>
              ) : domainsLoading ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
                  <Loader2 className="h-8 w-8 text-slate-500 animate-spin mx-auto" />
                </div>
              ) : domains.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
                  <Globe className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No sending domains</h3>
                  <p className="text-slate-400 mb-4">Add a domain to start sending emails</p>
                  <button
                    onClick={() => setShowAddDomain(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
                  >
                    <Plus className="h-4 w-4" />
                    Add Domain
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {domains.map((domain) => (
                    <DomainCard
                      key={domain.id}
                      domain={domain}
                      onVerify={() => verifyDomain(domain.id)}
                      onPause={() => pauseDomain(domain.id)}
                      onResume={() => resumeDomain(domain.id)}
                      onStartWarming={() => startWarming({ domainId: domain.id })}
                      onDelete={() => handleDeleteDomain(domain.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Providers Tab */}
          {activeTab === "providers" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-slate-400">
                  Configure email service providers for sending
                </p>
                <button
                  onClick={() => setShowAddProvider(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition"
                >
                  <Plus className="h-4 w-4" />
                  Add Provider
                </button>
              </div>

              {providersError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-400">Failed to load providers</p>
                  <button
                    onClick={() => refetchProviders()}
                    className="mt-2 text-sm text-sky-400 hover:text-sky-300"
                  >
                    Try Again
                  </button>
                </div>
              ) : providersLoading ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
                  <Loader2 className="h-8 w-8 text-slate-500 animate-spin mx-auto" />
                </div>
              ) : providers.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
                  <Zap className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No email providers</h3>
                  <p className="text-slate-400 mb-4">Add a provider to start sending emails</p>
                  <button
                    onClick={() => setShowAddProvider(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
                  >
                    <Plus className="h-4 w-4" />
                    Add Provider
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {providers.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onToggle={() => updateProvider({
                        providerId: provider.id,
                        data: { is_active: !provider.is_active }
                      })}
                      onTest={() => testProvider(provider.id)}
                      onDelete={() => handleDeleteProvider(provider.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Domain Modal */}
      {showAddDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-lg font-medium text-white">Add Sending Domain</h3>
            </div>
            <div className="p-4">
              <label className="block text-sm text-slate-400 mb-2">Domain</label>
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="mail.example.com"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-xs text-slate-500 mt-2">
                You'll need to add DNS records to verify ownership
              </p>
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setShowAddDomain(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDomain}
                disabled={!newDomain}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
              >
                Add Domain
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-lg font-medium text-white">Add Email Provider</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Provider Name</label>
                <input
                  type="text"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  placeholder="My SES Provider"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Provider Type</label>
                <select
                  value={newProviderType}
                  onChange={(e) => setNewProviderType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="ses">Amazon SES</option>
                  <option value="sendgrid">SendGrid</option>
                  <option value="mailgun">Mailgun</option>
                  <option value="postmark">Postmark</option>
                  <option value="smtp">SMTP</option>
                </select>
              </div>
              <p className="text-xs text-slate-500">
                You can configure credentials after adding the provider
              </p>
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setShowAddProvider(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProvider}
                disabled={!newProviderName}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
              >
                Add Provider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
