"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  ExternalLink,
  GitBranch,
  Hash,
  Key,
  Link2,
  Loader2,
  MessageSquare,
  MoreVertical,
  RefreshCw,
  Settings,
  Slack,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import {
  useJiraIntegration,
  useLinearIntegration,
  useJiraStatuses,
  useLinearStates,
} from "@/hooks/useIntegrations";
import { useSlackIntegration, useSlackSync, useSlackChannels, useSlackConfiguredChannels } from "@/hooks/useSlackIntegration";
import { useTaskStatuses } from "@/hooks/useTaskConfig";
import { useAuth } from "@/hooks/useAuth";
import { StatusMapping, slackApi } from "@/lib/api";

type TabType = "github" | "jira" | "linear" | "slack";

function ConnectionStatusBadge({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-900/30 text-green-400">
        <CheckCircle className="h-3 w-3" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-400">
      Not Connected
    </span>
  );
}

interface JiraConnectFormProps {
  workspaceId: string;
  onConnect: (data: { site_url: string; user_email: string; api_token: string }) => Promise<unknown>;
  onTest: (data: { site_url: string; user_email: string; api_token: string }) => Promise<unknown>;
  isConnecting: boolean;
  isTesting: boolean;
}

function JiraConnectForm({ onConnect, onTest, isConnecting, isTesting }: JiraConnectFormProps) {
  const [siteUrl, setSiteUrl] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  const handleTest = async () => {
    setError(null);
    setTestSuccess(false);

    if (!siteUrl || !userEmail || !apiToken) {
      setError("All fields are required");
      return;
    }

    try {
      await onTest({ site_url: siteUrl, user_email: userEmail, api_token: apiToken });
      setTestSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    }
  };

  const handleConnect = async () => {
    setError(null);

    if (!siteUrl || !userEmail || !apiToken) {
      setError("All fields are required");
      return;
    }

    try {
      await onConnect({ site_url: siteUrl, user_email: userEmail, api_token: apiToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-slate-400 mb-1">Jira Site URL</label>
        <input
          type="url"
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="https://your-company.atlassian.net"
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-400 mb-1">Email</label>
        <input
          type="email"
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
          placeholder="your-email@company.com"
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-400 mb-1">
          API Token
          <a
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-primary-400 hover:text-primary-300"
          >
            Get token <ExternalLink className="inline h-3 w-3" />
          </a>
        </label>
        <input
          type="password"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          placeholder="Your Jira API token"
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {testSuccess && (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle className="h-4 w-4" />
          Connection successful! You can now connect.
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleTest}
          disabled={isTesting || !siteUrl || !userEmail || !apiToken}
          className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Test Connection
            </>
          )}
        </button>
        <button
          onClick={handleConnect}
          disabled={isConnecting || !testSuccess}
          className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Connect
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface LinearConnectFormProps {
  workspaceId: string;
  onConnect: (data: { api_key: string }) => Promise<unknown>;
  onTest: (data: { api_key: string }) => Promise<unknown>;
  isConnecting: boolean;
  isTesting: boolean;
}

function LinearConnectForm({ onConnect, onTest, isConnecting, isTesting }: LinearConnectFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  const handleTest = async () => {
    setError(null);
    setTestSuccess(false);

    if (!apiKey) {
      setError("API key is required");
      return;
    }

    try {
      await onTest({ api_key: apiKey });
      setTestSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    }
  };

  const handleConnect = async () => {
    setError(null);

    if (!apiKey) {
      setError("API key is required");
      return;
    }

    try {
      await onConnect({ api_key: apiKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-slate-400 mb-1">
          Linear API Key
          <a
            href="https://linear.app/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-primary-400 hover:text-primary-300"
          >
            Get key <ExternalLink className="inline h-3 w-3" />
          </a>
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="lin_api_..."
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
        />
        <p className="text-slate-500 text-xs mt-1">
          Create a personal API key in Linear Settings &gt; API
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {testSuccess && (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle className="h-4 w-4" />
          Connection successful! You can now connect.
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleTest}
          disabled={isTesting || !apiKey}
          className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Test Connection
            </>
          )}
        </button>
        <button
          onClick={handleConnect}
          disabled={isConnecting || !testSuccess}
          className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Connect
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface StatusMappingUIProps {
  remoteStatuses: { id: string; name: string; category: string | null }[];
  workspaceStatuses: { id: string; name: string; slug: string; category: string }[];
  currentMappings: Record<string, string>;
  onUpdate: (mappings: StatusMapping[]) => Promise<unknown>;
  isUpdating: boolean;
  remoteName: string;
}

function StatusMappingUI({
  remoteStatuses,
  workspaceStatuses,
  currentMappings,
  onUpdate,
  isUpdating,
  remoteName,
}: StatusMappingUIProps) {
  const [mappings, setMappings] = useState<Record<string, string>>(currentMappings);
  const [hasChanges, setHasChanges] = useState(false);

  const handleMappingChange = (remoteStatus: string, workspaceSlug: string) => {
    const newMappings = { ...mappings, [remoteStatus]: workspaceSlug };
    setMappings(newMappings);
    setHasChanges(true);
  };

  const handleSave = async () => {
    const statusMappings: StatusMapping[] = Object.entries(mappings).map(([remote, local]) => ({
      remote_status: remote,
      workspace_status_slug: local,
    }));
    await onUpdate(statusMappings);
    setHasChanges(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">Status Mapping</h4>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={isUpdating}
            className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm flex items-center gap-1"
          >
            {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
        )}
      </div>
      <p className="text-slate-500 text-xs">
        Map {remoteName} statuses to your workspace statuses
      </p>

      <div className="space-y-2">
        {remoteStatuses.map((remote) => (
          <div key={remote.id} className="flex items-center gap-3">
            <div className="flex-1 px-3 py-2 bg-slate-700 rounded text-white text-sm">
              {remote.name}
              {remote.category && (
                <span className="ml-2 text-slate-500 text-xs">({remote.category})</span>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
            <select
              value={mappings[remote.name] || ""}
              onChange={(e) => handleMappingChange(remote.name, e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-primary-500"
            >
              <option value="">Select status...</option>
              {workspaceStatuses.map((ws) => (
                <option key={ws.id} value={ws.slug}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {remoteStatuses.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-4">
          No statuses found. Connect to {remoteName} first.
        </p>
      )}
    </div>
  );
}

interface ConnectedIntegrationProps {
  integration: {
    site_url?: string | null;
    user_email?: string | null;
    organization_name?: string | null;
    sync_enabled: boolean;
    last_sync_at?: string | null;
  };
  onDisconnect: () => Promise<unknown>;
  onSync: () => Promise<unknown>;
  onToggleSync: (enabled: boolean) => Promise<unknown>;
  isDisconnecting: boolean;
  isSyncing: boolean;
  isUpdating: boolean;
  type: "jira" | "linear";
}

function ConnectedIntegration({
  integration,
  onDisconnect,
  onSync,
  onToggleSync,
  isDisconnecting,
  isSyncing,
  isUpdating,
  type,
}: ConnectedIntegrationProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleDisconnect = async () => {
    if (confirm(`Are you sure you want to disconnect ${type === "jira" ? "Jira" : "Linear"}?`)) {
      await onDisconnect();
    }
    setShowMenu(false);
  };

  return (
    <div className="bg-slate-700/50 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
            {type === "jira" ? (
              <svg className="h-6 w-6" viewBox="0 0 32 32" fill="#2684FF">
                <path d="M15.967 0.5c-0.6 0-1.167 0.233-1.617 0.683l-12.35 12.35c-0.9 0.9-0.9 2.35 0 3.25l12.35 12.35c0.45 0.45 1.017 0.683 1.617 0.683s1.167-0.233 1.617-0.683l12.35-12.35c0.9-0.9 0.9-2.35 0-3.25l-12.35-12.35c-0.45-0.45-1.017-0.683-1.617-0.683z"/>
              </svg>
            ) : (
              <svg className="h-6 w-6" viewBox="0 0 100 100" fill="#5E6AD2">
                <path d="M50 0C22.4 0 0 22.4 0 50s22.4 50 50 50 50-22.4 50-50S77.6 0 50 0zm24.9 74.9H25.1V25.1h49.8v49.8z"/>
              </svg>
            )}
          </div>
          <div>
            <div className="text-white font-medium">
              {type === "jira" ? integration.site_url : integration.organization_name}
            </div>
            {type === "jira" && (
              <div className="text-slate-400 text-sm">{integration.user_email}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionStatusBadge connected />
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-slate-700 rounded-lg shadow-xl z-20 py-1">
                  <button
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-600 flex items-center gap-2"
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-600 pt-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={integration.sync_enabled}
              onChange={(e) => onToggleSync(e.target.checked)}
              disabled={isUpdating}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-white text-sm">Auto-sync enabled</span>
          </label>
          {integration.last_sync_at && (
            <span className="text-slate-500 text-xs">
              Last synced: {new Date(integration.last_sync_at).toLocaleString()}
            </span>
          )}
        </div>
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm flex items-center gap-2"
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Sync Now
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const { user } = useAuth();
  const {
    currentWorkspace,
    currentWorkspaceId,
    currentWorkspaceLoading,
    hasWorkspaces,
  } = useWorkspace();
  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspaceId);

  const {
    integration: jiraIntegration,
    isLoading: jiraLoading,
    isConnected: jiraConnected,
    createIntegration: createJira,
    testConnection: testJira,
    updateIntegration: updateJira,
    deleteIntegration: deleteJira,
    syncIssues: syncJira,
    isCreating: isCreatingJira,
    isTesting: isTestingJira,
    isUpdating: isUpdatingJira,
    isDeleting: isDeletingJira,
    isSyncing: isSyncingJira,
  } = useJiraIntegration(currentWorkspaceId);

  const {
    integration: linearIntegration,
    isLoading: linearLoading,
    isConnected: linearConnected,
    createIntegration: createLinear,
    testConnection: testLinear,
    updateIntegration: updateLinear,
    deleteIntegration: deleteLinear,
    syncIssues: syncLinear,
    isCreating: isCreatingLinear,
    isTesting: isTestingLinear,
    isUpdating: isUpdatingLinear,
    isDeleting: isDeletingLinear,
    isSyncing: isSyncingLinear,
  } = useLinearIntegration(currentWorkspaceId);

  const { statuses: jiraRemoteStatuses } = useJiraStatuses(currentWorkspaceId, jiraConnected);
  const { states: linearRemoteStates } = useLinearStates(currentWorkspaceId, linearConnected);
  const { statuses: workspaceStatuses } = useTaskStatuses(currentWorkspaceId);

  // Slack Integration
  const {
    integration: slackIntegration,
    isLoading: slackLoading,
    isConnected: slackConnected,
    getInstallUrl: getSlackInstallUrl,
    disconnect: disconnectSlack,
    isDisconnecting: isDisconnectingSlack,
  } = useSlackIntegration(currentWorkspaceId);

  const {
    syncChannels: syncSlackChannels,
    autoMapUsers: autoMapSlackUsers,
    importHistory: importSlackHistory,
    isSyncing: isSyncingSlack,
    isMapping: isMappingSlack,
    isImporting: isImportingSlack,
    mappingResult: slackMappingResult,
  } = useSlackSync(slackIntegration?.id);

  const { data: slackChannelsData, isLoading: isLoadingSlackChannels } = useSlackChannels(slackIntegration?.id);
  const {
    data: slackConfiguredData,
    configureChannel: configureSlackChannel,
    removeChannel: removeSlackChannel,
    isConfiguring: isConfiguringSlack,
  } = useSlackConfiguredChannels(slackIntegration?.id);

  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>("jira");
  const [showSlackChannelModal, setShowSlackChannelModal] = useState(false);
  const [selectedSlackChannel, setSelectedSlackChannel] = useState("");
  const [slackImportDays, setSlackImportDays] = useState(30);

  // Auto-switch to Slack tab when redirected from OAuth
  useEffect(() => {
    if (searchParams.get("slack_installed") === "true") {
      setActiveTab("slack");
    }
  }, [searchParams]);

  const currentMember = workspaceMembers.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

  const isLoading = currentWorkspaceLoading || jiraLoading || linearLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading integrations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-700 rounded-lg">
                <Settings className="h-5 w-5 text-slate-300" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Integrations</h1>
                <p className="text-slate-400 text-sm">
                  Connect external tools to sync issues and tasks
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!hasWorkspaces ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center">
            <Link2 className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No Workspace</h3>
            <p className="text-slate-400 mb-6">
              Create a workspace first to configure integrations.
            </p>
            <Link
              href="/settings/organization"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
            >
              Go to Organization Settings
            </Link>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-slate-800 p-1 rounded-lg w-fit mb-6">
              <button
                onClick={() => setActiveTab("github")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
                  activeTab === "github"
                    ? "bg-primary-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <GitBranch className="h-4 w-4" />
                GitHub
              </button>
              <button
                onClick={() => setActiveTab("jira")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
                  activeTab === "jira"
                    ? "bg-primary-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 32 32" fill="currentColor">
                  <path d="M15.967 0.5c-0.6 0-1.167 0.233-1.617 0.683l-12.35 12.35c-0.9 0.9-0.9 2.35 0 3.25l12.35 12.35c0.45 0.45 1.017 0.683 1.617 0.683s1.167-0.233 1.617-0.683l12.35-12.35c0.9-0.9 0.9-2.35 0-3.25l-12.35-12.35c-0.45-0.45-1.017-0.683-1.617-0.683z"/>
                </svg>
                Jira
                {jiraConnected && <CheckCircle className="h-3 w-3 text-green-400" />}
              </button>
              <button
                onClick={() => setActiveTab("linear")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
                  activeTab === "linear"
                    ? "bg-primary-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 100 100" fill="currentColor">
                  <path d="M50 0C22.4 0 0 22.4 0 50s22.4 50 50 50 50-22.4 50-50S77.6 0 50 0zm24.9 74.9H25.1V25.1h49.8v49.8z"/>
                </svg>
                Linear
                {linearConnected && <CheckCircle className="h-3 w-3 text-green-400" />}
              </button>
              <button
                onClick={() => setActiveTab("slack")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
                  activeTab === "slack"
                    ? "bg-primary-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Slack className="h-4 w-4" />
                Slack
                {slackConnected && <CheckCircle className="h-3 w-3 text-green-400" />}
              </button>
            </div>

            {/* GitHub Tab */}
            {activeTab === "github" && (
              <div className="bg-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center">
                    <GitBranch className="h-6 w-6 text-slate-300" />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-white">GitHub</h2>
                    <p className="text-slate-400 text-sm">
                      GitHub is connected via your account login
                    </p>
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ConnectionStatusBadge connected />
                      <span className="text-slate-400 text-sm">
                        Connected as {user?.name || user?.email}
                      </span>
                    </div>
                    <Link
                      href="/settings/repositories"
                      className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1"
                    >
                      Manage Repositories
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Jira Tab */}
            {activeTab === "jira" && (
              <div className="space-y-6">
                <div className="bg-slate-800 rounded-xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center">
                      <svg className="h-6 w-6" viewBox="0 0 32 32" fill="#2684FF">
                        <path d="M15.967 0.5c-0.6 0-1.167 0.233-1.617 0.683l-12.35 12.35c-0.9 0.9-0.9 2.35 0 3.25l12.35 12.35c0.45 0.45 1.017 0.683 1.617 0.683s1.167-0.233 1.617-0.683l12.35-12.35c0.9-0.9 0.9-2.35 0-3.25l-12.35-12.35c-0.45-0.45-1.017-0.683-1.617-0.683z"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-medium text-white">Jira</h2>
                      <p className="text-slate-400 text-sm">
                        Import and sync issues from Jira
                      </p>
                    </div>
                    <ConnectionStatusBadge connected={jiraConnected} />
                  </div>

                  {!jiraConnected && isAdmin && currentWorkspaceId && (
                    <JiraConnectForm
                      workspaceId={currentWorkspaceId}
                      onConnect={createJira}
                      onTest={testJira}
                      isConnecting={isCreatingJira}
                      isTesting={isTestingJira}
                    />
                  )}

                  {jiraConnected && jiraIntegration && (
                    <ConnectedIntegration
                      integration={jiraIntegration}
                      onDisconnect={deleteJira}
                      onSync={() => syncJira(undefined)}
                      onToggleSync={(enabled) => updateJira({ sync_enabled: enabled })}
                      isDisconnecting={isDeletingJira}
                      isSyncing={isSyncingJira}
                      isUpdating={isUpdatingJira}
                      type="jira"
                    />
                  )}

                  {!isAdmin && !jiraConnected && (
                    <p className="text-slate-500 text-sm">
                      Contact an admin to configure Jira integration.
                    </p>
                  )}
                </div>

                {/* Status Mapping */}
                {jiraConnected && isAdmin && (
                  <div className="bg-slate-800 rounded-xl p-6">
                    <StatusMappingUI
                      remoteStatuses={jiraRemoteStatuses}
                      workspaceStatuses={workspaceStatuses}
                      currentMappings={jiraIntegration?.status_mappings || {}}
                      onUpdate={(mappings) => updateJira({ status_mappings: mappings })}
                      isUpdating={isUpdatingJira}
                      remoteName="Jira"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Linear Tab */}
            {activeTab === "linear" && (
              <div className="space-y-6">
                <div className="bg-slate-800 rounded-xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center">
                      <svg className="h-6 w-6" viewBox="0 0 100 100" fill="#5E6AD2">
                        <path d="M50 0C22.4 0 0 22.4 0 50s22.4 50 50 50 50-22.4 50-50S77.6 0 50 0zm24.9 74.9H25.1V25.1h49.8v49.8z"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-medium text-white">Linear</h2>
                      <p className="text-slate-400 text-sm">
                        Import and sync issues from Linear
                      </p>
                    </div>
                    <ConnectionStatusBadge connected={linearConnected} />
                  </div>

                  {!linearConnected && isAdmin && currentWorkspaceId && (
                    <LinearConnectForm
                      workspaceId={currentWorkspaceId}
                      onConnect={createLinear}
                      onTest={testLinear}
                      isConnecting={isCreatingLinear}
                      isTesting={isTestingLinear}
                    />
                  )}

                  {linearConnected && linearIntegration && (
                    <ConnectedIntegration
                      integration={linearIntegration}
                      onDisconnect={deleteLinear}
                      onSync={() => syncLinear(undefined)}
                      onToggleSync={(enabled) => updateLinear({ sync_enabled: enabled })}
                      isDisconnecting={isDeletingLinear}
                      isSyncing={isSyncingLinear}
                      isUpdating={isUpdatingLinear}
                      type="linear"
                    />
                  )}

                  {!isAdmin && !linearConnected && (
                    <p className="text-slate-500 text-sm">
                      Contact an admin to configure Linear integration.
                    </p>
                  )}
                </div>

                {/* Status Mapping */}
                {linearConnected && isAdmin && (
                  <div className="bg-slate-800 rounded-xl p-6">
                    <StatusMappingUI
                      remoteStatuses={linearRemoteStates}
                      workspaceStatuses={workspaceStatuses}
                      currentMappings={linearIntegration?.status_mappings || {}}
                      onUpdate={(mappings) => updateLinear({ status_mappings: mappings })}
                      isUpdating={isUpdatingLinear}
                      remoteName="Linear"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Slack Tab */}
            {activeTab === "slack" && (
              <div className="space-y-6">
                <div className="bg-slate-800 rounded-xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center">
                      <Slack className="h-6 w-6 text-[#E01E5A]" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-medium text-white">Slack</h2>
                      <p className="text-slate-400 text-sm">
                        Connect Slack for standups, blockers, and team updates
                      </p>
                    </div>
                    <ConnectionStatusBadge connected={slackConnected} />
                  </div>

                  {!slackConnected && isAdmin && currentWorkspaceId && user && (
                    <div className="space-y-4">
                      <p className="text-slate-400 text-sm">
                        Connect your Slack workspace to enable slash commands for standups,
                        task updates, and blocker reporting directly from Slack.
                      </p>
                      <a
                        href={getSlackInstallUrl(user.id) || "#"}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#4A154B] hover:bg-[#611f64] text-white rounded-lg transition font-medium"
                      >
                        <Slack className="h-5 w-5" />
                        Add to Slack
                      </a>
                    </div>
                  )}

                  {slackConnected && slackIntegration && (
                    <div className="bg-slate-700/50 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
                            <Slack className="h-6 w-6 text-[#E01E5A]" />
                          </div>
                          <div>
                            <div className="text-white font-medium">
                              {slackIntegration.workspace_name || "Slack Workspace"}
                            </div>
                            <div className="text-slate-400 text-sm">
                              Team: {slackIntegration.team_id}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => disconnectSlack()}
                          disabled={isDisconnectingSlack}
                          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition text-sm flex items-center gap-2"
                        >
                          {isDisconnectingSlack ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Disconnect
                        </button>
                      </div>

                      <div className="flex items-center gap-3 pt-3 border-t border-slate-600">
                        <button
                          onClick={() => syncSlackChannels()}
                          disabled={isSyncingSlack}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm flex items-center gap-2"
                        >
                          {isSyncingSlack ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Sync Channels
                        </button>
                        <button
                          onClick={() => autoMapSlackUsers()}
                          disabled={isMappingSlack}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm flex items-center gap-2"
                        >
                          {isMappingSlack ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Users className="h-4 w-4" />
                          )}
                          Auto-Map Users
                        </button>
                      </div>

                      {slackMappingResult && (
                        <div className="text-green-400 text-sm flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Mapped {slackMappingResult.mapped_count || 0} users
                        </div>
                      )}
                    </div>
                  )}

                  {!isAdmin && !slackConnected && (
                    <p className="text-slate-500 text-sm">
                      Contact an admin to configure Slack integration.
                    </p>
                  )}
                </div>

                {/* Channel Configuration */}
                {slackConnected && slackIntegration && isAdmin && (
                  <div className="bg-slate-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-white font-medium">Configured Channels</h3>
                        <p className="text-slate-400 text-sm">
                          Select channels to monitor for standups and task updates
                        </p>
                      </div>
                      <button
                        onClick={() => setShowSlackChannelModal(true)}
                        className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm flex items-center gap-2"
                      >
                        <Hash className="h-4 w-4" />
                        Add Channel
                      </button>
                    </div>

                    {slackConfiguredData?.channels && slackConfiguredData.channels.length > 0 ? (
                      <div className="space-y-2">
                        {slackConfiguredData.channels.map((channel) => (
                          <div
                            key={channel.id}
                            className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <Hash className="h-4 w-4 text-slate-400" />
                              <span className="text-white">{channel.channel_name}</span>
                              {channel.auto_parse_standups && (
                                <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded text-xs">
                                  Standups
                                </span>
                              )}
                              {channel.auto_parse_blockers && (
                                <span className="px-2 py-0.5 bg-orange-900/30 text-orange-400 rounded text-xs">
                                  Blockers
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => removeSlackChannel(channel.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No channels configured yet</p>
                        <p className="text-sm">Add channels to start monitoring</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Import History */}
                {slackConnected && slackIntegration && isAdmin && (
                  <div className="bg-slate-800 rounded-xl p-6">
                    <h3 className="text-white font-medium mb-4">Import History</h3>
                    <p className="text-slate-400 text-sm mb-4">
                      Import existing messages from Slack channels to populate standups and activity
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-slate-400 text-sm">Days back:</label>
                        <input
                          type="number"
                          value={slackImportDays}
                          onChange={(e) => setSlackImportDays(parseInt(e.target.value) || 30)}
                          min={1}
                          max={90}
                          className="w-20 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-primary-500"
                        />
                      </div>
                      <button
                        onClick={() => importSlackHistory({ days_back: slackImportDays })}
                        disabled={isImportingSlack}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm flex items-center gap-2"
                      >
                        {isImportingSlack ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-4 w-4" />
                            Import Messages
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Add Channel Modal */}
            {showSlackChannelModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
                  <h3 className="text-white font-medium mb-4">Add Channel</h3>

                  {isLoadingSlackChannels ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-slate-400 mb-1">Select Channel</label>
                        <select
                          value={selectedSlackChannel}
                          onChange={(e) => setSelectedSlackChannel(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                        >
                          <option value="">Choose a channel...</option>
                          {slackChannelsData?.channels?.map((channel) => (
                            <option key={channel.id} value={channel.id}>
                              #{channel.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                        <button
                          onClick={() => {
                            setShowSlackChannelModal(false);
                            setSelectedSlackChannel("");
                          }}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (selectedSlackChannel && slackChannelsData?.channels) {
                              const channel = slackChannelsData.channels.find(
                                (c) => c.id === selectedSlackChannel
                              );
                              if (channel && slackIntegration) {
                                await configureSlackChannel({
                                  channel_id: channel.id,
                                  channel_name: channel.name,
                                  team_id: slackIntegration.team_id,
                                  auto_parse_standups: true,
                                  auto_parse_blockers: true,
                                });
                                setShowSlackChannelModal(false);
                                setSelectedSlackChannel("");
                              }
                            }
                          }}
                          disabled={!selectedSlackChannel || isConfiguringSlack}
                          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm flex items-center gap-2 disabled:opacity-50"
                        >
                          {isConfiguringSlack ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Add Channel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
