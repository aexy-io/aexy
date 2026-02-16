"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronDown,
  ChevronRight,
  Crown,
  FolderKanban,
  MoreVertical,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Target,
  Trash2,
  UserMinus,
  Users,
  Check,
  X,
  ChevronUp,
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useProjects, useProjectMembers } from "@/hooks/useProjects";
import { useRoles } from "@/hooks/useRoles";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Project, ProjectMember, CustomRole, WorkspaceMember } from "@/lib/api";
import { PremiumGate, ProBadge, UpgradeModal } from "@/components/PremiumGate";

function getRoleBadgeColor(roleName: string | null) {
  if (!roleName) return "bg-slate-700 text-slate-400";

  const name = roleName.toLowerCase();
  if (name.includes("admin") || name.includes("owner")) {
    return "bg-amber-900/30 text-amber-400";
  }
  if (name.includes("manager") || name.includes("lead")) {
    return "bg-purple-900/30 text-purple-400";
  }
  if (name.includes("developer") || name.includes("dev")) {
    return "bg-blue-900/30 text-blue-400";
  }
  if (name.includes("viewer") || name.includes("read")) {
    return "bg-slate-700 text-slate-300";
  }
  return "bg-green-900/30 text-green-400";
}

function getStatusBadgeColor(status: Project["status"]) {
  switch (status) {
    case "active":
      return "bg-green-900/30 text-green-400";
    case "on_hold":
      return "bg-amber-900/30 text-amber-400";
    case "completed":
      return "bg-blue-900/30 text-blue-400";
    case "archived":
      return "bg-slate-700 text-slate-400";
    default:
      return "bg-slate-700 text-slate-400";
  }
}

interface ProjectCardProps {
  project: Project;
  workspaceId: string;
  isAdmin: boolean;
  roles: CustomRole[];
  onDelete: (projectId: string) => void;
  canUseProjectFeatures: boolean;
}

