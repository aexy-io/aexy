"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  GitBranch,
  Building2,
  FolderGit2,
  Check,
  RefreshCw,
  ChevronRight,
  Lock,
  Globe,
  LogOut,
  ExternalLink,
  AlertCircle,
  Slack,
  Zap,
  Link2,
  Key,
  Loader2,
  CheckCircle,
  SkipForward,
} from "lucide-react";
import Image from "next/image";
import {
  repositoriesApi,
  Organization,
  Repository,
  InstallationStatus,
  jiraApi,
  linearApi,
  slackApi,
} from "@/lib/api";

type Step = "install" | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [installationStatus, setInstallationStatus] = useState<InstallationStatus | null>(null);
  const [checkingInstallation, setCheckingInstallation] = useState(false);

  // Project Management state
  const [pmTool, setPmTool] = useState<"jira" | "linear" | "skip" | null>(null);
  const [jiraSiteUrl, setJiraSiteUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [linearApiKey, setLinearApiKey] = useState("");
  const [pmConnecting, setPmConnecting] = useState(false);
  const [pmTesting, setPmTesting] = useState(false);
  const [pmTestSuccess, setPmTestSuccess] = useState(false);
  const [pmError, setPmError] = useState<string | null>(null);
  const [pmConnected, setPmConnected] = useState(false);

  // Slack state
  const [slackConnecting, setSlackConnecting] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);

  // Check installation status on mount
  useEffect(() => {
    const checkInstallation = async () => {
      setLoading(true);
      try {
        const status = await repositoriesApi.getInstallationStatus();
        setInstallationStatus(status);

        if (status.has_installation) {
          // Has installation, proceed to fetch repos
          await fetchRepositories();
        } else {
          // No installation, show install prompt
          setStep("install");
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to check installation:", error);
        // On error, try to fetch repos anyway (might work with OAuth fallback)
        await fetchRepositories();
      }
    };

    checkInstallation();
  }, []);

  const fetchRepositories = async () => {
    setLoading(true);
    try {
      // First refresh from GitHub
      await repositoriesApi.refreshAvailableRepos();

      // Then fetch orgs and repos
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

  const handleCheckInstallation = async () => {
    setCheckingInstallation(true);
    try {
      // Sync installations from GitHub
      await repositoriesApi.syncInstallations();

      // Check status again
      const status = await repositoriesApi.getInstallationStatus();
      setInstallationStatus(status);

      if (status.has_installation) {
        // Installation found, proceed to load repos
        setStep(1);
        await fetchRepositories();
      }
    } catch (error) {
      console.error("Failed to check installation:", error);
    } finally {
      setCheckingInstallation(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await repositoriesApi.refreshAvailableRepos();
      const [orgs, repos] = await Promise.all([
        repositoriesApi.listOrganizations(),
        repositoriesApi.listRepositories(),
      ]);
      setOrganizations(orgs);
      setRepositories(repos);
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

      // Update local state
      setOrganizations(orgs =>
        orgs.map(org =>
          org.id === orgId ? { ...org, is_enabled: enabled } : org
        )
      );

      // Update repos for this org
      setRepositories(repos =>
        repos.map(repo =>
          repo.organization_id === orgId ? { ...repo, is_enabled: enabled } : repo
        )
      );

      // Update selected repos
      if (enabled) {
        const orgRepoIds = repositories
          .filter(r => r.organization_id === orgId)
          .map(r => r.id);
        setSelectedRepos(prev => new Set([...prev, ...orgRepoIds]));
      } else {
        const orgRepoIds = new Set(
          repositories.filter(r => r.organization_id === orgId).map(r => r.id)
        );
        setSelectedRepos(prev => new Set([...prev].filter(id => !orgRepoIds.has(id))));
      }
    } catch (error) {
      console.error("Failed to toggle org:", error);
    }
  };

  const handleRepoToggle = async (repoId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await repositoriesApi.enableRepository(repoId);
        setSelectedRepos(prev => new Set([...prev, repoId]));
      } else {
        await repositoriesApi.disableRepository(repoId);
        setSelectedRepos(prev => {
          const next = new Set(prev);
          next.delete(repoId);
          return next;
        });
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

  const handleStartSync = async () => {
    setSyncing(true);
    setSyncProgress(0);

    const enabledRepos = repositories.filter(r => r.is_enabled);
    let completed = 0;

    for (const repo of enabledRepos) {
      try {
        await repositoriesApi.startSync(repo.id);
        completed++;
        setSyncProgress(Math.round((completed / enabledRepos.length) * 100));
      } catch (error) {
        console.error(`Failed to sync ${repo.full_name}:`, error);
      }
    }

    setSyncing(false);
    setStep(5); // Move to Project Management step
  };

  // Project Management handlers
  const handlePmTest = async () => {
    setPmError(null);
    setPmTestSuccess(false);
    setPmTesting(true);

    try {
      if (pmTool === "jira") {
        if (!jiraSiteUrl || !jiraEmail || !jiraToken) {
          setPmError("All fields are required");
          return;
        }
        await jiraApi.testConnection({
          site_url: jiraSiteUrl,
          user_email: jiraEmail,
          api_token: jiraToken,
        });
      } else if (pmTool === "linear") {
        if (!linearApiKey) {
          setPmError("API key is required");
          return;
        }
        await linearApi.testConnection({ api_key: linearApiKey });
      }
      setPmTestSuccess(true);
    } catch (err) {
      setPmError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setPmTesting(false);
    }
  };

  const handlePmConnect = async () => {
    setPmError(null);
    setPmConnecting(true);

    try {
      if (pmTool === "jira") {
        await jiraApi.createIntegration({
          site_url: jiraSiteUrl,
          user_email: jiraEmail,
          api_token: jiraToken,
        });
      } else if (pmTool === "linear") {
        await linearApi.createIntegration({ api_key: linearApiKey });
      }
      setPmConnected(true);
      setTimeout(() => setStep(6), 500); // Move to Slack step after brief success display
    } catch (err) {
      setPmError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setPmConnecting(false);
    }
  };

  const handleComplete = async () => {
    try {
      await repositoriesApi.completeOnboarding();
      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      router.push("/dashboard");
    }
  };

  const personalRepos = repositories.filter(r => r.owner_type === "User");
  const enabledCount = repositories.filter(r => r.is_enabled).length;

  // Get the total number of steps for progress indicator
  const totalSteps = 7;
  const currentStepNumber = typeof step === "number" ? step : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading your repositories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GitBranch className="h-8 w-8 text-primary-500" />
              <span className="text-2xl font-bold text-white">Devograph</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Hide progress indicator on install step */}
        {step !== "install" && (
          <div className="flex items-center justify-center gap-1 mb-12">
            {[1, 2, 3, 4, 5, 6, 7].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
                    ${typeof step === "number" && step >= s
                      ? "bg-primary-500 text-white"
                      : "bg-slate-700 text-slate-400"
                    }`}
                >
                  {typeof step === "number" && step > s ? <Check className="h-4 w-4" /> : s}
                </div>
                {s < totalSteps && (
                  <div
                    className={`w-8 h-0.5 ${
                      typeof step === "number" && step > s ? "bg-primary-500" : "bg-slate-700"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step: Install GitHub App */}
        {step === "install" && (
          <div className="text-center">
            <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="h-10 w-10 text-amber-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Install the GitHub App
            </h1>
            <p className="text-slate-300 text-lg mb-8 max-w-2xl mx-auto">
              To access your repositories, you need to install the Devograph GitHub App.
              This allows us to securely read your commit history, pull requests, and code reviews.
            </p>

            <div className="bg-slate-800 rounded-xl p-6 max-w-md mx-auto mb-8">
              <h3 className="text-white font-medium mb-4">The app will have access to:</h3>
              <ul className="text-slate-300 text-left space-y-2">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-400" />
                  Read repository contents and metadata
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-400" />
                  Read commit history
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-400" />
                  Read pull requests and reviews
                </li>
              </ul>
            </div>

            <div className="flex flex-col items-center gap-4">
              {installationStatus?.install_url ? (
                <a
                  href={installationStatus.install_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg text-lg font-medium transition flex items-center gap-2"
                >
                  Install GitHub App
                  <ExternalLink className="h-5 w-5" />
                </a>
              ) : (
                <p className="text-slate-400">
                  Installation URL not configured. Please contact support.
                </p>
              )}

              <button
                onClick={handleCheckInstallation}
                disabled={checkingInstallation}
                className="text-slate-400 hover:text-white transition flex items-center gap-2 disabled:opacity-50"
              >
                {checkingInstallation ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    I&apos;ve installed the app
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-4">
              Welcome to Devograph!
            </h1>
            <p className="text-slate-300 text-lg mb-8 max-w-2xl mx-auto">
              Let&apos;s set up your account step by step. We&apos;ll connect your GitHub,
              project management tools, and team communication to give you a complete
              view of your development workflow.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-8">
              <div className="bg-slate-800 rounded-xl p-5">
                <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <GitBranch className="h-6 w-6 text-slate-300" />
                </div>
                <h3 className="text-white font-medium mb-1">GitHub</h3>
                <p className="text-slate-400 text-sm">Sync commits, PRs & reviews</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-5">
                <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg className="h-6 w-6 text-slate-300" viewBox="0 0 32 32" fill="currentColor">
                    <path d="M15.967 0.5c-0.6 0-1.167 0.233-1.617 0.683l-12.35 12.35c-0.9 0.9-0.9 2.35 0 3.25l12.35 12.35c0.45 0.45 1.017 0.683 1.617 0.683s1.167-0.233 1.617-0.683l12.35-12.35c0.9-0.9 0.9-2.35 0-3.25l-12.35-12.35c-0.45-0.45-1.017-0.683-1.617-0.683z"/>
                  </svg>
                </div>
                <h3 className="text-white font-medium mb-1">Jira / Linear</h3>
                <p className="text-slate-400 text-sm">Import tasks & track progress</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-5">
                <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Slack className="h-6 w-6 text-slate-300" />
                </div>
                <h3 className="text-white font-medium mb-1">Slack</h3>
                <p className="text-slate-400 text-sm">Standups, blockers & updates</p>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg text-lg font-medium transition flex items-center gap-2 mx-auto"
            >
              Get Started
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Step 2: Select Organizations */}
        {step === 2 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Select Organizations
                </h2>
                <p className="text-slate-400 mt-1">
                  Enable organizations to include all their repositories
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            {organizations.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-8 text-center">
                <Building2 className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400">
                  No organizations found. You can still select your personal repositories.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {organizations.map((org) => (
                  <div
                    key={org.id}
                    className="bg-slate-800 rounded-xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      {org.avatar_url ? (
                        <Image
                          src={org.avatar_url}
                          alt={org.login}
                          width={48}
                          height={48}
                          className="rounded-lg"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-white font-medium">{org.name || org.login}</h3>
                        <p className="text-slate-400 text-sm">
                          {org.repository_count} repositories
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={org.is_enabled}
                        onChange={(e) => handleOrgToggle(org.id, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-600 peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-2 text-slate-400 hover:text-white transition"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2"
              >
                Continue
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Select Repositories */}
        {step === 3 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Select Repositories
                </h2>
                <p className="text-slate-400 mt-1">
                  Choose which repositories to analyze ({enabledCount} selected)
                </p>
              </div>
            </div>

            {/* Personal Repos */}
            {personalRepos.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                  <FolderGit2 className="h-5 w-5 text-slate-400" />
                  Personal Repositories
                </h3>
                <div className="bg-slate-800 rounded-xl divide-y divide-slate-700 max-h-64 overflow-y-auto">
                  {personalRepos.map((repo) => (
                    <div
                      key={repo.id}
                      className="p-3 flex items-center justify-between hover:bg-slate-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={repo.is_enabled}
                          onChange={(e) => handleRepoToggle(repo.id, e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-slate-700 border-slate-600 rounded focus:ring-primary-500"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white">{repo.name}</span>
                            {repo.is_private ? (
                              <Lock className="h-3 w-3 text-slate-500" />
                            ) : (
                              <Globe className="h-3 w-3 text-slate-500" />
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-slate-400 text-xs truncate max-w-md">
                              {repo.description}
                            </p>
                          )}
                        </div>
                      </div>
                      {repo.language && (
                        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                          {repo.language}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Org Repos */}
            {organizations.map((org) => {
              const orgRepos = repositories.filter(
                r => r.organization_id === org.id
              );
              if (orgRepos.length === 0) return null;

              return (
                <div key={org.id} className="mb-6">
                  <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                    {org.avatar_url ? (
                      <Image
                        src={org.avatar_url}
                        alt={org.login}
                        width={20}
                        height={20}
                        className="rounded"
                      />
                    ) : (
                      <Building2 className="h-5 w-5 text-slate-400" />
                    )}
                    {org.name || org.login}
                  </h3>
                  <div className="bg-slate-800 rounded-xl divide-y divide-slate-700 max-h-64 overflow-y-auto">
                    {orgRepos.map((repo) => (
                      <div
                        key={repo.id}
                        className="p-3 flex items-center justify-between hover:bg-slate-700/50"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={repo.is_enabled}
                            onChange={(e) => handleRepoToggle(repo.id, e.target.checked)}
                            className="w-4 h-4 text-primary-600 bg-slate-700 border-slate-600 rounded focus:ring-primary-500"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white">{repo.name}</span>
                              {repo.is_private ? (
                                <Lock className="h-3 w-3 text-slate-500" />
                              ) : (
                                <Globe className="h-3 w-3 text-slate-500" />
                              )}
                            </div>
                            {repo.description && (
                              <p className="text-slate-400 text-xs truncate max-w-md">
                                {repo.description}
                              </p>
                            )}
                          </div>
                        </div>
                        {repo.language && (
                          <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                            {repo.language}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-2 text-slate-400 hover:text-white transition"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={enabledCount === 0}
                className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2 disabled:opacity-50"
              >
                Continue
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Sync Repositories */}
        {step === 4 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-primary-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <GitBranch className="h-10 w-10 text-primary-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Sync Your Repositories
            </h2>
            <p className="text-slate-300 text-lg mb-8 max-w-lg mx-auto">
              We&apos;ll now sync your selected repositories to analyze commits, pull requests, and code reviews.
            </p>
            <div className="bg-slate-800 rounded-xl p-6 max-w-md mx-auto mb-8">
              <p className="text-slate-300">
                <span className="text-white font-medium">{enabledCount}</span>{" "}
                repositories selected for sync
              </p>
            </div>

            {syncing ? (
              <div className="max-w-md mx-auto">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary-500" />
                  <span className="text-white">Syncing repositories...</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
                <p className="text-slate-400 text-sm mt-2">{syncProgress}% complete</p>
              </div>
            ) : (
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-2 text-slate-400 hover:text-white transition"
                >
                  Back
                </button>
                <button
                  onClick={handleStartSync}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg font-medium transition flex items-center gap-2"
                >
                  <RefreshCw className="h-5 w-5" />
                  Start Sync
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Connect Project Management */}
        {step === 5 && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">
                Connect Project Management
              </h2>
              <p className="text-slate-400">
                Import your tasks and track sprint progress
              </p>
            </div>

            {!pmTool && !pmConnected && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                <button
                  onClick={() => setPmTool("jira")}
                  className="bg-slate-800 hover:bg-slate-700 rounded-xl p-6 text-left transition border-2 border-transparent hover:border-primary-500"
                >
                  <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center mb-4">
                    <svg className="h-6 w-6" viewBox="0 0 32 32" fill="#2684FF">
                      <path d="M15.967 0.5c-0.6 0-1.167 0.233-1.617 0.683l-12.35 12.35c-0.9 0.9-0.9 2.35 0 3.25l12.35 12.35c0.45 0.45 1.017 0.683 1.617 0.683s1.167-0.233 1.617-0.683l12.35-12.35c0.9-0.9 0.9-2.35 0-3.25l-12.35-12.35c-0.45-0.45-1.017-0.683-1.617-0.683z"/>
                    </svg>
                  </div>
                  <h3 className="text-white font-medium mb-1">Jira</h3>
                  <p className="text-slate-400 text-sm">Connect with Atlassian Jira</p>
                </button>

                <button
                  onClick={() => setPmTool("linear")}
                  className="bg-slate-800 hover:bg-slate-700 rounded-xl p-6 text-left transition border-2 border-transparent hover:border-primary-500"
                >
                  <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center mb-4">
                    <svg className="h-6 w-6" viewBox="0 0 100 100" fill="#5E6AD2">
                      <path d="M50 0C22.4 0 0 22.4 0 50s22.4 50 50 50 50-22.4 50-50S77.6 0 50 0zm24.9 74.9H25.1V25.1h49.8v49.8z"/>
                    </svg>
                  </div>
                  <h3 className="text-white font-medium mb-1">Linear</h3>
                  <p className="text-slate-400 text-sm">Connect with Linear</p>
                </button>

                <button
                  onClick={() => setStep(6)}
                  className="bg-slate-800 hover:bg-slate-700 rounded-xl p-6 text-left transition border-2 border-transparent hover:border-slate-600"
                >
                  <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center mb-4">
                    <SkipForward className="h-6 w-6 text-slate-400" />
                  </div>
                  <h3 className="text-white font-medium mb-1">Skip for now</h3>
                  <p className="text-slate-400 text-sm">Connect later in settings</p>
                </button>
              </div>
            )}

            {pmTool === "jira" && !pmConnected && (
              <div className="max-w-md mx-auto bg-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <svg className="h-8 w-8" viewBox="0 0 32 32" fill="#2684FF">
                    <path d="M15.967 0.5c-0.6 0-1.167 0.233-1.617 0.683l-12.35 12.35c-0.9 0.9-0.9 2.35 0 3.25l12.35 12.35c0.45 0.45 1.017 0.683 1.617 0.683s1.167-0.233 1.617-0.683l12.35-12.35c0.9-0.9 0.9-2.35 0-3.25l-12.35-12.35c-0.45-0.45-1.017-0.683-1.617-0.683z"/>
                  </svg>
                  <h3 className="text-white font-medium">Connect Jira</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Jira Site URL</label>
                    <input
                      type="url"
                      value={jiraSiteUrl}
                      onChange={(e) => setJiraSiteUrl(e.target.value)}
                      placeholder="https://your-company.atlassian.net"
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={jiraEmail}
                      onChange={(e) => setJiraEmail(e.target.value)}
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
                      value={jiraToken}
                      onChange={(e) => setJiraToken(e.target.value)}
                      placeholder="Your Jira API token"
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                    />
                  </div>

                  {pmError && (
                    <div className="flex items-center gap-2 text-red-400 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      {pmError}
                    </div>
                  )}

                  {pmTestSuccess && (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <CheckCircle className="h-4 w-4" />
                      Connection successful!
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handlePmTest}
                      disabled={pmTesting || !jiraSiteUrl || !jiraEmail || !jiraToken}
                      className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {pmTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                      Test
                    </button>
                    <button
                      onClick={handlePmConnect}
                      disabled={pmConnecting || !pmTestSuccess}
                      className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {pmConnecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                      Connect
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setPmTool(null)}
                  className="w-full mt-4 text-slate-400 hover:text-white text-sm"
                >
                  Back to options
                </button>
              </div>
            )}

            {pmTool === "linear" && !pmConnected && (
              <div className="max-w-md mx-auto bg-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <svg className="h-8 w-8" viewBox="0 0 100 100" fill="#5E6AD2">
                    <path d="M50 0C22.4 0 0 22.4 0 50s22.4 50 50 50 50-22.4 50-50S77.6 0 50 0zm24.9 74.9H25.1V25.1h49.8v49.8z"/>
                  </svg>
                  <h3 className="text-white font-medium">Connect Linear</h3>
                </div>

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
                      value={linearApiKey}
                      onChange={(e) => setLinearApiKey(e.target.value)}
                      placeholder="lin_api_..."
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                    />
                    <p className="text-slate-500 text-xs mt-1">
                      Create a personal API key in Linear Settings &gt; API
                    </p>
                  </div>

                  {pmError && (
                    <div className="flex items-center gap-2 text-red-400 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      {pmError}
                    </div>
                  )}

                  {pmTestSuccess && (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <CheckCircle className="h-4 w-4" />
                      Connection successful!
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handlePmTest}
                      disabled={pmTesting || !linearApiKey}
                      className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {pmTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                      Test
                    </button>
                    <button
                      onClick={handlePmConnect}
                      disabled={pmConnecting || !pmTestSuccess}
                      className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {pmConnecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                      Connect
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setPmTool(null)}
                  className="w-full mt-4 text-slate-400 hover:text-white text-sm"
                >
                  Back to options
                </button>
              </div>
            )}

            {pmConnected && (
              <div className="max-w-md mx-auto text-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
                <h3 className="text-white font-medium mb-2">
                  {pmTool === "jira" ? "Jira" : "Linear"} Connected!
                </h3>
                <p className="text-slate-400 text-sm">Moving to Slack setup...</p>
              </div>
            )}

            {!pmTool && (
              <div className="flex justify-between mt-8 max-w-3xl mx-auto">
                <button
                  onClick={() => setStep(4)}
                  className="px-6 py-2 text-slate-400 hover:text-white transition"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Connect Slack */}
        {step === 6 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-[#4A154B]/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Slack className="h-10 w-10 text-[#E01E5A]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Connect Slack
            </h2>
            <p className="text-slate-300 text-lg mb-8 max-w-lg mx-auto">
              Enable standups, blocker reporting, and task updates directly from Slack.
            </p>

            {!slackConnected ? (
              <div className="space-y-6">
                <div className="bg-slate-800 rounded-xl p-6 max-w-md mx-auto">
                  <h3 className="text-white font-medium mb-4">With Slack you can:</h3>
                  <ul className="text-slate-300 text-left space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      Post daily standups with /standup
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      Report blockers instantly
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      Update task status from Slack
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      Log time against tasks
                    </li>
                  </ul>
                </div>

                <div className="flex flex-col items-center gap-4">
                  {user && (
                    <a
                      href={slackApi.getInstallUrl(user.workspace_id || "", user.id)}
                      className="bg-[#4A154B] hover:bg-[#611f64] text-white px-8 py-3 rounded-lg text-lg font-medium transition flex items-center gap-2"
                    >
                      <Slack className="h-5 w-5" />
                      Add to Slack
                    </a>
                  )}

                  <button
                    onClick={() => setStep(7)}
                    className="text-slate-400 hover:text-white transition flex items-center gap-2"
                  >
                    <SkipForward className="h-4 w-4" />
                    Skip for now
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
                <h3 className="text-white font-medium mb-2">Slack Connected!</h3>
                <button
                  onClick={() => setStep(7)}
                  className="mt-4 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium transition"
                >
                  Continue
                </button>
              </div>
            )}

            <div className="flex justify-center mt-8">
              <button
                onClick={() => setStep(5)}
                className="px-6 py-2 text-slate-400 hover:text-white transition"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Step 7: Complete */}
        {step === 7 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="h-10 w-10 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">
              You&apos;re All Set!
            </h2>
            <p className="text-slate-300 text-lg mb-8 max-w-lg mx-auto">
              Your workspace is configured and ready to go.
              You can always update your integrations in Settings.
            </p>

            <div className="bg-slate-800 rounded-xl p-6 max-w-md mx-auto mb-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Repositories</span>
                  <span className="text-white font-medium">{enabledCount} syncing</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Project Management</span>
                  <span className={pmConnected ? "text-green-400" : "text-slate-500"}>
                    {pmConnected ? (pmTool === "jira" ? "Jira" : "Linear") : "Not connected"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Slack</span>
                  <span className={slackConnected ? "text-green-400" : "text-slate-500"}>
                    {slackConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleComplete}
              className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg text-lg font-medium transition"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
