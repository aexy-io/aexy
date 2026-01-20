"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  FolderGit2,
  Building2,
  RefreshCw,
  Check,
  Lock,
  Globe,
  Search,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";
import { repositoriesApi, Repository, Organization } from "@/lib/api";

export default function ReposSelection() {
  const router = useRouter();
  const { data, updateData, setCurrentStep } = useOnboarding();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set(data.githubRepos));
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCurrentStep(5);
  }, [setCurrentStep]);

  useEffect(() => {
    fetchRepositories();
  }, []);

  const fetchRepositories = async () => {
    setLoading(true);
    try {
      await repositoriesApi.refreshAvailableRepos();
      const [orgs, repos] = await Promise.all([
        repositoriesApi.listOrganizations(),
        repositoriesApi.listRepositories(),
      ]);
      setOrganizations(orgs);
      setRepositories(repos);
    } catch (error) {
      console.error("Failed to fetch repos:", error);
    } finally {
      setLoading(false);
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

  const toggleRepo = (repoId: string) => {
    setSelectedRepos(prev => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  };

  const toggleOrgSelection = (orgId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const orgRepos = repositories.filter(r => r.organization_id === orgId || (orgId === "personal" && !r.organization_id));
    const allSelected = orgRepos.every(r => selectedRepos.has(r.id));

    setSelectedRepos(prev => {
      const next = new Set(prev);
      orgRepos.forEach(repo => {
        if (allSelected) {
          next.delete(repo.id);
        } else {
          next.add(repo.id);
        }
      });
      return next;
    });
  };

  const toggleOrgExpanded = (orgId: string) => {
    setExpandedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  const handleContinue = async () => {
    // Save selected repos to context
    updateData({ githubRepos: Array.from(selectedRepos) });

    // Enable selected repos
    try {
      for (const repoId of selectedRepos) {
        await repositoriesApi.enableRepository(repoId);
      }
    } catch (error) {
      console.error("Failed to enable repos:", error);
    }

    // Navigate to next step
    if (data.connections.google) {
      router.push("/onboarding/gmail-settings");
    } else {
      router.push("/onboarding/invite");
    }
  };

  // Filter repositories by search
  const filteredRepos = repositories.filter(repo =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by organization
  const reposByOrg = filteredRepos.reduce((acc, repo) => {
    const orgId = repo.organization_id || "personal";
    if (!acc[orgId]) {
      acc[orgId] = [];
    }
    acc[orgId].push(repo);
    return acc;
  }, {} as Record<string, Repository[]>);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 5
                ? "w-8 bg-primary-500"
                : "w-4 bg-slate-700"
            }`}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-3">
            Select repositories
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            Choose which repositories to track. We&apos;ll analyze commits,
            PRs, and code reviews to provide insights.
          </p>
        </div>

        {/* Search and refresh */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repositories..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-primary-500/50"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-300 hover:text-white hover:border-slate-600/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Selection summary */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            {selectedRepos.size} of {repositories.length} repositories selected
          </span>
          {selectedRepos.size > 0 && (
            <button
              onClick={() => setSelectedRepos(new Set())}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>

        {/* Repository list */}
        <div className="space-y-6 mb-8 max-h-[400px] overflow-y-auto pr-2">
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 text-slate-500 animate-spin mx-auto mb-4" />
              <p className="text-slate-400">Loading repositories...</p>
            </div>
          ) : Object.keys(reposByOrg).length === 0 ? (
            <div className="text-center py-12 bg-slate-800/30 border border-slate-700/50 rounded-xl">
              <FolderGit2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-2">No repositories found</p>
              <p className="text-sm text-slate-500">
                Make sure you&apos;ve installed the GitHub App on your repositories.
              </p>
            </div>
          ) : (
            Object.entries(reposByOrg).map(([orgId, repos]) => {
              const org = organizations.find(o => o.id === orgId);
              const allSelected = repos.every(r => selectedRepos.has(r.id));
              const someSelected = repos.some(r => selectedRepos.has(r.id));
              const isExpanded = expandedOrgs.has(orgId);
              const orgName = orgId === "personal" ? "Personal" : (org?.name || orgId);

              return (
                <div key={orgId} className="space-y-2">
                  {/* Organization header */}
                  <button
                    onClick={() => toggleOrgExpanded(orgId)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <div
                      onClick={(e) => toggleOrgSelection(orgId, e)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer hover:border-primary-400 ${
                      allSelected
                        ? "bg-primary-500 border-primary-500"
                        : someSelected
                        ? "border-primary-500"
                        : "border-slate-600"
                    }`}>
                      {allSelected && <Check className="w-3 h-3 text-white" />}
                      {someSelected && !allSelected && <div className="w-2 h-2 bg-primary-500 rounded-sm" />}
                    </div>
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-white flex-1 text-left">
                      {orgName}
                    </span>
                    <span className="text-sm text-slate-500">{repos.length} repos</span>
                  </button>

                  {/* Repositories - only show when expanded */}
                  {isExpanded && (
                    <div className="pl-8 space-y-1">
                      {repos.map((repo) => (
                        <button
                          key={repo.id}
                          onClick={() => toggleRepo(repo.id)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/30 transition-colors"
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            selectedRepos.has(repo.id)
                              ? "bg-primary-500 border-primary-500"
                              : "border-slate-600"
                          }`}>
                            {selectedRepos.has(repo.id) && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <FolderGit2 className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-300 flex-1 text-left">{repo.name}</span>
                          {repo.is_private ? (
                            <Lock className="w-3 h-3 text-slate-500" />
                          ) : (
                            <Globe className="w-3 h-3 text-slate-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-800">
          <button
            onClick={() => router.push("/onboarding/connect")}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (data.connections.google) {
                  router.push("/onboarding/gmail-settings");
                } else {
                  router.push("/onboarding/invite");
                }
              }}
              className="text-slate-400 hover:text-white transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleContinue}
              disabled={selectedRepos.size === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                selectedRepos.size > 0
                  ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 shadow-lg shadow-primary-500/25"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
