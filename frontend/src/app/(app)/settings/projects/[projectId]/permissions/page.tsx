"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  FolderKanban,
  Shield,
  Users,
  ChevronDown,
  Check,
  X,
  Crown,
  RefreshCw,
  UserMinus,
  Plus,
  Mail,
  UserPlus,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useProject, useProjectMembers } from "@/hooks/useProjects";
import { useRoles } from "@/hooks/useRoles";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeModal } from "@/components/PremiumGate";
import { ProjectInviteResult } from "@/lib/api";

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

export default function ProjectPermissionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { user } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();
  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspaceId);
  const { project, isLoading: projectLoading } = useProject(currentWorkspaceId, projectId);
  const { roles } = useRoles(currentWorkspaceId);
  const { canUseTeamFeatures } = useSubscription(currentWorkspaceId);

  const {
    members,
    isLoading: membersLoading,
    addMember,
    updateMember,
    removeMember,
    inviteMembers,
    isAdding,
    isUpdating,
    isInviting,
  } = useProjectMembers(currentWorkspaceId, projectId);

  const [showAddMember, setShowAddMember] = useState(false);
  const [addMode, setAddMode] = useState<"workspace" | "email">("workspace");
  const [selectedDeveloperId, setSelectedDeveloperId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [inviteResult, setInviteResult] = useState<ProjectInviteResult | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const currentMember = workspaceMembers.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

  const availableMembers = workspaceMembers.filter(
    (wm) => !members.some((pm) => pm.developer_id === wm.developer_id)
  );

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

  const handleInviteByEmail = async () => {
    if (!emailInput.trim()) return;

    const emails = emailInput
      .split(/[,\n]/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && e.includes("@"));

    if (emails.length === 0) return;

    try {
      const result = await inviteMembers({
        emails,
        role_id: selectedRoleId || undefined,
      });
      setInviteResult(result);
      setEmailInput("");
      if (result.invited.length > 0 && result.failed.length === 0) {
        setTimeout(() => {
          setInviteResult(null);
          setShowAddMember(false);
          setSelectedRoleId("");
        }, 3000);
      }
    } catch (error) {
      console.error("Failed to invite members:", error);
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
    if (!canUseTeamFeatures) {
      setShowUpgradeModal(true);
      return;
    }
    try {
      await updateMember({
        developerId,
        data: { role_id: roleId || null },
      });
      setEditingMemberId(null);
      setEditingRoleId(null);
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  const isLoading = currentWorkspaceLoading || projectLoading || membersLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading permissions...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <FolderKanban className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">Project Not Found</h3>
          <p className="text-slate-400 mb-6">
            The project you're looking for doesn't exist.
          </p>
          <Link
            href="/settings/projects"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/settings/projects"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3 flex-1">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: project.color + "20" }}
              >
                <FolderKanban className="h-5 w-5" style={{ color: project.color }} />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">{project.name}</h1>
                <p className="text-slate-400 text-sm">Permissions & Members</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-8">
          <Link
            href={`/settings/projects/${projectId}`}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition"
          >
            General
          </Link>
          <Link
            href={`/settings/projects/${projectId}/permissions`}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Shield className="h-4 w-4" />
            Permissions
          </Link>
        </div>

        {/* Members Section */}
        <div className="bg-slate-800 rounded-xl">
          <div className="p-4 border-b border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-medium text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-slate-400" />
                Project Members
              </h2>
              <span className="text-sm text-slate-400">{members.length} members</span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Assign project-specific roles to override organization roles
            </p>
          </div>

          {/* Members List */}
          <div className="divide-y divide-slate-700/50">
            {members.map((member) => (
              <div
                key={member.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-700/30"
              >
                <div className="flex items-center gap-3">
                  {member.developer_avatar_url ? (
                    <Image
                      src={member.developer_avatar_url}
                      alt={member.developer_name || "Member"}
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
                      <Users className="h-5 w-5 text-slate-400" />
                    </div>
                  )}
                  <div>
                    <span className="text-white font-medium">
                      {member.developer_name || member.developer_email || "Unknown"}
                    </span>
                    {member.developer_email && member.developer_name && (
                      <p className="text-sm text-slate-400">{member.developer_email}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isAdmin ? (
                    editingMemberId === member.developer_id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editingRoleId || ""}
                          onChange={(e) => setEditingRoleId(e.target.value || null)}
                          className="px-3 py-1.5 text-sm rounded bg-slate-700 text-white border border-slate-600 focus:outline-none focus:border-primary-500"
                        >
                          <option value="">Use org role (inherited)</option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleRoleChange(member.developer_id, editingRoleId)}
                          disabled={isUpdating}
                          className="p-1.5 text-green-400 hover:bg-slate-600 rounded transition"
                          title="Save"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingMemberId(null);
                            setEditingRoleId(null);
                          }}
                          className="p-1.5 text-slate-400 hover:bg-slate-600 rounded transition"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (!canUseTeamFeatures) {
                            setShowUpgradeModal(true);
                            return;
                          }
                          setEditingMemberId(member.developer_id);
                          setEditingRoleId(member.role_id);
                        }}
                        className={`px-3 py-1.5 text-sm rounded flex items-center gap-2 ${getRoleBadgeColor(
                          member.role_name
                        )} hover:opacity-80 transition`}
                      >
                        {member.role_name || "Org role"}
                        {canUseTeamFeatures ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <Crown className="h-3 w-3 text-amber-500" />
                        )}
                      </button>
                    )
                  ) : (
                    <span
                      className={`px-3 py-1.5 rounded text-sm ${getRoleBadgeColor(
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
              <div className="p-8 text-center text-slate-400">
                No members in this project yet
              </div>
            )}
          </div>

          {/* Add Member */}
          {isAdmin && (
            <div className="p-4 border-t border-slate-700">
              {showAddMember ? (
                <div className="space-y-4">
                  {/* Mode Tabs */}
                  <div className="flex gap-2 p-1 bg-slate-700/50 rounded-lg">
                    <button
                      onClick={() => {
                        setAddMode("workspace");
                        setInviteResult(null);
                      }}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition flex items-center justify-center gap-2 ${
                        addMode === "workspace"
                          ? "bg-slate-600 text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <UserPlus className="h-4 w-4" />
                      Workspace Members
                    </button>
                    <button
                      onClick={() => {
                        setAddMode("email");
                        setInviteResult(null);
                      }}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition flex items-center justify-center gap-2 ${
                        addMode === "email"
                          ? "bg-slate-600 text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Mail className="h-4 w-4" />
                      Invite by Email
                    </button>
                  </div>

                  {addMode === "workspace" ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Member</label>
                          <select
                            value={selectedDeveloperId}
                            onChange={(e) => setSelectedDeveloperId(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                          >
                            <option value="">Select member...</option>
                            {availableMembers.map((wm) => (
                              <option key={wm.developer_id} value={wm.developer_id}>
                                {wm.developer_name || wm.developer_email || "Unknown"}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            Project Role (optional)
                          </label>
                          <select
                            value={selectedRoleId}
                            onChange={(e) => setSelectedRoleId(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                          >
                            <option value="">Use organization role</option>
                            {roles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleAddMember}
                          disabled={!selectedDeveloperId || isAdding}
                          className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
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
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            Email addresses (comma or newline separated)
                          </label>
                          <textarea
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="user@example.com, another@example.com"
                            rows={3}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500 placeholder:text-slate-500 resize-none"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Users will be added as guests if not already in the workspace
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            Project Role (optional)
                          </label>
                          <select
                            value={selectedRoleId}
                            onChange={(e) => setSelectedRoleId(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                          >
                            <option value="">Use default role</option>
                            {roles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Invite Result */}
                      {inviteResult && (
                        <div className="space-y-2">
                          {inviteResult.invited.length > 0 && (
                            <div className="flex items-start gap-2 p-3 bg-green-900/20 border border-green-800/50 rounded-lg">
                              <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm text-green-400 font-medium">
                                  Successfully invited {inviteResult.invited.length} member(s)
                                </p>
                                <p className="text-xs text-green-400/70 mt-1">
                                  {inviteResult.invited.join(", ")}
                                </p>
                              </div>
                            </div>
                          )}
                          {inviteResult.already_members.length > 0 && (
                            <div className="flex items-start gap-2 p-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                              <Users className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm text-slate-300">
                                  Already members: {inviteResult.already_members.length}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                  {inviteResult.already_members.join(", ")}
                                </p>
                              </div>
                            </div>
                          )}
                          {inviteResult.failed.length > 0 && (
                            <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
                              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm text-red-400 font-medium">
                                  Failed to invite {inviteResult.failed.length} user(s)
                                </p>
                                <ul className="text-xs text-red-400/70 mt-1 space-y-1">
                                  {inviteResult.failed.map((f, i) => (
                                    <li key={i}>
                                      {f.email}: {f.reason}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleInviteByEmail}
                          disabled={!emailInput.trim() || isInviting}
                          className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isInviting ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Inviting...
                            </>
                          ) : (
                            <>
                              <Mail className="h-4 w-4" />
                              Send Invites
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setShowAddMember(false);
                            setEmailInput("");
                            setSelectedRoleId("");
                            setInviteResult(null);
                          }}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowAddMember(true)}
                  className="w-full px-4 py-2 border border-dashed border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white rounded-lg text-sm transition flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Member
                </button>
              )}
            </div>
          )}
        </div>

        {/* Roles Info */}
        <div className="bg-slate-800 rounded-xl p-6 mt-6">
          <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-400" />
            About Project Roles
          </h2>
          <div className="space-y-3 text-sm text-slate-400">
            <p>
              Project-specific roles allow you to grant different permissions within this
              project than a member has at the organization level.
            </p>
            <p>
              <strong className="text-white">Inheritance:</strong> If no project role is
              assigned, the member uses their organization role permissions.
            </p>
            <p>
              <strong className="text-white">Override:</strong> When a project role is
              assigned, it completely replaces the organization role for this project only.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700">
            <Link
              href="/settings/organization/roles"
              className="text-sm text-primary-400 hover:text-primary-300 transition"
            >
              Manage organization roles →
            </Link>
          </div>
        </div>
      </main>

      {/* Premium Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal feature="team_features" onClose={() => setShowUpgradeModal(false)} />
      )}
    </div>
  );
}
