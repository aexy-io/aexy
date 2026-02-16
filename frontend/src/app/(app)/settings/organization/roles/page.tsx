"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Crown,
  Edit2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Users,
  Check,
  X,
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useRoles, useRoleTemplates, usePermissionCatalog } from "@/hooks/useRoles";
import { useAuth } from "@/hooks/useAuth";
import { CustomRole, RoleTemplateInfo, PermissionInfo } from "@/lib/api";

function getRoleBadgeColor(roleName: string) {
  const name = roleName.toLowerCase();
  if (name.includes("owner")) return "bg-amber-900/30 text-amber-400 border-amber-700";
  if (name.includes("admin")) return "bg-purple-900/30 text-purple-400 border-purple-700";
  if (name.includes("manager")) return "bg-green-900/30 text-green-400 border-green-700";
  if (name.includes("developer")) return "bg-blue-900/30 text-blue-400 border-blue-700";
  if (name.includes("hr")) return "bg-rose-900/30 text-rose-400 border-rose-700";
  if (name.includes("support")) return "bg-pink-900/30 text-pink-400 border-pink-700";
  if (name.includes("sales")) return "bg-cyan-900/30 text-cyan-400 border-cyan-700";
  if (name.includes("viewer")) return "bg-slate-700 text-slate-300 border-slate-600";
  return "bg-slate-700 text-slate-300 border-slate-600";
}

interface RoleCardProps {
  role: CustomRole;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function RoleCard({ role, isAdmin, onEdit, onDelete }: RoleCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700">
      <div className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 flex-1 text-left"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: role.color + "20" }}
            >
              <Shield className="h-5 w-5" style={{ color: role.color }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{role.name}</span>
                {role.is_system && (
                  <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">
                    System
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400">{role.description}</p>
            </div>
            {expanded ? (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronRight className="h-5 w-5 text-slate-400" />
            )}
          </button>
          {isAdmin && !role.is_system && (
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={onEdit}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                title="Edit role"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                title="Delete role"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700 p-4">
          <h4 className="text-sm font-medium text-slate-300 mb-3">
            Permissions ({role.permissions.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {role.permissions.slice(0, 20).map((perm) => (
              <span
                key={perm}
                className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded"
              >
                {perm.replace(/_/g, " ").replace("can ", "")}
              </span>
            ))}
            {role.permissions.length > 20 && (
              <span className="px-2 py-1 bg-slate-600 text-slate-400 text-xs rounded">
                +{role.permissions.length - 20} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface CreateRoleModalProps {
  templates: RoleTemplateInfo[];
  permissionCatalog: Record<string, PermissionInfo[]>;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    description?: string;
    color?: string;
    based_on_template?: string;
    permissions: string[];
  }) => Promise<unknown>;
  isCreating: boolean;
}

function CreateRoleModal({
  templates,
  permissionCatalog,
  onClose,
  onCreate,
  isCreating,
}: CreateRoleModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const colors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
    "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6",
  ];

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setPermissions(template.permissions);
      if (!name) setName(template.name + " (Custom)");
      if (!description) setDescription(template.description);
      setColor(template.color);
    }
  };

  const togglePermission = (perm: string) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Role name is required");
      return;
    }

    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        based_on_template: selectedTemplate || undefined,
        permissions,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create role");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-xl font-semibold text-white">Create Custom Role</h3>
          <p className="text-slate-400 text-sm mt-1">
            Define a new role with specific permissions
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Template Selector */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                Start from template (optional)
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="">Start from scratch</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} - {t.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Name & Description */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Role Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Lead Developer"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Color</label>
                <div className="flex gap-2">
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
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this role for?"
                rows={2}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Permissions */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                Permissions ({permissions.length} selected)
              </label>
              <div className="space-y-4 max-h-64 overflow-y-auto bg-slate-900/50 rounded-lg p-4">
                {Object.entries(permissionCatalog).map(([category, perms]) => (
                  <div key={category}>
                    <h5 className="text-xs font-medium text-slate-500 uppercase mb-2">
                      {category}
                    </h5>
                    <div className="space-y-1">
                      {perms.map((perm) => (
                        <label
                          key={perm.id}
                          className="flex items-center gap-2 p-2 hover:bg-slate-700/50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={permissions.includes(perm.id)}
                            onChange={() => togglePermission(perm.id)}
                            className="w-4 h-4 rounded border-slate-500 text-primary-600 focus:ring-primary-500 bg-slate-700"
                          />
                          <span className="text-sm text-white">{perm.description}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        </form>

        <div className="p-6 border-t border-slate-700 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
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
                Create Role
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RolesSettingsPage() {
  const { user } = useAuth();
  const { currentWorkspaceId, currentWorkspace, currentWorkspaceLoading } = useWorkspace();
  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspaceId);
  const { roles, isLoading: rolesLoading, createRole, deleteRole, isCreating } = useRoles(currentWorkspaceId);
  const { templates } = useRoleTemplates(currentWorkspaceId);
  const { permissionsByCategory: permissionCatalog } = usePermissionCatalog(currentWorkspaceId);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const currentMember = workspaceMembers.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

  const handleDelete = async (roleId: string, roleName: string) => {
    if (confirm(`Are you sure you want to delete the "${roleName}" role?`)) {
      try {
        await deleteRole(roleId);
      } catch (error) {
        console.error("Failed to delete role:", error);
      }
    }
  };

  const isLoading = currentWorkspaceLoading || rolesLoading;

  if (isLoading) {
    return (
      <div className="py-20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading roles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Organization Roles</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure custom roles and permissions</p>
      </div>

      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-slate-400" />
              Roles
            </h2>
            <p className="text-slate-400 text-sm">{roles.length} roles defined</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm"
            >
              <Plus className="h-4 w-4" />
              Create Role
            </button>
          )}
        </div>

        {/* System Roles */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
            System Roles
          </h3>
          <div className="space-y-3">
            {roles
              .filter((r) => r.is_system)
              .map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  isAdmin={isAdmin}
                  onEdit={() => {}}
                  onDelete={() => {}}
                />
              ))}
          </div>
        </div>

        {/* Custom Roles */}
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
            Custom Roles
          </h3>
          {roles.filter((r) => !r.is_system).length > 0 ? (
            <div className="space-y-3">
              {roles
                .filter((r) => !r.is_system)
                .map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    isAdmin={isAdmin}
                    onEdit={() => {}}
                    onDelete={() => handleDelete(role.id, role.name)}
                  />
                ))}
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl p-8 text-center border border-slate-700">
              <Shield className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Custom Roles</h3>
              <p className="text-slate-400 mb-4">
                Create custom roles to define specific permission sets for your team.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
                >
                  <Plus className="h-4 w-4" />
                  Create First Role
                </button>
              )}
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="bg-slate-800 rounded-xl p-6 mt-8 border border-slate-700">
          <h3 className="text-white font-medium mb-3">About Roles & Permissions</h3>
          <div className="space-y-2 text-sm text-slate-400">
            <p>
              <strong className="text-white">System roles</strong> are predefined and cannot be modified.
              They serve as templates for common use cases.
            </p>
            <p>
              <strong className="text-white">Custom roles</strong> can be created from scratch or based
              on a template. You can customize permissions to fit your needs.
            </p>
            <p>
              <strong className="text-white">Project overrides</strong> allow you to assign different
              roles at the project level, overriding the organization role.
            </p>
          </div>
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreateModal && (
        <CreateRoleModal
          templates={templates}
          permissionCatalog={permissionCatalog}
          onClose={() => setShowCreateModal(false)}
          onCreate={createRole}
          isCreating={isCreating}
        />
      )}
    </div>
  );
}
