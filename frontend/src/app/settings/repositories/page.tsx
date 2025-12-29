"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  repositoriesApi,
  Organization,
  Repository,
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

interface OrgSectionProps {
  org: Organization;
  repos: Repository[];
  onOrgToggle: (orgId: string, enabled: boolean) => Promise<void>;
  onRepoToggle: (repoId: string, enabled: boolean) => Promise<void>;
  onStartSync: (repoId: string) => Promise<void>;
}

function OrgSection({ org, repos, onOrgToggle, onRepoToggle, onStartSync }: OrgSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const enabledCount = repos.filter(r => r.is_enabled).length;

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      {/* Org Header */}
      <div className="p-4 flex items-center justify-between border-b border-slate-700">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-400" />
          )}
          {org.avatar_url ? (
            <Image
              src={org.avatar_url}
              alt={org.login}
              width={40}
              height={40}
              className="rounded-lg"
            />
          ) : (
            <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
              <Building2 className="h-5 w-5 text-slate-400" />
            </div>
          )}
          <div>
            <h3 className="text-white font-medium">{org.name || org.login}</h3>
            <p className="text-slate-400 text-sm">
              {enabledCount} of {repos.length} repositories enabled
            </p>
          </div>
        </button>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={org.is_enabled}
            onChange={(e) => onOrgToggle(org.id, e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-600 peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
        </label>
      </div>

      {/* Repos List */}
      {expanded && (
        <div className="divide-y divide-slate-700/50">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="p-3 px-4 flex items-center justify-between hover:bg-slate-700/30"
            >
              <div className="flex items-center gap-3 flex-1">
                <input
                  type="checkbox"
                  checked={repo.is_enabled}
                  onChange={(e) => onRepoToggle(repo.id, e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-slate-700 border-slate-600 rounded focus:ring-primary-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white truncate">{repo.name}</span>
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
                    <p className="text-slate-400 text-xs truncate mt-0.5">
                      {repo.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                {repo.is_enabled && (
                  <>
                    <div className="text-right">
                      <SyncStatusBadge status={repo.sync_status as SyncStatus} />
                      <div className="mt-0.5">
                        <WebhookStatusBadge status={repo.webhook_status as WebhookStatus} />
                      </div>
                    </div>
                    {(repo.sync_status === "pending" || repo.sync_status === "failed") && (
                      <button
                        onClick={() => onStartSync(repo.id)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
                        title="Start sync"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [orgs, repos] = await Promise.all([
        repositoriesApi.listOrganizations(),
        repositoriesApi.listRepositories(),
      ]);
      setOrganizations(orgs);
      setRepositories(repos);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const personalRepos = repositories.filter(r => r.owner_type === "User");
  const enabledCount = repositories.filter(r => r.is_enabled).length;
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

        {/* Personal Repos Section */}
        {personalRepos.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
              <FolderGit2 className="h-5 w-5 text-slate-400" />
              Personal Repositories
            </h2>
            <div className="bg-slate-800 rounded-xl divide-y divide-slate-700/50">
              {personalRepos.map((repo) => (
                <div
                  key={repo.id}
                  className="p-3 px-4 flex items-center justify-between hover:bg-slate-700/30"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="checkbox"
                      checked={repo.is_enabled}
                      onChange={(e) => handleRepoToggle(repo.id, e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-slate-700 border-slate-600 rounded focus:ring-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white truncate">{repo.name}</span>
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
                        <p className="text-slate-400 text-xs truncate mt-0.5">
                          {repo.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    {repo.is_enabled && (
                      <>
                        <div className="text-right">
                          <SyncStatusBadge status={repo.sync_status as SyncStatus} />
                          <div className="mt-0.5">
                            <WebhookStatusBadge status={repo.webhook_status as WebhookStatus} />
                          </div>
                        </div>
                        {(repo.sync_status === "pending" || repo.sync_status === "failed") && (
                          <button
                            onClick={() => handleStartSync(repo.id)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
                            title="Start sync"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
              const orgRepos = repositories.filter(r => r.organization_id === org.id);
              if (orgRepos.length === 0) return null;

              return (
                <OrgSection
                  key={org.id}
                  org={org}
                  repos={orgRepos}
                  onOrgToggle={handleOrgToggle}
                  onRepoToggle={handleRepoToggle}
                  onStartSync={handleStartSync}
                />
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {repositories.length === 0 && (
          <div className="bg-slate-800 rounded-xl p-12 text-center">
            <FolderGit2 className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No repositories found</h3>
            <p className="text-slate-400 mb-6">
              We couldn&apos;t find any repositories associated with your GitHub account.
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
