"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
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
    pending: { icon: Clock, color: "text-slate-400", bg: "bg-slate-700", label: "Pending" },
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
    none: { color: "text-slate-500", label: "No webhook" },
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
    <div className="p-3 px-4 flex items-start justify-between hover:bg-slate-700/30 gap-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <input
          type="checkbox"
          checked={repo.is_enabled}
          onChange={(e) => onRepoToggle(repo.id, e.target.checked)}
          className="w-4 h-4 mt-1 text-primary-600 bg-slate-700 border-slate-600 rounded focus:ring-primary-500 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {showOwner && (
              <span className="text-slate-400 text-sm">{repo.owner_login}/</span>
            )}
            <span className="text-white font-medium">{repo.name}</span>
            {repo.is_private ? (
              <Lock className="h-3 w-3 text-slate-500 flex-shrink-0" />
            ) : (
              <Globe className="h-3 w-3 text-slate-500 flex-shrink-0" />
            )}
            {repo.language && (
              <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded flex-shrink-0">
                {repo.language}
              </span>
            )}
          </div>
          {repo.description && (
            <p className="text-slate-400 text-xs mt-1 line-clamp-2">
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
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
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
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-slate-700">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
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
            <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-white font-medium">{title}</h3>
            <p className="text-slate-400 text-sm">{count}</p>
          </div>
        </button>
        {headerRight}
      </div>
      {expanded && (
        <div className="divide-y divide-slate-700/50">
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

  // Separate enabled and disabled repos
  const enabledRepos = repositories.filter(r => r.is_enabled);
  const disabledPersonalRepos = repositories.filter(r => r.owner_type === "User" && !r.is_enabled);
  const enabledCount = enabledRepos.length;
  const totalCount = repositories.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading repositories...</p>
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
                <h1 className="text-xl font-semibold text-white">Repository Settings</h1>
                <p className="text-slate-400 text-sm">
                  Manage which repositories are synced and analyzed
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Stats & Actions Bar */}
        {installationStatus?.has_installation && repositories.length > 0 && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-6">
              <div className="text-slate-300">
                <span className="text-2xl font-bold text-white">{enabledCount}</span>
                <span className="text-slate-400"> / {totalCount}</span>
                <span className="ml-1 text-sm">repositories enabled</span>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh from GitHub
            </button>
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
              icon={<User className="h-5 w-5 text-slate-400" />}
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
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Building2 className="h-5 w-5 text-slate-400" />
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
                  icon={<Building2 className="h-5 w-5 text-slate-400" />}
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
                      <div className="w-11 h-6 bg-slate-600 peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
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
          <div className="bg-slate-800 rounded-xl p-12 text-center">
            <FolderGit2 className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">GitHub App Not Installed</h3>
            <p className="text-slate-400 mb-6">
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
              <p className="text-slate-500 text-sm">
                GitHub App install URL not configured. Please contact support.
              </p>
            )}
          </div>
        )}

        {/* Empty State - has installation but no repos */}
        {installationStatus?.has_installation && repositories.length === 0 && (
          <div className="bg-slate-800 rounded-xl p-12 text-center">
            <FolderGit2 className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No repositories found</h3>
            <p className="text-slate-400 mb-6">
              We couldn&apos;t find any repositories. Try refreshing from GitHub or check your app installation permissions.
            </p>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh from GitHub
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
