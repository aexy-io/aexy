"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  GitBranch,
  GraduationCap,
  Layers,
  LogOut,
  Play,
  Plus,
  Settings,
  Target,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useSprints, useActiveSprint } from "@/hooks/useSprints";
import { redirect } from "next/navigation";
import { TeamListItem, SprintListItem } from "@/lib/api";

function TeamSprintCard({ team, workspaceId }: { team: TeamListItem; workspaceId: string }) {
  const { sprints, isLoading } = useSprints(workspaceId, team.id);
  const { sprint: activeSprint } = useActiveSprint(workspaceId, team.id);

  const planningSprints = sprints.filter((s) => s.status === "planning");
  const completedCount = sprints.filter((s) => s.status === "completed").length;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{team.name}</h3>
              <p className="text-slate-400 text-sm">{team.member_count} members</p>
            </div>
          </div>
          <Link
            href={`/sprints/${team.id}`}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
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
                href={`/sprints/${team.id}/${activeSprint.id}`}
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
                href={`/sprints/${team.id}/${planningSprints[0].id}`}
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
                  href={`/sprints/${team.id}`}
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

      <div className="border-t border-slate-700 px-5 py-3 bg-slate-800/50">
        <Link
          href={`/sprints/${team.id}`}
          className="flex items-center justify-between text-sm text-slate-400 hover:text-white transition"
        >
          <span>View all sprints</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
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

  const { teams, isLoading: teamsLoading } = useTeams(currentWorkspaceId);

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <GitBranch className="h-8 w-8 text-primary-500" />
              <span className="text-2xl font-bold text-white">Devograph</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 ml-6">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition"
              >
                Dashboard
              </Link>
              <Link
                href="/sprints"
                className="px-3 py-2 text-white bg-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Sprint Planning
              </Link>
              <Link
                href="/epics"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Layers className="h-4 w-4" />
                Epics
              </Link>
              <Link
                href="/learning"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <GraduationCap className="h-4 w-4" />
                Learning
              </Link>
              <Link
                href="/hiring"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Hiring
              </Link>
              <Link
                href="/settings/repositories"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {user?.avatar_url && (
                <Image
                  src={user.avatar_url}
                  alt={user.name || "User"}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="text-white">{user?.name || user?.email}</span>
            </div>
            <button
              onClick={logout}
              className="text-slate-400 hover:text-white transition"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Sprint Planning</h1>
            <p className="text-slate-400 mt-1">
              Manage sprints across your teams
            </p>
          </div>
          {hasWorkspaces && (
            <Link
              href="/settings/teams"
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
            >
              <Settings className="h-4 w-4" />
              Manage Teams
            </Link>
          )}
        </div>

        {!hasWorkspaces ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
            <Users className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">
              No Workspace Yet
            </h3>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              Create a workspace and add teams to start planning sprints.
            </p>
            <Link
              href="/settings/organization"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
            >
              <Plus className="h-4 w-4" />
              Create Workspace
            </Link>
          </div>
        ) : teamsLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : teams.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
            <Users className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">
              No Teams Yet
            </h3>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              Create teams in your workspace to start planning sprints.
            </p>
            <Link
              href="/settings/teams"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
            >
              <Plus className="h-4 w-4" />
              Create Team
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <TeamSprintCard
                key={team.id}
                team={team}
                workspaceId={currentWorkspaceId!}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
