"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  FolderKanban,
  Users,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import {
  insightsApi,
  InsightsPeriodType,
  TeamInsightsResponse,
  Project,
} from "@/lib/api";

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

interface ProjectWithInsights {
  project: Project;
  insights: TeamInsightsResponse | null;
  loading: boolean;
}

export default function AllocationsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set()
  );
  const [projectData, setProjectData] = useState<
    Map<string, ProjectWithInsights>
  >(new Map());

  const { projects, isLoading: projectsLoading } = useProjects(
    currentWorkspaceId,
    "active"
  );

  // Build a cross-project developer map
  const developerProjects = new Map<
    string,
    { projectId: string; projectName: string; commits: number; prs: number; reviews: number; lines: number; developerName: string }[]
  >();

  projectData.forEach((pd) => {
    if (!pd.insights) return;
    const members = pd.insights.distribution?.member_metrics ?? [];
    members.forEach((m) => {
      const existing = developerProjects.get(m.developer_id) || [];
      existing.push({
        projectId: pd.project.id,
        projectName: pd.project.name,
        commits: m.commits_count,
        prs: m.prs_merged,
        reviews: m.reviews_given,
        lines: m.lines_changed,
        developerName: m.developer_name || m.developer_id.slice(0, 8),
      });
      developerProjects.set(m.developer_id, existing);
    });
  });

  // Fetch insights for expanded projects
  useEffect(() => {
    if (!currentWorkspaceId) return;

    expandedProjects.forEach(async (projectId) => {
      const existing = projectData.get(projectId);
      if (existing?.insights || existing?.loading) return;

      setProjectData((prev) => {
        const next = new Map(prev);
        const entry = next.get(projectId);
        if (entry) next.set(projectId, { ...entry, loading: true });
        return next;
      });

      try {
        const insights = await insightsApi.getProjectInsights(
          currentWorkspaceId,
          projectId,
          { period_type: periodType }
        );
        setProjectData((prev) => {
          const next = new Map(prev);
          const entry = next.get(projectId);
          if (entry)
            next.set(projectId, { ...entry, insights, loading: false });
          return next;
        });
      } catch {
        setProjectData((prev) => {
          const next = new Map(prev);
          const entry = next.get(projectId);
          if (entry) next.set(projectId, { ...entry, loading: false });
          return next;
        });
      }
    });
  }, [expandedProjects, currentWorkspaceId, periodType]);

  // Initialize project data when projects load
  useEffect(() => {
    if (!projects.length) return;
    setProjectData((prev) => {
      const next = new Map(prev);
      projects.forEach((p) => {
        if (!next.has(p.id)) {
          next.set(p.id, { project: p, insights: null, loading: false });
        }
      });
      return next;
    });
  }, [projects]);

  // Reset insights when period changes
  useEffect(() => {
    setProjectData((prev) => {
      const next = new Map(prev);
      next.forEach((v, k) => {
        next.set(k, { ...v, insights: null, loading: false });
      });
      return next;
    });
  }, [periodType]);

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  // Developers on multiple projects
  const multiProjectDevs = Array.from(developerProjects.entries()).filter(
    ([, projs]) => projs.length > 1
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/insights"
              className="text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FolderKanban className="h-6 w-6 text-indigo-400" />
              Project Allocations
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            Developer allocation across projects with activity-based utilization
          </p>
        </div>
        <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriodType(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                periodType === opt.value
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban className="h-4 w-4 text-indigo-400" />
            <span className="text-xs text-slate-400">Active Projects</span>
          </div>
          <div className="text-xl font-bold text-white">{projects.length}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-slate-400">Total Members</span>
          </div>
          <div className="text-xl font-bold text-white">
            {projects.reduce((sum, p) => sum + p.member_count, 0)}
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-slate-400">Multi-Project Devs</span>
          </div>
          <div className="text-xl font-bold text-white">
            {multiProjectDevs.length}
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban className="h-4 w-4 text-green-400" />
            <span className="text-xs text-slate-400">Avg Members/Project</span>
          </div>
          <div className="text-xl font-bold text-white">
            {projects.length
              ? (
                  projects.reduce((s, p) => s + p.member_count, 0) /
                  projects.length
                ).toFixed(1)
              : 0}
          </div>
        </div>
      </div>

      {/* Project List */}
      {projectsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-slate-800 rounded-xl p-4 border border-slate-700 animate-pulse h-16"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <p className="text-slate-400">No active projects found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const isExpanded = expandedProjects.has(project.id);
            const pd = projectData.get(project.id);
            const insights = pd?.insights;
            const loading = pd?.loading;
            const members = insights?.distribution?.member_metrics ?? [];
            const totalActivity = members.reduce(
              (s, m) =>
                s + m.commits_count + m.prs_merged + m.reviews_given,
              0
            );

            return (
              <div
                key={project.id}
                className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
              >
                {/* Project Header */}
                <button
                  onClick={() => toggleProject(project.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: project.color || "#6366f1" }}
                    />
                    <span className="text-white font-medium">
                      {project.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {project.member_count} member
                      {project.member_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {insights && (
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <GitCommit className="h-3 w-3" />
                        {insights.aggregate.total_commits}
                      </span>
                      <span className="flex items-center gap-1">
                        <GitPullRequest className="h-3 w-3" />
                        {insights.aggregate.total_prs_merged}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {insights.aggregate.total_reviews}
                      </span>
                    </div>
                  )}
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-6 pb-4 border-t border-slate-700/50">
                    {loading ? (
                      <div className="py-4 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-8 bg-slate-700 rounded animate-pulse"
                          />
                        ))}
                      </div>
                    ) : members.length > 0 ? (
                      <table className="w-full min-w-[600px] mt-3">
                        <thead>
                          <tr className="text-left text-xs text-slate-400 border-b border-slate-700/50">
                            <th className="pb-2 font-medium">Developer</th>
                            <th className="pb-2 font-medium text-right">
                              Commits
                            </th>
                            <th className="pb-2 font-medium text-right">
                              PRs
                            </th>
                            <th className="pb-2 font-medium text-right">
                              Reviews
                            </th>
                            <th className="pb-2 font-medium text-right">
                              Lines
                            </th>
                            <th className="pb-2 font-medium text-right">
                              Activity Share
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {members
                            .sort(
                              (a, b) =>
                                b.commits_count +
                                b.prs_merged +
                                b.reviews_given -
                                (a.commits_count +
                                  a.prs_merged +
                                  a.reviews_given)
                            )
                            .map((m) => {
                              const devActivity =
                                m.commits_count +
                                m.prs_merged +
                                m.reviews_given;
                              const share = totalActivity
                                ? (devActivity / totalActivity) * 100
                                : 0;
                              const isMultiProject =
                                developerProjects.has(m.developer_id) &&
                                (developerProjects.get(m.developer_id)
                                  ?.length ?? 0) > 1;

                              return (
                                <tr
                                  key={m.developer_id}
                                  className="border-b border-slate-700/30 hover:bg-slate-700/20 transition"
                                >
                                  <td className="py-2">
                                    <div className="flex items-center gap-2">
                                      <Link
                                        href={`/insights/developers/${m.developer_id}`}
                                        className="text-sm text-white hover:text-indigo-300"
                                      >
                                        {m.developer_name || m.developer_id.slice(0, 8)}
                                      </Link>
                                      {isMultiProject && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                                          multi-project
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 text-right text-sm text-slate-300 font-mono">
                                    {m.commits_count}
                                  </td>
                                  <td className="py-2 text-right text-sm text-slate-300 font-mono">
                                    {m.prs_merged}
                                  </td>
                                  <td className="py-2 text-right text-sm text-slate-300 font-mono">
                                    {m.reviews_given}
                                  </td>
                                  <td className="py-2 text-right text-sm text-slate-300 font-mono">
                                    {formatNumber(m.lines_changed)}
                                  </td>
                                  <td className="py-2 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-indigo-500 rounded-full"
                                          style={{
                                            width: `${Math.min(share, 100)}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="text-xs text-slate-400 w-10 text-right">
                                        {share.toFixed(0)}%
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="py-4 text-sm text-slate-500 text-center">
                        No activity data for this period
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Multi-Project Developers */}
      {multiProjectDevs.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">
              Cross-Project Developers
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Developers contributing to multiple projects in this period
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                  <th className="px-6 py-3 font-medium">Developer</th>
                  <th className="px-6 py-3 font-medium">Projects</th>
                  <th className="px-6 py-3 font-medium text-right">
                    Total Commits
                  </th>
                  <th className="px-6 py-3 font-medium text-right">
                    Total PRs
                  </th>
                </tr>
              </thead>
              <tbody>
                {multiProjectDevs
                  .sort(
                    (a, b) =>
                      b[1].reduce((s, p) => s + p.commits, 0) -
                      a[1].reduce((s, p) => s + p.commits, 0)
                  )
                  .map(([devId, projs]) => (
                    <tr
                      key={devId}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 transition"
                    >
                      <td className="px-6 py-3">
                        <Link
                          href={`/insights/developers/${devId}`}
                          className="text-sm text-white hover:text-indigo-300"
                        >
                          {projs[0]?.developerName || devId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {projs.map((p) => (
                            <span
                              key={p.projectId}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300"
                            >
                              {p.projectName}
                              <span className="ml-1 text-slate-500">
                                ({p.commits}c)
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right text-sm text-slate-300 font-mono">
                        {projs.reduce((s, p) => s + p.commits, 0)}
                      </td>
                      <td className="px-6 py-3 text-right text-sm text-slate-300 font-mono">
                        {projs.reduce((s, p) => s + p.prs, 0)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
