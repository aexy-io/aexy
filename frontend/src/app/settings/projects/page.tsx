"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  MoreVertical,
  Plus,
  RefreshCw,
  Settings,
  Target,
  Trash2,
  UserMinus,
  Users,
  Zap,
  Check,
  GitBranch,
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useTeams, useTeamMembers } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";
import { TeamListItem, TeamMember, WorkspaceMember, repositoriesApi, Repository } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const TEAM_ROLE_OPTIONS = [
  { value: "lead", label: "Project Lead", description: "Can manage project members" },
  { value: "member", label: "Member", description: "Regular project member" },
];

function getRoleBadgeColor(role: string) {
  switch (role) {
    case "lead":
      return "bg-amber-900/30 text-amber-400";
    case "member":
      return "bg-blue-900/30 text-blue-400";
    default:
      return "bg-slate-700 text-slate-400";
  }
}

function getTypeBadgeColor(type: string) {
  switch (type) {
    case "repo_based":
      return "bg-purple-900/30 text-purple-400";
    case "manual":
      return "bg-blue-900/30 text-blue-400";
    default:
      return "bg-slate-700 text-slate-400";
  }
}

interface TeamCardProps {
  team: TeamListItem;
  workspaceId: string;
  isAdmin: boolean;
  onDelete: (teamId: string) => void;
}

