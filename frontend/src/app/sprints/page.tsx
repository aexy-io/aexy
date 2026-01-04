"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  Layers,
  Play,
  Plus,
  Settings,
  Target,
  Users,
  ClipboardCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useSprints, useActiveSprint } from "@/hooks/useSprints";
import { redirect } from "next/navigation";
import { TeamListItem, SprintListItem } from "@/lib/api";
import { EpicsTab } from "./components/EpicsTab";

function ProjectSprintCard({ project, workspaceId }: { project: TeamListItem; workspaceId: string }) {
  const { sprints, isLoading } = useSprints(workspaceId, project.id);
  const { sprint: activeSprint } = useActiveSprint(workspaceId, project.id);

  const planningSprints = sprints.filter((s) => s.status === "planning");
  const completedCount = sprints.filter((s) => s.status === "completed").length;

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden hover:border-slate-700 transition group">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-500/10 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-primary-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{project.name}</h3>
              <p className="text-slate-400 text-sm">{project.member_count} members</p>
            </div>
          </div>
          <Link
            href={`/sprints/${project.id}`}
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition group-hover:text-slate-400"
          >
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="py-4 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <>
            {/* Active Sprint */}
            {activeSprint ? (
              <Link
                href={`/sprints/${project.id}/${activeSprint.id}`}
                className="block bg-green-900/20 border border-green-800/50 rounded-lg p-4 mb-3 hover:bg-green-900/30 transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Play className="h-4 w-4 text-green-400" />
                  <span className="text-green-400 text-sm font-medium">Active Sprint</span>
                </div>
                <h4 className="text-white font-medium mb-1">{activeSprint.name}</h4>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {activeSprint.completed_count}/{activeSprint.tasks_count} tasks
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    {activeSprint.total_points || 0} points
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{
                      width: `${activeSprint.tasks_count > 0
                        ? Math.round((activeSprint.completed_count / activeSprint.tasks_count) * 100)
                        : 0}%`,
                    }}
                  />
                </div>
              </Link>
            ) : planningSprints.length > 0 ? (
              <Link
                href={`/sprints/${project.id}/${planningSprints[0].id}`}
                className="block bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 mb-3 hover:bg-blue-900/30 transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-blue-400" />
                  <span className="text-blue-400 text-sm font-medium">Planning</span>
                </div>
                <h4 className="text-white font-medium mb-1">{planningSprints[0].name}</h4>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {planningSprints[0].start_date
                      ? new Date(planningSprints[0].start_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "Not scheduled"}
                  </span>
                </div>
              </Link>
            ) : (
              <div className="bg-slate-700/30 rounded-lg p-4 mb-3 text-center">
                <p className="text-slate-400 text-sm mb-2">No active sprint</p>
                <Link
                  href={`/sprints/${project.id}`}
                  className="text-primary-400 text-sm hover:underline"
                >
                  Create a sprint
                </Link>
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>{sprints.length} total sprints</span>
              <span>{completedCount} completed</span>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-slate-800 px-5 py-3 bg-slate-900/30">
        <Link
          href={`/sprints/${project.id}`}
          className="flex items-center justify-between text-sm text-slate-400 hover:text-white transition"
        >
          <span>View all sprints</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

// Sprints content component
function SprintsContent({ teams, teamsLoading, workspaceId, hasWorkspaces }: {
  teams: TeamListItem[];
  teamsLoading: boolean;
  workspaceId: string | null;
  hasWorkspaces: boolean;
}) {
  if (!hasWorkspaces) {
    return (
      <div className="bg-slate-900/50 rounded-xl p-12 text-center border border-slate-800">
        <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Users className="h-10 w-10 text-slate-600" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No Workspace Yet</h3>
        <p className="text-slate-400 mb-6 max-w-md mx-auto">
          Create a workspace and add projects to start planning sprints.
        </p>
        <Link
          href="/settings/organization"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium shadow-lg shadow-primary-500/20"
        >
          <Plus className="h-4 w-4" />
          Create Workspace
        </Link>
      </div>
    );
  }

  if (teamsLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="relative">
          <div className="w-10 h-10 border-4 border-primary-500/20 rounded-full"></div>
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="bg-slate-900/50 rounded-xl p-12 text-center border border-slate-800">
        <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Users className="h-10 w-10 text-slate-600" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No Projects Yet</h3>
        <p className="text-slate-400 mb-6 max-w-md mx-auto">
          Create projects in your workspace to start planning sprints.
        </p>
        <Link
          href="/settings/projects"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium shadow-lg shadow-primary-500/20"
        >
          <Plus className="h-4 w-4" />
          Create Project
        </Link>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {teams.map((project) => (
        <ProjectSprintCard
          key={project.id}
          project={project}
          workspaceId={workspaceId!}
        />
      ))}
    </div>
  );
}

export default function SprintsPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const {
    currentWorkspaceId,
    currentWorkspace,
    currentWorkspaceLoading,
    hasWorkspaces,
  } = useWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeTab = searchParams.get("tab") || "sprints";
  const { teams, isLoading: teamsLoading } = useTeams(currentWorkspaceId);

  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "sprints") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    router.push(`/sprints${params.toString() ? `?${params.toString()}` : ""}`);
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-primary-500/20 to-blue-500/20 rounded-xl">
              <Calendar className="h-7 w-7 text-primary-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Planning</h1>
              <p className="text-slate-400 text-sm">
                Manage sprints and epics across your projects
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasWorkspaces && activeTab === "sprints" && (
              <>
                <Link
                  href="/reviews"
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 border border-teal-600/30 rounded-lg transition text-sm"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Team Reviews
                </Link>
                <Link
                  href="/settings/projects"
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
                >
                  <Settings className="h-4 w-4" />
                  Manage Projects
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 mb-8 border-b border-slate-800">
          <button
            onClick={() => setActiveTab("sprints")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === "sprints"
                ? "text-primary-400 border-primary-500"
                : "text-slate-400 border-transparent hover:text-white hover:border-slate-600"
            }`}
          >
            <Calendar className="h-4 w-4" />
            Sprints
          </button>
          <button
            onClick={() => setActiveTab("epics")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === "epics"
                ? "text-primary-400 border-primary-500"
                : "text-slate-400 border-transparent hover:text-white hover:border-slate-600"
            }`}
          >
            <Layers className="h-4 w-4" />
            Epics
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "sprints" ? (
          <SprintsContent
            teams={teams}
            teamsLoading={teamsLoading}
            workspaceId={currentWorkspaceId}
            hasWorkspaces={hasWorkspaces}
          />
        ) : (
          <EpicsTab
            workspaceId={currentWorkspaceId}
            hasWorkspaces={hasWorkspaces}
          />
        )}
      </main>
    </div>
  );
}
