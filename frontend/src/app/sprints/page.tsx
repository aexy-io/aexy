"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  Layers,
  LayoutGrid,
  ListTodo,
  Map,
  Play,
  Plus,
  Settings,
  Target,
  TrendingUp,
  Users,
  ClipboardCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useSprints, useActiveSprint } from "@/hooks/useSprints";
import { redirect } from "next/navigation";
import { TeamListItem, SprintListItem } from "@/lib/api";
import { EpicsTab } from "./components/EpicsTab";
import { cn } from "@/lib/utils";

function ProjectCard({ project, workspaceId, index }: { project: TeamListItem; workspaceId: string; index: number }) {
  const { sprints, isLoading } = useSprints(workspaceId, project.id);
  const { sprint: activeSprint } = useActiveSprint(workspaceId, project.id);

  const planningSprints = sprints.filter((s) => s.status === "planning");
  const completedCount = sprints.filter((s) => s.status === "completed").length;
  const totalTasks = sprints.reduce((sum, s) => sum + s.tasks_count, 0);
  const completedTasks = sprints.reduce((sum, s) => sum + s.completed_count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group relative"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 to-purple-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-800/80 overflow-hidden hover:border-slate-700/80 transition-all duration-300">
        {/* Header */}
        <div className="p-5 pb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-500/20 to-blue-500/20 rounded-xl flex items-center justify-center border border-primary-500/20">
                <Users className="h-6 w-6 text-primary-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white group-hover:text-primary-400 transition-colors">
                  {project.name}
                </h3>
                <p className="text-slate-500 text-sm">{project.member_count} members</p>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="py-6 flex justify-center">
              <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Active Sprint Card */}
              {activeSprint ? (
                <Link
                  href={`/sprints/${project.id}/board`}
                  className="block bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-4 mb-4 hover:from-green-500/15 hover:to-emerald-500/15 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-green-400 text-xs font-medium uppercase tracking-wider">Active Sprint</span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {activeSprint.tasks_count > 0
                        ? Math.round((activeSprint.completed_count / activeSprint.tasks_count) * 100)
                        : 0}% complete
                    </span>
                  </div>
                  <h4 className="text-white font-medium mb-3">{activeSprint.name}</h4>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${activeSprint.tasks_count > 0
                          ? Math.round((activeSprint.completed_count / activeSprint.tasks_count) * 100)
                          : 0}%`,
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      <CheckCircle className="h-3 w-3 inline mr-1" />
                      {activeSprint.completed_count}/{activeSprint.tasks_count} tasks
                    </span>
                    <span className="text-slate-400">
                      <Target className="h-3 w-3 inline mr-1" />
                      {activeSprint.total_points || 0} points
                    </span>
                  </div>
                </Link>
              ) : planningSprints.length > 0 ? (
                <Link
                  href={`/sprints/${project.id}/board`}
                  className="block bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl p-4 mb-4 hover:from-blue-500/15 hover:to-indigo-500/15 transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-blue-400" />
                    <span className="text-blue-400 text-xs font-medium uppercase tracking-wider">Planning</span>
                  </div>
                  <h4 className="text-white font-medium mb-2">{planningSprints[0].name}</h4>
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
                <div className="bg-slate-800/50 rounded-xl p-4 mb-4 text-center border border-dashed border-slate-700">
                  <p className="text-slate-500 text-sm mb-2">No active sprint</p>
                  <Link
                    href={`/sprints/${project.id}`}
                    className="text-primary-400 text-sm hover:text-primary-300 font-medium"
                  >
                    Create a sprint →
                  </Link>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 bg-slate-800/30 rounded-lg">
                  <div className="text-lg font-semibold text-white">{sprints.length}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Sprints</div>
                </div>
                <div className="text-center p-2 bg-slate-800/30 rounded-lg">
                  <div className="text-lg font-semibold text-green-400">{completedCount}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Completed</div>
                </div>
                <div className="text-center p-2 bg-slate-800/30 rounded-lg">
                  <div className="text-lg font-semibold text-amber-400">{totalTasks - completedTasks}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Open Tasks</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions Footer */}
        <div className="border-t border-slate-800/80 px-4 py-3 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href={`/sprints/${project.id}/board`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs transition-all"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
            </Link>
            <Link
              href={`/sprints/${project.id}/backlog`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs transition-all"
            >
              <ListTodo className="h-3.5 w-3.5" />
              Backlog
            </Link>
          </div>
          <Link
            href={`/sprints/${project.id}/board`}
            className="flex items-center gap-1 text-slate-500 hover:text-white text-xs transition-colors"
          >
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </motion.div>
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900/50 rounded-2xl p-12 text-center border border-slate-800"
      >
        <div className="w-20 h-20 bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Users className="h-10 w-10 text-slate-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No Workspace Yet</h3>
        <p className="text-slate-400 mb-6 max-w-md mx-auto">
          Create a workspace and add projects to start planning sprints.
        </p>
        <Link
          href="/settings/organization"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-500 hover:to-blue-500 text-white rounded-xl transition font-medium shadow-lg shadow-primary-500/20"
        >
          <Plus className="h-4 w-4" />
          Create Workspace
        </Link>
      </motion.div>
    );
  }

  if (teamsLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900/50 rounded-2xl p-12 text-center border border-slate-800"
      >
        <div className="w-20 h-20 bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Layers className="h-10 w-10 text-slate-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No Projects Yet</h3>
        <p className="text-slate-400 mb-6 max-w-md mx-auto">
          Create projects in your workspace to start planning sprints.
        </p>
        <Link
          href="/settings/projects"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-500 hover:to-blue-500 text-white rounded-xl transition font-medium shadow-lg shadow-primary-500/20"
        >
          <Plus className="h-4 w-4" />
          Create Project
        </Link>
      </motion.div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {teams.map((project, index) => (
        <ProjectCard
          key={project.id}
          project={project}
          workspaceId={workspaceId!}
          index={index}
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
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-xl border border-primary-500/20">
              <Calendar className="h-7 w-7 text-primary-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Planning</h1>
              <p className="text-slate-500 text-sm">
                Manage sprints and track progress across your projects
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasWorkspaces && activeTab === "sprints" && (
              <>
                <Link
                  href="/reviews"
                  className="flex items-center gap-2 px-4 py-2 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 rounded-xl transition text-sm"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Team Reviews
                </Link>
                <Link
                  href="/settings/projects"
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition text-sm"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </>
            )}
          </div>
        </motion.div>

        {/* Tab Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 mb-8 p-1 bg-slate-900/50 rounded-xl border border-slate-800 w-fit"
        >
          <button
            onClick={() => setActiveTab("sprints")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === "sprints"
                ? "bg-primary-500 text-white shadow-lg shadow-primary-500/25"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <Calendar className="h-4 w-4" />
            Projects
          </button>
          <button
            onClick={() => setActiveTab("epics")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === "epics"
                ? "bg-primary-500 text-white shadow-lg shadow-primary-500/25"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <Layers className="h-4 w-4" />
            Epics
          </button>
        </motion.div>

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
