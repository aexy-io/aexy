"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  CreditCard,
  FolderKanban,
  Mail,
  MoreVertical,
  Plus,
  Settings,
  Shield,
  Trash2,
  UserMinus,
  Users,
  Link as LinkIcon,
  RefreshCw,
  Check,
  Clock,
  X,
  ToggleLeft,
  ToggleRight,
  Layers,
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers, useWorkspaceBilling, usePendingInvites, useWorkspaceAppSettings } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { WorkspaceMember, WorkspacePendingInvite, repositoriesApi, Organization } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner", description: "Full access, can delete workspace" },
  { value: "admin", label: "Admin", description: "Can manage members and settings" },
  { value: "member", label: "Member", description: "Can view and contribute" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
];

function getRoleBadgeColor(role: string) {
  switch (role) {
    case "owner":
      return "bg-amber-900/30 text-amber-400";
    case "admin":
      return "bg-purple-900/30 text-purple-400";
    case "member":
      return "bg-blue-900/30 text-blue-400";
    case "viewer":
      return "bg-slate-700 text-slate-400";
    default:
      return "bg-slate-700 text-slate-400";
  }
}

function getStatusBadgeColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-900/30 text-green-400";
    case "pending":
      return "bg-yellow-900/30 text-yellow-400";
    case "suspended":
      return "bg-red-900/30 text-red-400";
    default:
      return "bg-slate-700 text-slate-400";
  }
}

interface MemberRowProps {
  member: WorkspaceMember;
  currentUserId: string | undefined;
  isCurrentUserAdmin: boolean;
  onUpdateRole: (developerId: string, role: string) => void;
  onRemove: (developerId: string) => void;
}