function TeamCard({ team, workspaceId, isAdmin, onDelete }: TeamCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const { members, isLoading: membersLoading, addMember, removeMember } = useTeamMembers(
    expanded ? workspaceId : null,
    expanded ? team.id : null
  );
  const { members: workspaceMembers } = useWorkspaceMembers(expanded ? workspaceId : null);

  const handleAddMember = async (developerId: string) => {
    try {
      await addMember({ developerId, role: "member" });
    } catch (error) {
      console.error("Failed to add member:", error);
    }
  };

  const handleRemoveMember = async (developerId: string) => {
    if (confirm("Remove this member from the project?")) {
      try {
        await removeMember(developerId);
      } catch (error) {
        console.error("Failed to remove member:", error);
      }
    }
  };

  // Filter workspace members who are not already in the team
  const availableMembers = workspaceMembers.filter(
    (wm) => !members.some((tm) => tm.developer_id === wm.developer_id)
  );

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
          )}
          <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <Users className="h-5 w-5 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{team.name}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeBadgeColor(team.type)}`}>
                {team.type === "repo_based" ? "Repo-based" : "Manual"}
              </span>
            </div>
            <p className="text-slate-400 text-sm">{team.member_count} members</p>
          </div>
        </button>
        {isAdmin && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-slate-700 rounded-lg shadow-xl z-20 py-1">
                  <Link
                    href={`/sprints/${team.id}`}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-600 flex items-center gap-2"
                    onClick={() => setShowMenu(false)}
                  >
                    <Target className="h-4 w-4" />
                    Sprint Planning
                  </Link>
                  {team.type === "repo_based" && (
                    <button
                      onClick={() => {
                        // TODO: Implement sync
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-600 flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Sync Members
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onDelete(team.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-600 flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Project
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-700">
          {membersLoading ? (
            <div className="p-4 text-center text-slate-400">Loading members...</div>
          ) : (
            <>
              {/* Team Members */}
              <div className="divide-y divide-slate-700/50">
                {members.map((member) => (
                  <div key={member.id} className="p-3 px-4 flex items-center justify-between hover:bg-slate-700/30">
                    <div className="flex items-center gap-3">
                      {member.developer_avatar_url ? (
                        <Image
                          src={member.developer_avatar_url}
                          alt={member.developer_name || "Member"}
                          width={32}
                          height={32}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                          <Users className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <span className="text-white text-sm">
                          {member.developer_name || member.developer_email || "Unknown"}
                        </span>
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${getRoleBadgeColor(member.role)}`}>
                          {member.role}
                        </span>
                        {member.source === "repo_contributor" && (
                          <span className="ml-1 text-xs text-slate-500">(auto)</span>
                        )}
                      </div>
                    </div>
                    {isAdmin && member.source === "manual" && (
                      <button
                        onClick={() => handleRemoveMember(member.developer_id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition"
                        title="Remove from team"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {members.length === 0 && (
                  <div className="p-4 text-center text-slate-400 text-sm">
                    No members in this project yet
                  </div>
                )}
              </div>

              {/* Add Member (for manual teams) */}
              {isAdmin && team.type === "manual" && availableMembers.length > 0 && (
                <div className="p-3 border-t border-slate-700">
                  <div className="flex items-center gap-2">
                    <select
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddMember(e.target.value);
                          e.target.value = "";
                        }
                      }}
                    >
                      <option value="">Add a member...</option>
                      {availableMembers.map((wm) => (
                        <option key={wm.developer_id} value={wm.developer_id}>
                          {wm.developer_name || wm.developer_email || "Unknown"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface CreateTeamModalProps {
  onClose: () => void;
  onCreate: (data: { name: string; description?: string; type?: string; source_repository_ids?: string[] }) => Promise<unknown>;
  onCreateFromRepo: (data: { repository_id: string; team_name?: string }) => Promise<unknown>;
  isCreating: boolean;
  repositories: Repository[];
}

function CreateTeamModal({ onClose, onCreate, onCreateFromRepo, isCreating, repositories }: CreateTeamModalProps) {
  const [mode, setMode] = useState<"manual" | "repo">("manual");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (mode === "manual") {
        if (!name.trim()) {
          setError("Team name is required");
          return;
        }
        await onCreate({
          name: name.trim(),
          description: description.trim() || undefined,
          type: "manual",
        });
      } else {
        if (!selectedRepoId) {
          setError("Please select a repository");
          return;
        }
        await onCreateFromRepo({
          repository_id: selectedRepoId,
          team_name: name.trim() || undefined,
        });
      }
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create team";
      setError(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Create Project</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Mode Selection */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">Project Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className={`p-3 rounded-lg border text-left transition ${
                    mode === "manual"
                      ? "border-primary-500 bg-primary-900/20"
                      : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  <Users className="h-5 w-5 text-slate-400 mb-1" />
                  <div className="text-white font-medium text-sm">Manual</div>
                  <div className="text-slate-400 text-xs">Add members manually</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("repo")}
                  className={`p-3 rounded-lg border text-left transition ${
                    mode === "repo"
                      ? "border-primary-500 bg-primary-900/20"
                      : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  <GitBranch className="h-5 w-5 text-slate-400 mb-1" />
                  <div className="text-white font-medium text-sm">From Repository</div>
                  <div className="text-slate-400 text-xs">Auto-add contributors</div>
                </button>
              </div>
            </div>

            {mode === "manual" ? (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Project Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Frontend Project"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Description (optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this team work on?"
                    rows={2}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Repository</label>
                  <select
                    value={selectedRepoId}
                    onChange={(e) => setSelectedRepoId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="">Select a repository...</option>
                    {repositories.filter(r => r.is_enabled).map((repo) => (
                      <option key={repo.id} value={repo.id}>
                        {repo.full_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-slate-500 text-xs mt-1">
                    Contributors from the last 90 days will be added as members
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Project Name (optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Defaults to: repo name + Project"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </>
            )}

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamsSettingsPage() {
  const { user } = useAuth();
  const {
    currentWorkspace,
    currentWorkspaceId,
    currentWorkspaceLoading,
    hasWorkspaces,
  } = useWorkspace();

  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspaceId);

  const {
    teams,
    isLoading: teamsLoading,
    createTeam,
    createFromRepository,
    deleteTeam,
    isCreating,
  } = useTeams(currentWorkspaceId);

  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch repositories for create-from-repo
  const { data: repositories = [] } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => repositoriesApi.listRepositories({ enabled_only: true }),
    enabled: showCreateModal,
  });

  const currentMember = workspaceMembers.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

  const handleDelete = async (teamId: string) => {
    if (confirm("Are you sure you want to delete this project?")) {
      try {
        await deleteTeam(teamId);
      } catch (error) {
        console.error("Failed to delete team:", error);
      }
    }
  };

  const isLoading = currentWorkspaceLoading || teamsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading projects...</p>
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
                <h1 className="text-xl font-semibold text-white">Project Settings</h1>
                <p className="text-slate-400 text-sm">
                  Manage projects within your workspace
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!hasWorkspaces ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center">
            <Users className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No Workspace</h3>
            <p className="text-slate-400 mb-6">
              Create a workspace first to start managing projects.
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
            {/* Header with Actions */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-slate-400" />
                  Projects in {currentWorkspace?.name}
                </h2>
                <p className="text-slate-400 text-sm">{teams.length} projects</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Create Project
                </button>
              )}
            </div>

            {/* Teams List */}
            {teams.length > 0 ? (
              <div className="space-y-4">
                {teams.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    workspaceId={currentWorkspaceId!}
                    isAdmin={isAdmin}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl p-12 text-center">
                <Users className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">No Projects Yet</h3>
                <p className="text-slate-400 mb-6">
                  Create your first project to organize your developers.
                </p>
                {isAdmin && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Create Project
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Modals */}
      {showCreateModal && (
        <CreateTeamModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createTeam}
          onCreateFromRepo={createFromRepository}
          isCreating={isCreating}
          repositories={repositories}
        />
      )}
    </div>
  );
}
