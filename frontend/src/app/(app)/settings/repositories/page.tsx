"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Globe,
  Lock,
  RefreshCw,
  Settings,
  Check,
  AlertCircle,
  Clock,
  ExternalLink,
  Loader2,
  User,
  Zap,
} from "lucide-react";
import {
  repositoriesApi,
  Organization,
  Repository,
  InstallationStatus,
} from "@/lib/api";

type SyncStatus = "pending" | "syncing" | "synced" | "failed";
type WebhookStatus = "none" | "pending" | "active" | "failed";

function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const config = {
    pending: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", label: "Pending" },
    syncing: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-900/30", label: "Syncing" },
    synced: { icon: Check, color: "text-green-400", bg: "bg-green-900/30", label: "Synced" },
    failed: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-900/30", label: "Failed" },
  };

  const { icon: Icon, color, bg, label } = config[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${bg} ${color}`}>
      <Icon className={`h-3 w-3 ${status === "syncing" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function WebhookStatusBadge({ status }: { status: WebhookStatus }) {
  const config = {
    none: { color: "text-muted-foreground", label: "No webhook" },
    pending: { color: "text-yellow-400", label: "Webhook pending" },
    active: { color: "text-green-400", label: "Webhook active" },
    failed: { color: "text-red-400", label: "Webhook failed" },
  };

  const { color, label } = config[status];

  return <span className={`text-xs ${color}`}>{label}</span>;
}

interface RepoItemProps {
  repo: Repository;
  onRepoToggle: (repoId: string, enabled: boolean) => Promise<void>;
  onStartSync: (repoId: string) => Promise<void>;
  showOwner?: boolean;
}

function RepoItem({ repo, onRepoToggle, onStartSync, showOwner }: RepoItemProps) {
  return (
    <div className="p-3 px-4 flex items-start justify-between hover:bg-accent/30 gap-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <input
          type="checkbox"
          checked={repo.is_enabled}
          onChange={(e) => onRepoToggle(repo.id, e.target.checked)}
          className="w-4 h-4 mt-1 text-primary-600 bg-muted border-border rounded focus:ring-primary-500 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {showOwner && (
              <span className="text-muted-foreground text-sm">{repo.owner_login}/</span>
            )}
            <span className="text-foreground font-medium">{repo.name}</span>
            {repo.is_private ? (
              <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            ) : (
              <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
            {repo.language && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded flex-shrink-0">
                {repo.language}
              </span>
            )}
          </div>
          {repo.description && (
            <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
              {repo.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {repo.is_enabled && (
          <>
            <div className="text-right">
              <SyncStatusBadge status={repo.sync_status as SyncStatus} />
              <div className="mt-0.5">
                <WebhookStatusBadge status={repo.webhook_status as WebhookStatus} />
              </div>
            </div>
             
              <button
                onClick={() => onStartSync(repo.id)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition"
                title="Start sync"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            
          </>
        )}
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  count: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  headerRight?: React.ReactNode;
  avatar?: string | null;
}

function CollapsibleSection({
  title,
  icon,
  count,
  children,
  defaultExpanded = true,
  headerRight,
  avatar,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          )}
          {avatar ? (
            <Image
              src={avatar}
              alt={title}
              width={40}
              height={40}
              className="rounded-lg"
            />
          ) : (
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-foreground font-medium">{title}</h3>
            <p className="text-muted-foreground text-sm">{count}</p>
          </div>
        </button>
        {headerRight}
      </div>
      {expanded && (
        <div className="divide-y divide-border/50">
          {children}
        </div>
      )}
    </div>
  );
}

export default function RepositorySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [installationStatus, setInstallationStatus] = useState<InstallationStatus | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncFrequency, setAutoSyncFrequency] = useState("1h");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (isPolling = false) => {
    try {
      const instStatus = await repositoriesApi.getInstallationStatus();
      setInstallationStatus(instStatus);

      if (instStatus.has_installation) {
        const [orgs, repos] = await Promise.all([
          repositoriesApi.listOrganizations(),
          repositoriesApi.listRepositories(),
        ]);
        setOrganizations(orgs);
        setRepositories(repos);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh from GitHub if installation exists but no repos loaded yet
  const autoRefreshedRef = useRef(false);
  useEffect(() => {
    if (
      !loading &&
      !autoRefreshedRef.current &&
      installationStatus?.has_installation &&
      repositories.length === 0
    ) {
      autoRefreshedRef.current = true;
      handleRefresh();
    }
  }, [loading, installationStatus, repositories.length]);

  // Auto-poll when repos are syncing
  useEffect(() => {
    const hasSyncingRepos = repositories.some(r => r.sync_status === "syncing");

    if (hasSyncingRepos && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        fetchData(true);
      }, 3000); // Poll every 3 seconds
    } else if (!hasSyncingRepos && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [repositories, fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await repositoriesApi.refreshAvailableRepos();
      await fetchData();
    } catch (error) {
      console.error("Failed to refresh:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleOrgToggle = async (orgId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await repositoriesApi.enableOrganization(orgId);
      } else {
        await repositoriesApi.disableOrganization(orgId);
      }

      setOrganizations(orgs =>
        orgs.map(org =>
          org.id === orgId ? { ...org, is_enabled: enabled } : org
        )
      );

      setRepositories(repos =>
        repos.map(repo =>
          repo.organization_id === orgId ? { ...repo, is_enabled: enabled } : repo
        )
      );
    } catch (error) {
      console.error("Failed to toggle org:", error);
    }
  };

  const handleRepoToggle = async (repoId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await repositoriesApi.enableRepository(repoId);
      } else {
        await repositoriesApi.disableRepository(repoId);
      }

      setRepositories(repos =>
        repos.map(repo =>
          repo.id === repoId ? { ...repo, is_enabled: enabled } : repo
        )
      );
    } catch (error) {
      console.error("Failed to toggle repo:", error);
    }
  };

  const handleStartSync = async (repoId: string) => {
    try {
      await repositoriesApi.startSync(repoId);
      setRepositories(repos =>
        repos.map(repo =>
          repo.id === repoId ? { ...repo, sync_status: "syncing" } : repo
        )
      );
    } catch (error) {
      console.error("Failed to start sync:", error);
    }
  };

  // Fetch autosync settings
  useEffect(() => {
    if (installationStatus?.has_installation) {
      repositoriesApi.getAutoSyncSettings().then((settings) => {
        setAutoSyncEnabled(settings.enabled);
        setAutoSyncFrequency(settings.frequency);
      }).catch(() => {});
    }
  }, [installationStatus]);

  const handleAutoSyncToggle = async (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    try {
      await repositoriesApi.updateAutoSyncSettings({ enabled, frequency: autoSyncFrequency });
    } catch (error) {
      console.error("Failed to update auto-sync:", error);
      setAutoSyncEnabled(!enabled);
    }
  };

  const handleAutoSyncFrequencyChange = async (frequency: string) => {
    const prev = autoSyncFrequency;
    setAutoSyncFrequency(frequency);
    try {
      await repositoriesApi.updateAutoSyncSettings({ enabled: autoSyncEnabled, frequency });
    } catch (error) {
      console.error("Failed to update sync frequency:", error);
      setAutoSyncFrequency(prev);
    }
  };

  // Separate enabled and disabled repos
  const enabledRepos = repositories.filter(r => r.is_enabled);
  const disabledPersonalRepos = repositories.filter(r => r.owner_type === "User" && !r.is_enabled);
  const enabledCount = enabledRepos.length;
  const totalCount = repositories.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-foreground">Loading repositories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Repository Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage which repositories are synced and analyzed
        </p>
      </div>

      <div>
        {/* Stats & Actions Bar */}
        {installationStatus?.has_installation && repositories.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-6">
              <div className="text-foreground">
                <span className="text-2xl font-bold text-foreground">{enabledCount}</span>
                <span className="text-muted-foreground"> / {totalCount}</span>
                <span className="ml-1 text-sm">repositories enabled</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {installationStatus.installations.length > 0 && (
                <a
                  href={`https://github.com/settings/installations/${installationStatus.installations[0].installation_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg transition"
                >
                  <ExternalLink className="h-4 w-4" />
                  Manage access
                </a>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg transition disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh from GitHub
              </button>
            </div>
          </div>
        )}

        {/* Connected Repositories Section - Show at top if any enabled */}
        {enabledRepos.length > 0 && (
          <div className="mb-6">
            <CollapsibleSection
              title="Connected Repositories"
              icon={<Zap className="h-5 w-5 text-green-400" />}
              count={`${enabledRepos.length} repositories being analyzed`}
              defaultExpanded={true}
            >
              {enabledRepos.map((repo) => (
                <RepoItem
                  key={repo.id}
                  repo={repo}
                  onRepoToggle={handleRepoToggle}
                  onStartSync={handleStartSync}
                  showOwner={true}
                />
              ))}
            </CollapsibleSection>
          </div>
        )}

        {/* Personal Repos Section */}
        {disabledPersonalRepos.length > 0 && (
          <div className="mb-6">
            <CollapsibleSection
              title="Personal Repositories"
              icon={<User className="h-5 w-5 text-muted-foreground" />}
              count={`${disabledPersonalRepos.length} repositories available`}
              defaultExpanded={enabledRepos.length === 0}
            >
              {disabledPersonalRepos.map((repo) => (
                <RepoItem
                  key={repo.id}
                  repo={repo}
                  onRepoToggle={handleRepoToggle}
                  onStartSync={handleStartSync}
                />
              ))}
            </CollapsibleSection>
          </div>
        )}

        {/* Organization Sections */}
        {organizations.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              Organizations
            </h2>
            {organizations.map((org) => {
              const orgRepos = repositories.filter(r => r.organization_id === org.id && !r.is_enabled);
              if (orgRepos.length === 0) return null;

              const enabledOrgCount = repositories.filter(r => r.organization_id === org.id && r.is_enabled).length;
              const totalOrgCount = repositories.filter(r => r.organization_id === org.id).length;

              return (
                <CollapsibleSection
                  key={org.id}
                  title={org.name || org.login}
                  icon={<Building2 className="h-5 w-5 text-muted-foreground" />}
                  count={`${enabledOrgCount} of ${totalOrgCount} repositories enabled`}
                  defaultExpanded={enabledRepos.length === 0}
                  avatar={org.avatar_url}
                  headerRight={
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={org.is_enabled}
                        onChange={(e) => handleOrgToggle(org.id, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  }
                >
                  {orgRepos.map((repo) => (
                    <RepoItem
                      key={repo.id}
                      repo={repo}
                      onRepoToggle={handleRepoToggle}
                      onStartSync={handleStartSync}
                    />
                  ))}
                </CollapsibleSection>
              );
            })}
          </div>
        )}

        {/* No Installation State */}
        {!installationStatus?.has_installation && (
          <div className="bg-card rounded-xl p-12 text-center">
            <FolderGit2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium text-foreground mb-2">GitHub App Not Installed</h3>
            <p className="text-muted-foreground mb-6">
              Install the Aexy GitHub App to grant access to your repositories.
              This allows us to analyze your code contributions.
            </p>
            {installationStatus?.install_url ? (
              <a
                href={installationStatus.install_url}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
              >
                Install GitHub App
              </a>
            ) : (
              <p className="text-muted-foreground text-sm">
                GitHub App install URL not configured. Please contact support.
              </p>
            )}
          </div>
        )}

        {/* Empty State - has installation but no repos */}
        {installationStatus?.has_installation && repositories.length === 0 && (
          <div className="bg-card rounded-xl p-12 text-center">
            <FolderGit2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium text-foreground mb-2">No repositories found</h3>
            <p className="text-muted-foreground mb-6">
              We couldn&apos;t find any repositories. Try refreshing from GitHub or check your app installation permissions.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh from GitHub
              </button>
              {installationStatus.installations.length > 0 && (
                <a
                  href={`https://github.com/settings/installations/${installationStatus.installations[0].installation_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg transition"
                >
                  <ExternalLink className="h-4 w-4" />
                  Manage access on GitHub
                </a>
              )}
            </div>
          </div>
        )}

        {/* Auto-sync Settings */}
        {installationStatus?.has_installation && enabledRepos.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-medium text-foreground flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5 text-muted-foreground" />
              Sync Settings
            </h2>
            <div className="bg-card rounded-xl divide-y divide-border">
              <div className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-foreground font-medium">Auto-sync</h3>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    Automatically sync enabled repositories on a schedule
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSyncEnabled}
                    onChange={(e) => handleAutoSyncToggle(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
              {autoSyncEnabled && (
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-foreground font-medium">Sync frequency</h3>
                    <p className="text-muted-foreground text-sm mt-0.5">
                      How often to sync commits, PRs, and reviews
                    </p>
                  </div>
                  <select
                    value={autoSyncFrequency}
                    onChange={(e) => handleAutoSyncFrequencyChange(e.target.value)}
                    className="bg-muted text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="30m">Every 30 minutes</option>
                    <option value="1h">Every hour</option>
                    <option value="6h">Every 6 hours</option>
                    <option value="12h">Every 12 hours</option>
                    <option value="24h">Once a day</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