function MemberRow({ member, currentUserId, isCurrentUserAdmin, onUpdateRole, onRemove }: MemberRowProps) {
  const [showMenu, setShowMenu] = useState(false);
  const isCurrentUser = member.developer_id === currentUserId;
  const canModify = isCurrentUserAdmin && member.role !== "owner" && !isCurrentUser;

  return (
    <div className="p-4 flex items-center justify-between hover:bg-slate-700/30 transition">
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
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">
              {member.developer_name || member.developer_email || "Unknown"}
            </span>
            {isCurrentUser && (
              <span className="text-xs text-slate-400">(you)</span>
            )}
          </div>
          {member.developer_email && (
            <p className="text-slate-400 text-sm">{member.developer_email}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
          {member.role}
        </span>
        {member.status !== "active" && (
          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(member.status)}`}>
            {member.status}
          </span>
        )}
        {canModify && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-slate-700 rounded-lg shadow-xl z-20 py-1">
                  <div className="px-3 py-2 text-xs text-slate-400 uppercase tracking-wider">
                    Change Role
                  </div>
                  {ROLE_OPTIONS.filter(r => r.value !== "owner").map((role) => (
                    <button
                      key={role.value}
                      onClick={() => {
                        onUpdateRole(member.developer_id, role.value);
                        setShowMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-600 flex items-center gap-2 ${
                        member.role === role.value ? "text-primary-400" : "text-white"
                      }`}
                    >
                      {member.role === role.value && <Check className="h-4 w-4" />}
                      <span className={member.role === role.value ? "" : "ml-6"}>{role.label}</span>
                    </button>
                  ))}
                  <div className="border-t border-slate-600 mt-1 pt-1">
                    <button
                      onClick={() => {
                        onRemove(member.developer_id);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-600 flex items-center gap-2"
                    >
                      <UserMinus className="h-4 w-4" />
                      Remove from workspace
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface InviteMemberModalProps {
  onClose: () => void;
  onInvite: (email: string, role: string) => Promise<void>;
  isInviting: boolean;
}

function InviteMemberModal({ onClose, onInvite, isInviting }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    try {
      await onInvite(email.trim(), role);
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to invite member";
      setError(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Invite Team Member</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                {ROLE_OPTIONS.filter(r => r.value !== "owner").map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>
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
              disabled={isInviting}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isInviting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Inviting...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  Send Invite
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CreateWorkspaceModalProps {
  onClose: () => void;
  onCreate: (data: { name: string; type?: string; github_org_id?: string; description?: string }) => Promise<unknown>;
  isCreating: boolean;
  organizations: Organization[];
}

function CreateWorkspaceModal({ onClose, onCreate, isCreating, organizations }: CreateWorkspaceModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"internal" | "github_linked">("internal");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Workspace name is required");
      return;
    }

    try {
      await onCreate({
        name: name.trim(),
        type,
        github_org_id: type === "github_linked" && selectedOrgId ? selectedOrgId : undefined,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create workspace";
      setError(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Create Workspace</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Workspace Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Team"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this workspace for?"
                rows={2}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType("internal")}
                  className={`p-3 rounded-lg border text-left transition ${
                    type === "internal"
                      ? "border-primary-500 bg-primary-900/20"
                      : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  <Building2 className="h-5 w-5 text-slate-400 mb-1" />
                  <div className="text-white font-medium text-sm">Internal</div>
                  <div className="text-slate-400 text-xs">Manual member management</div>
                </button>
                <button
                  type="button"
                  onClick={() => setType("github_linked")}
                  className={`p-3 rounded-lg border text-left transition ${
                    type === "github_linked"
                      ? "border-primary-500 bg-primary-900/20"
                      : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  <LinkIcon className="h-5 w-5 text-slate-400 mb-1" />
                  <div className="text-white font-medium text-sm">GitHub Linked</div>
                  <div className="text-slate-400 text-xs">Sync from GitHub org</div>
                </button>
              </div>
            </div>
            {type === "github_linked" && organizations.length > 0 && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">GitHub Organization</label>
                <select
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">Select an organization...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name || org.login}
                    </option>
                  ))}
                </select>
              </div>
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
                  Create Workspace
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SeatUsageBar({ used, total }: { used: number; total: number }) {
  const percentage = Math.min((used / total) * 100, 100);
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="mt-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-400">Seats Used</span>
        <span className={isAtLimit ? "text-red-400" : isNearLimit ? "text-yellow-400" : "text-slate-400"}>
          {used} / {total}
        </span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            isAtLimit ? "bg-red-500" : isNearLimit ? "bg-yellow-500" : "bg-primary-500"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

interface PendingInviteRowProps {
  invite: WorkspacePendingInvite;
  onRevoke: (inviteId: string) => void;
  onResend: (inviteId: string) => Promise<void>;
  isRevoking: boolean;
}

function PendingInviteRow({ invite, onRevoke, onResend, isRevoking }: PendingInviteRowProps) {
  const [isResending, setIsResending] = useState(false);
  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null;
  const isExpired = expiresAt && expiresAt < new Date();

  const handleResend = async () => {
    setIsResending(true);
    try {
      await onResend(invite.id);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="p-4 flex items-center justify-between hover:bg-slate-700/30 transition">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-yellow-900/30 rounded-full flex items-center justify-center">
          <Mail className="h-5 w-5 text-yellow-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">{invite.email}</span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/30 text-yellow-400">
              Pending
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Clock className="h-3 w-3" />
            {isExpired ? (
              <span className="text-red-400">Expired</span>
            ) : expiresAt ? (
              <span>Expires {expiresAt.toLocaleDateString()}</span>
            ) : (
              <span>No expiry</span>
            )}
            {invite.invited_by_name && (
              <>
                <span>•</span>
                <span>Invited by {invite.invited_by_name}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(invite.role)}`}>
          {invite.role}
        </span>
        <button
          onClick={handleResend}
          disabled={isResending}
          className="p-2 text-blue-400 hover:text-blue-300 hover:bg-slate-700 rounded-lg transition disabled:opacity-50"
          title="Resend invite"
        >
          <RefreshCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => onRevoke(invite.id)}
          disabled={isRevoking}
          className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition disabled:opacity-50"
          title="Revoke invite"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const APP_LABELS: Record<string, { label: string; description: string }> = {
  hiring: { label: "Hiring", description: "Assessment and candidate management" },
  tracking: { label: "Time Tracking", description: "Track developer activity and time" },
  oncall: { label: "On-Call", description: "On-call scheduling and escalations" },
  sprints: { label: "Sprints", description: "Sprint planning and management" },
  documents: { label: "Documents", description: "Documentation and collaboration" },
  ticketing: { label: "Ticketing", description: "Support tickets and forms" },
};

interface AppSettingsSectionProps {
  appSettings: Record<string, boolean>;
  onUpdate: (apps: Record<string, boolean>) => Promise<unknown>;
  isUpdating: boolean;
  isOwner: boolean;
}

function AppSettingsSection({ appSettings, onUpdate, isUpdating, isOwner }: AppSettingsSectionProps) {
  const handleToggle = async (appKey: string) => {
    if (!isOwner) return;
    const newSettings = { ...appSettings, [appKey]: !appSettings[appKey] };
    await onUpdate(newSettings);
  };

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-700 flex items-center gap-3">
        <Layers className="h-5 w-5 text-slate-400" />
        <div>
          <h3 className="text-white font-medium">App Settings</h3>
          <p className="text-slate-400 text-sm">Enable or disable apps for your workspace</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {Object.entries(APP_LABELS).map(([key, { label, description }]) => (
          <div
            key={key}
            className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
          >
            <div>
              <div className="text-white font-medium">{label}</div>
              <div className="text-slate-400 text-sm">{description}</div>
            </div>
            <button
              onClick={() => handleToggle(key)}
              disabled={isUpdating || !isOwner}
              className={`p-1 rounded-full transition ${
                !isOwner ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-600"
              }`}
              title={isOwner ? `${appSettings[key] ? "Disable" : "Enable"} ${label}` : "Only owner can change"}
            >
              {appSettings[key] ? (
                <ToggleRight className="h-8 w-8 text-green-400" />
              ) : (
                <ToggleLeft className="h-8 w-8 text-slate-500" />
              )}
            </button>
          </div>
        ))}
      </div>
      {!isOwner && (
        <div className="px-4 pb-4">
          <p className="text-xs text-slate-500">Only the workspace owner can change app settings.</p>
        </div>
      )}
    </div>
  );
}

export default function OrganizationSettingsPage() {
  const { user } = useAuth();
  const {
    workspaces,
    workspacesLoading,
    currentWorkspace,
    currentWorkspaceId,
    currentWorkspaceLoading,
    switchWorkspace,
    createWorkspace,
    isCreating,
    hasWorkspaces,
  } = useWorkspace();

  const {
    members,
    isLoading: membersLoading,
    inviteMember,
    updateMemberRole,
    removeMember,
    isInviting,
  } = useWorkspaceMembers(currentWorkspaceId);

  const {
    pendingInvites,
    isLoading: pendingInvitesLoading,
    revokeInvite,
    resendInvite,
    isRevoking,
  } = usePendingInvites(currentWorkspaceId);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    appSettings,
    updateAppSettings,
    isUpdating: isUpdatingAppSettings,
  } = useWorkspaceAppSettings(currentWorkspaceId);

  const { billingStatus, seatUsage } = useWorkspaceBilling(currentWorkspaceId);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch GitHub organizations for create modal
  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: repositoriesApi.listOrganizations,
    enabled: showCreateModal,
  });

  const currentMember = members.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";
  const isOwner = currentMember?.role === "owner";

  const handleInvite = async (email: string, role: string) => {
    await inviteMember({ email, role });
  };

  const handleUpdateRole = async (developerId: string, role: string) => {
    await updateMemberRole({ developerId, role });
  };

  const handleRemove = async (developerId: string) => {
    if (confirm("Are you sure you want to remove this member from the workspace?")) {
      await removeMember(developerId);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (confirm("Are you sure you want to revoke this invitation?")) {
      await revokeInvite(inviteId);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    const invite = pendingInvites.find(i => i.id === inviteId);
    await resendInvite(inviteId);
    setSuccessMessage(`Invitation resent to ${invite?.email || 'user'}`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const isLoading = workspacesLoading || currentWorkspaceLoading || membersLoading || pendingInvitesLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="h-5 w-5" />
          {successMessage}
        </div>
      )}

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
                <h1 className="text-xl font-semibold text-white">Organization Settings</h1>
                <p className="text-slate-400 text-sm">
                  Manage your workspace and team members
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Workspace Selector */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Building2 className="h-5 w-5 text-slate-400" />
              Workspaces
            </h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm"
            >
              <Plus className="h-4 w-4" />
              New Workspace
            </button>
          </div>

          {hasWorkspaces ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => switchWorkspace(ws.id)}
                  className={`p-4 rounded-xl border text-left transition ${
                    ws.id === currentWorkspaceId
                      ? "border-primary-500 bg-primary-900/20"
                      : "border-slate-700 bg-slate-800 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {ws.avatar_url ? (
                      <Image
                        src={ws.avatar_url}
                        alt={ws.name}
                        width={40}
                        height={40}
                        className="rounded-lg"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium truncate">{ws.name}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Users className="h-3 w-3" />
                        {ws.member_count} members
                        {ws.type === "github_linked" && (
                          <span className="flex items-center gap-1">
                            <LinkIcon className="h-3 w-3" />
                            GitHub
                          </span>
                        )}
                      </div>
                    </div>
                    {ws.id === currentWorkspaceId && (
                      <Check className="h-5 w-5 text-primary-400 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl p-8 text-center">
              <Building2 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No workspaces yet</h3>
              <p className="text-slate-400 mb-4">
                Create your first workspace to start managing your team.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
              >
                <Plus className="h-4 w-4" />
                Create Workspace
              </button>
            </div>
          )}
        </div>

        {/* Current Workspace Details */}
        {currentWorkspace && (
          <>
            {/* Workspace Info Card */}
            <div className="bg-slate-800 rounded-xl p-6 mb-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  {currentWorkspace.avatar_url ? (
                    <Image
                      src={currentWorkspace.avatar_url}
                      alt={currentWorkspace.name}
                      width={64}
                      height={64}
                      className="rounded-xl"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-slate-700 rounded-xl flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-slate-400" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-2xl font-semibold text-white">{currentWorkspace.name}</h2>
                    <p className="text-slate-400">{currentWorkspace.description || "No description"}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        currentWorkspace.type === "github_linked"
                          ? "bg-purple-900/30 text-purple-400"
                          : "bg-blue-900/30 text-blue-400"
                      }`}>
                        {currentWorkspace.type === "github_linked" ? "GitHub Linked" : "Internal"}
                      </span>
                      <span className="text-slate-400 text-sm">
                        {currentWorkspace.member_count} members
                      </span>
                      <span className="text-slate-400 text-sm">
                        {currentWorkspace.team_count} projects
                      </span>
                    </div>
                  </div>
                </div>
                {billingStatus && (
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                      <Shield className="h-4 w-4" />
                      <span className="text-sm">{billingStatus.current_plan || "Free"} Plan</span>
                    </div>
                    {seatUsage && (
                      <SeatUsageBar used={seatUsage.billable_seats} total={seatUsage.base_seats + seatUsage.additional_seats} />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Members Section */}
            <div className="bg-slate-800 rounded-xl overflow-hidden mb-6">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-slate-400" />
                  <div>
                    <h3 className="text-white font-medium">Team Members</h3>
                    <p className="text-slate-400 text-sm">{members.length} members</p>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Invite Member
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-700/50">
                {members.length > 0 ? (
                  members.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      currentUserId={user?.id}
                      isCurrentUserAdmin={isAdmin}
                      onUpdateRole={handleUpdateRole}
                      onRemove={handleRemove}
                    />
                  ))
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    No members found
                  </div>
                )}
              </div>
            </div>

            {/* Pending Invites Section */}
            {pendingInvites.length > 0 && (
              <div className="bg-slate-800 rounded-xl overflow-hidden mb-6">
                <div className="p-4 border-b border-slate-700 flex items-center gap-3">
                  <Mail className="h-5 w-5 text-yellow-400" />
                  <div>
                    <h3 className="text-white font-medium">Pending Invitations</h3>
                    <p className="text-slate-400 text-sm">{pendingInvites.length} pending</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-700/50">
                  {pendingInvites.map((invite) => (
                    <PendingInviteRow
                      key={invite.id}
                      invite={invite}
                      onRevoke={handleRevokeInvite}
                      onResend={handleResendInvite}
                      isRevoking={isRevoking}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* App Settings Section */}
            <AppSettingsSection
              appSettings={appSettings}
              onUpdate={updateAppSettings}
              isUpdating={isUpdatingAppSettings}
              isOwner={isOwner}
            />

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/settings/projects"
                className="bg-slate-800 rounded-xl p-4 hover:bg-slate-700/50 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg group-hover:bg-slate-600 transition">
                    <FolderKanban className="h-5 w-5 text-slate-300" />
                  </div>
                  <div>
                    <h4 className="text-white font-medium">Projects</h4>
                    <p className="text-slate-400 text-sm">Manage projects</p>
                  </div>
                  <ChevronDown className="h-5 w-5 text-slate-400 ml-auto -rotate-90" />
                </div>
              </Link>
              <Link
                href="/settings/repositories"
                className="bg-slate-800 rounded-xl p-4 hover:bg-slate-700/50 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg group-hover:bg-slate-600 transition">
                    <Settings className="h-5 w-5 text-slate-300" />
                  </div>
                  <div>
                    <h4 className="text-white font-medium">Repositories</h4>
                    <p className="text-slate-400 text-sm">Manage repos</p>
                  </div>
                  <ChevronDown className="h-5 w-5 text-slate-400 ml-auto -rotate-90" />
                </div>
              </Link>
              <div className="bg-slate-800 rounded-xl p-4 opacity-60 cursor-not-allowed">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg">
                    <CreditCard className="h-5 w-5 text-slate-300" />
                  </div>
                  <div>
                    <h4 className="text-white font-medium">Billing</h4>
                    <p className="text-slate-400 text-sm">Coming soon</p>
                  </div>
                  <ChevronDown className="h-5 w-5 text-slate-400 ml-auto -rotate-90" />
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      {showInviteModal && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onInvite={handleInvite}
          isInviting={isInviting}
        />
      )}

      {showCreateModal && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createWorkspace}
          isCreating={isCreating}
          organizations={organizations}
        />
      )}
    </div>
  );
}