function ProjectCard({
  project,
  workspaceId,
  isAdmin,
  roles,
  onDelete,
  canUseProjectFeatures,
}: ProjectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string>("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  const {
    members,
    isLoading: membersLoading,
    addMember,
    updateMember,
    removeMember,
    isAdding,
    isUpdating,
  } = useProjectMembers(expanded ? workspaceId : null, expanded ? project.id : null);

  const { members: workspaceMembers } = useWorkspaceMembers(expanded ? workspaceId : null);

  const handleAddMember = async () => {
    if (!selectedDeveloperId) return;

    try {
      await addMember({
        developer_id: selectedDeveloperId,
        role_id: selectedRoleId || undefined,
      });
      setSelectedDeveloperId("");
      setSelectedRoleId("");
      setShowAddMember(false);
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

  const handleRoleChange = async (developerId: string, roleId: string | null) => {
    if (!canUseProjectFeatures) {
      setShowUpgradeModal(true);
      return;
    }
    try {
      await updateMember({
        developerId,
        data: { role_id: roleId },
      });
      setEditingMemberId(null);
      setEditingRoleId(null);
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  // Filter workspace members who are not already in the project
  const availableMembers = workspaceMembers.filter(
    (wm) => !members.some((pm) => pm.developer_id === wm.developer_id)
  );

  return (
    <div className="bg-slate-800 rounded-xl">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-start gap-3 flex-1 text-left"
          >
            <div className="pt-1">
              {expanded ? (
                <ChevronDown className="h-5 w-5 text-slate-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-slate-400" />
              )}
            </div>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: project.color + "20" }}
            >
              <FolderKanban className="h-5 w-5" style={{ color: project.color }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-medium">{project.name}</span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getStatusBadgeColor(
                    project.status
                  )}`}
                >
                  {project.status.replace("_", " ")}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-yellow-900/30 text-yellow-400`}
                >
                  {project.is_public? 'Public':'Private'}
                </span>
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {project.member_count} members
                {project.team_count > 0 && ` · ${project.team_count} teams`}
              </div>
              {project.description && (
                <p className="text-sm text-slate-500 mt-1 line-clamp-1">{project.description}</p>
              )}
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
                      href={`/settings/projects/${project.id}`}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-600 flex items-center gap-2"
                      onClick={() => setShowMenu(false)}
                    >
                      <Settings className="h-4 w-4" />
                      Project Settings
                    </Link>
                    <Link
                      href={`/settings/projects/${project.id}/permissions`}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-600 flex items-center gap-2"
                      onClick={() => setShowMenu(false)}
                    >
                      <Shield className="h-4 w-4" />
                      Permissions
                    </Link>
                    <button
                      onClick={() => {
                        onDelete(project.id);
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
      </div>

      {expanded && (
        <div className="border-t border-slate-700">
          {membersLoading ? (
            <div className="p-4 text-center text-slate-400">Loading members...</div>
          ) : (
            <>
              {/* Project Members */}
              <div className="divide-y divide-slate-700/50">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-700/30"
                  >
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
                        {member.status === "pending" && (
                          <span className="ml-2 text-xs text-amber-400">(pending)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin ? (
                        editingMemberId === member.developer_id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editingRoleId || ""}
                              onChange={(e) => setEditingRoleId(e.target.value || null)}
                              className="px-2 py-1 text-xs rounded bg-slate-700 text-white border border-slate-600 focus:outline-none focus:border-primary-500"
                            >
                              <option value="">Use org role</option>
                              {roles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() =>
                                handleRoleChange(member.developer_id, editingRoleId)
                              }
                              disabled={isUpdating}
                              className="p-1 text-green-400 hover:bg-slate-600 rounded transition"
                              title="Save"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingMemberId(null);
                                setEditingRoleId(null);
                              }}
                              className="p-1 text-slate-400 hover:bg-slate-600 rounded transition"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (!canUseProjectFeatures) {
                                setShowUpgradeModal(true);
                                return;
                              }
                              setEditingMemberId(member.developer_id);
                              setEditingRoleId(member.role_id);
                            }}
                            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${getRoleBadgeColor(
                              member.role_name
                            )} hover:opacity-80 transition`}
                          >
                            {member.role_name || "Org role"}
                            {canUseProjectFeatures ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <Crown className="h-3 w-3 text-amber-500" />
                            )}
                          </button>
                        )
                      ) : (
                        <span
                          className={`px-2 py-1 rounded text-xs ${getRoleBadgeColor(
                            member.role_name
                          )}`}
                        >
                          {member.role_name || "Member"}
                        </span>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => handleRemoveMember(member.developer_id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition"
                          title="Remove from project"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {members.length === 0 && (
                  <div className="p-4 text-center text-slate-400 text-sm">
                    No members in this project yet
                  </div>
                )}
              </div>

              {/* Add Member */}
              {isAdmin && (
                <div className="p-3 border-t border-slate-700">
                  {showAddMember ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedDeveloperId}
                          onChange={(e) => setSelectedDeveloperId(e.target.value)}
                          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                        >
                          <option value="">Select a member...</option>
                          {availableMembers.map((wm) => (
                            <option key={wm.developer_id} value={wm.developer_id}>
                              {wm.developer_name || wm.developer_email || "Unknown"}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedRoleId}
                          onChange={(e) => setSelectedRoleId(e.target.value)}
                          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                        >
                          <option value="">Use organization role</option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                        {!canUseProjectFeatures && selectedRoleId && (
                          <span title="Pro feature">
                            <Crown className="h-4 w-4 text-amber-500" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleAddMember}
                          disabled={!selectedDeveloperId || isAdding}
                          className="flex-1 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isAdding ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              Add Member
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setShowAddMember(false);
                            setSelectedDeveloperId("");
                            setSelectedRoleId("");
                          }}
                          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (availableMembers.length === 0) {
                          return;
                        }
                        setShowAddMember(true);
                      }}
                      disabled={availableMembers.length === 0}
                      className="w-full px-3 py-2 border border-dashed border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white rounded-lg text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-4 w-4" />
                      {availableMembers.length === 0
                        ? "All workspace members added"
                        : "Add Member"}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Premium Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal feature="team_features" onClose={() => setShowUpgradeModal(false)} />
      )}
    </div>
  );
}

interface CreateProjectModalProps {
  onClose: () => void;
  onCreate: (data: { name: string; description?: string; color?: string }) => Promise<unknown>;
  isCreating: boolean;
}

function CreateProjectModal({ onClose, onCreate, isCreating }: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [error, setError] = useState<string | null>(null);

  const colors = [
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#06b6d4", // cyan
    "#3b82f6", // blue
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
      });
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create project";
      setError(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Create Project</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Frontend Redesign"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                rows={2}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-lg transition ${
                      color === c ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
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

export default function ProjectsSettingsPage() {
  const { user } = useAuth();
  const {
    currentWorkspace,
    currentWorkspaceId,
    currentWorkspaceLoading,
    hasWorkspaces,
  } = useWorkspace();
  const { canUseTeamFeatures } = useSubscription(currentWorkspaceId);

  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspaceId);
  const { roles } = useRoles(currentWorkspaceId);

  const {
    projects,
    isLoading: projectsLoading,
    createProject,
    deleteProject,
    isCreating,
  } = useProjects(currentWorkspaceId);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const currentMember = workspaceMembers.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

  const handleDelete = async (projectId: string) => {
    if (confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      try {
        await deleteProject(projectId);
      } catch (error) {
        console.error("Failed to delete project:", error);
      }
    }
  };

  const isLoading = currentWorkspaceLoading || projectsLoading;

  if (isLoading) {
    return (
      <div className="py-20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Projects</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage projects, members, and permissions</p>
      </div>

      <div>
        {!hasWorkspaces ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center">
            <FolderKanban className="h-16 w-16 text-slate-600 mx-auto mb-4" />
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-slate-400" />
                  Projects in {currentWorkspace?.name}
                </h2>
                <p className="text-slate-400 text-sm">{projects.length} projects</p>
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

            {/* Projects List */}
            {projects.length > 0 ? (
              <div className="space-y-4">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    workspaceId={currentWorkspaceId!}
                    isAdmin={isAdmin}
                    roles={roles}
                    onDelete={handleDelete}
                    canUseProjectFeatures={canUseTeamFeatures}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl p-12 text-center">
                <FolderKanban className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">No Projects Yet</h3>
                <p className="text-slate-400 mb-6">
                  Create your first project to organize your work and manage team access.
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
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createProject}
          isCreating={isCreating}
        />
      )}
    </div>
  );
}
