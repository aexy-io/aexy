"use client";

import { useState, useMemo } from "react";
import {
  X,
  UserPlus,
  Users,
  Link2,
  Copy,
  Check,
  Trash2,
  Loader2,
  Globe,
  Lock,
  Clock,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  TablePermissionBadge,
  getPermissionLabel,
  PERMISSION_LEVELS,
} from "./TablePermissionBadge";
import { RowAccessConfig } from "./RowAccessConfig";
import { cn } from "@/lib/utils";
import type {
  TablePermission,
  TableCollaborator,
  TableAccess,
  TableShareLink,
  TableRowAccessMode,
  TableVisibility,
  WorkspaceMember,
  TableField,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TableShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  tableName: string;
  visibility: TableVisibility;
  rowAccessMode: TableRowAccessMode;
  myAccess: TableAccess | undefined;
  fields: TableField[];
  // Collaborator data + mutations
  collaborators: TableCollaborator[];
  onAddCollaborator: (data: {
    developer_id?: string;
    role_id?: string;
    team_id?: string;
    permission?: TablePermission;
  }) => Promise<unknown>;
  onUpdateCollaborator: (data: {
    collabId: string;
    data: Partial<{
      permission: TablePermission;
      hidden_columns: string[];
      readonly_columns: string[];
    }>;
  }) => Promise<unknown>;
  onRemoveCollaborator: (collabId: string) => Promise<unknown>;
  // Share link data + mutations
  shareLinks: TableShareLink[];
  onCreateShareLink: (data: {
    permission?: string;
    password?: string;
    expires_at?: string;
    max_uses?: number;
  }) => Promise<unknown>;
  onRevokeShareLink: (linkId: string) => Promise<unknown>;
  isCreatingLink?: boolean;
  // Table settings mutations
  onUpdateTable: (data: {
    visibility?: TableVisibility;
    row_access_mode?: TableRowAccessMode;
  }) => Promise<unknown>;
  isUpdatingTable?: boolean;
  // Workspace members for the picker
  workspaceMembers: WorkspaceMember[];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CollaboratorAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
      {initials || "?"}
    </div>
  );
}

function CollaboratorRow({
  collab,
  isAdmin,
  fields,
  onUpdate,
  onRemove,
}: {
  collab: TableCollaborator;
  isAdmin: boolean;
  fields: TableField[];
  onUpdate: (data: Partial<{ permission: TablePermission; hidden_columns: string[]; readonly_columns: string[] }>) => void;
  onRemove: () => void;
}) {
  const [showPermDropdown, setShowPermDropdown] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const name = collab.developer_name || collab.role_name || collab.team_name || "Unknown";
  const type = collab.developer_id ? "Member" : collab.role_id ? "Role" : "Team";

  return (
    <div className="flex items-center gap-3 py-2.5 group">
      <CollaboratorAvatar name={name} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{name}</div>
        <div className="text-xs text-muted-foreground">{type}</div>
      </div>

      {isAdmin ? (
        <div className="relative">
          <button
            onClick={() => setShowPermDropdown(!showPermDropdown)}
            className="flex items-center gap-1 text-xs hover:bg-accent px-2 py-1 rounded transition-colors"
          >
            <TablePermissionBadge permission={collab.permission} size="sm" />
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
          {showPermDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowPermDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-popover border border-border rounded-lg shadow-lg py-1">
                {PERMISSION_LEVELS.map((perm) => (
                  <button
                    key={perm}
                    onClick={() => {
                      onUpdate({ permission: perm });
                      setShowPermDropdown(false);
                    }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2",
                      perm === collab.permission && "text-purple-400"
                    )}
                  >
                    {perm === collab.permission && <Check className="h-3 w-3" />}
                    <span className={perm !== collab.permission ? "pl-5" : ""}>
                      {getPermissionLabel(perm)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <TablePermissionBadge permission={collab.permission} size="sm" />
      )}

      {isAdmin && !confirmRemove && (
        <button
          onClick={() => setConfirmRemove(true)}
          className="p-1 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove collaborator"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      {isAdmin && confirmRemove && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => { onRemove(); setConfirmRemove(false); }}
            className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors"
          >
            Remove
          </button>
          <button
            onClick={() => setConfirmRemove(false)}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function ShareLinkRow({
  link,
  tableId,
  onRevoke,
}: {
  link: TableShareLink;
  tableId: string;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/public/tables/${link.token}`;

  const isExpired = link.expires_at ? new Date(link.expires_at) < new Date() : false;
  const isExhausted = link.max_uses ? link.use_count >= link.max_uses : false;
  const isUsable = link.is_active && !isExpired && !isExhausted;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  // Build metadata string
  const meta: string[] = [];
  if (link.max_uses) {
    meta.push(`${link.use_count} of ${link.max_uses} uses`);
  } else if (link.use_count > 0) {
    meta.push(`${link.use_count} uses`);
  }
  if (link.expires_at) {
    const expDate = new Date(link.expires_at);
    const now = new Date();
    if (isExpired) {
      meta.push(`Expired ${expDate.toLocaleDateString()}`);
    } else {
      const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / 86400000);
      meta.push(daysLeft <= 7 ? `Expires in ${daysLeft}d` : `Expires ${expDate.toLocaleDateString()}`);
    }
  }

  return (
    <div className="flex items-center gap-3 py-2.5 group">
      <div className={cn("p-1.5 rounded-md", isUsable ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground")}>
        {link.has_password ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">
            {link.permission === "edit" ? "Can edit" : "View only"}
          </span>
          {link.has_password && (
            <span className="text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
              Password
            </span>
          )}
          {!isUsable && (
            <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
              {isExpired ? "Expired" : isExhausted ? "Limit reached" : "Inactive"}
            </span>
          )}
        </div>
        {meta.length > 0 && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {meta.join(" \u00b7 ")}
          </div>
        )}
      </div>
      <button
        onClick={handleCopy}
        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
        title="Copy link"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {!confirmRevoke ? (
        <button
          onClick={() => setConfirmRevoke(true)}
          className="p-1.5 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Revoke link"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => { onRevoke(); setConfirmRevoke(false); }}
            className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors"
          >
            Revoke
          </button>
          <button
            onClick={() => setConfirmRevoke(false)}
            className="px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function AddCollaboratorForm({
  workspaceMembers,
  existingCollaboratorIds,
  onAdd,
}: {
  workspaceMembers: WorkspaceMember[];
  existingCollaboratorIds: Set<string>;
  onAdd: (developerId: string, permission: TablePermission) => void;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedPermission, setSelectedPermission] = useState<TablePermission>("edit");

  const availableMembers = useMemo(
    () =>
      workspaceMembers.filter(
        (m) => m.status === "active" && !existingCollaboratorIds.has(m.developer_id)
      ),
    [workspaceMembers, existingCollaboratorIds]
  );

  const handleAdd = () => {
    if (!selectedMemberId) return;
    onAdd(selectedMemberId, selectedPermission);
    setSelectedMemberId("");
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedMemberId}
        onChange={(e) => setSelectedMemberId(e.target.value)}
        className="flex-1 px-3 py-1.5 bg-accent border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        <option value="">Select a member...</option>
        {availableMembers.map((m) => (
          <option key={m.developer_id} value={m.developer_id}>
            {m.developer_name || m.developer_email || "Unknown"}
          </option>
        ))}
      </select>
      <select
        value={selectedPermission}
        onChange={(e) => setSelectedPermission(e.target.value as TablePermission)}
        className="px-3 py-1.5 bg-accent border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        {PERMISSION_LEVELS.map((perm) => (
          <option key={perm} value={perm}>
            {getPermissionLabel(perm)}
          </option>
        ))}
      </select>
      <button
        onClick={handleAdd}
        disabled={!selectedMemberId}
        className="p-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors"
        title="Add collaborator"
      >
        <UserPlus className="h-4 w-4" />
      </button>
    </div>
  );
}

function CreateShareLinkForm({
  onCreateLink,
  isCreating,
}: {
  onCreateLink: (data: {
    permission?: string;
    password?: string;
    expires_at?: string;
    max_uses?: number;
  }) => Promise<unknown>;
  isCreating: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [permission, setPermission] = useState("view");
  const [password, setPassword] = useState("");
  const [expiresIn, setExpiresIn] = useState<string>("");
  const [maxUses, setMaxUses] = useState<string>("");

  const handleCreate = async () => {
    const data: {
      permission?: string;
      password?: string;
      expires_at?: string;
      max_uses?: number;
    } = { permission };

    if (password) data.password = password;
    if (maxUses) data.max_uses = parseInt(maxUses, 10);
    if (expiresIn) {
      const date = new Date();
      const days = parseInt(expiresIn, 10);
      date.setDate(date.getDate() + days);
      data.expires_at = date.toISOString();
    }

    await onCreateLink(data);
    setShowForm(false);
    setPassword("");
    setExpiresIn("");
    setMaxUses("");
    setPermission("view");
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
      >
        <Link2 className="h-4 w-4" />
        Create share link
      </button>
    );
  }

  return (
    <div className="space-y-3 p-3 bg-accent/50 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">New share link</span>
        <button
          onClick={() => setShowForm(false)}
          className="p-1 hover:bg-accent rounded text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Permission</label>
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
            className="w-full px-3 py-1.5 bg-accent border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="view">View only</option>
            <option value="edit">Can edit</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Expires in</label>
          <select
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value)}
            className="w-full px-3 py-1.5 bg-accent border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Never</option>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Password (optional)</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="No password"
            className="w-full px-3 py-1.5 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Max uses (optional)</label>
          <input
            type="number"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="Unlimited"
            min="1"
            className="w-full px-3 py-1.5 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={isCreating}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors text-sm font-medium"
      >
        {isCreating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {isCreating ? "Creating..." : "Create Link"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dialog
// ---------------------------------------------------------------------------

type Tab = "people" | "links" | "access";

export function TableShareDialog({
  open,
  onOpenChange,
  tableId,
  tableName,
  visibility,
  rowAccessMode,
  myAccess,
  fields,
  collaborators,
  onAddCollaborator,
  onUpdateCollaborator,
  onRemoveCollaborator,
  shareLinks,
  onCreateShareLink,
  onRevokeShareLink,
  isCreatingLink = false,
  onUpdateTable,
  isUpdatingTable = false,
  workspaceMembers,
}: TableShareDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>("people");

  const isAdmin = myAccess?.permission === "admin";

  const existingCollaboratorIds = useMemo(
    () => new Set(collaborators.map((c) => c.developer_id).filter(Boolean) as string[]),
    [collaborators]
  );

  const handleAddCollaborator = async (developerId: string, permission: TablePermission) => {
    await onAddCollaborator({ developer_id: developerId, permission });
  };

  const handleUpdateVisibility = async (v: TableVisibility) => {
    await onUpdateTable({ visibility: v });
  };

  const handleUpdateRowAccess = async (mode: TableRowAccessMode) => {
    await onUpdateTable({ row_access_mode: mode });
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "people", label: "People", count: collaborators.length },
    { key: "links", label: "Share links", count: shareLinks.length },
    { key: "access", label: "Access rules" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{tableName}&rdquo;</DialogTitle>
          <DialogDescription>
            Manage who has access to this table and how it&apos;s shared.
          </DialogDescription>
        </DialogHeader>

        {/* Your access + Visibility in one row */}
        <div className="flex items-center justify-between px-1">
          {myAccess && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Your access:</span>
              <TablePermissionBadge permission={myAccess.permission} size="sm" />
            </div>
          )}
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              {(
                [
                  { key: "private" as const, icon: Lock, tip: "Only you and collaborators" },
                  { key: "workspace" as const, icon: Users, tip: "All workspace members can view" },
                  { key: "public" as const, icon: Globe, tip: "Anyone with a share link" },
                ] as const
              ).map(({ key, icon: Icon, tip }) => (
                <button
                  key={key}
                  onClick={() => handleUpdateVisibility(key)}
                  disabled={isUpdatingTable}
                  title={tip}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    visibility === key
                      ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
                  )}
                >
                  <Icon className="h-3 w-3 inline mr-1" />
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.key
                  ? "border-purple-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-1">
          {/* People tab */}
          {activeTab === "people" && (
            <div className="space-y-4 py-2">
              {isAdmin && (
                <AddCollaboratorForm
                  workspaceMembers={workspaceMembers}
                  existingCollaboratorIds={existingCollaboratorIds}
                  onAdd={handleAddCollaborator}
                />
              )}

              {collaborators.length === 0 ? (
                <div className="py-8 text-center">
                  <UserPlus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No collaborators yet. Add people to share this table.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {collaborators.map((collab) => (
                    <CollaboratorRow
                      key={collab.id}
                      collab={collab}
                      isAdmin={isAdmin}
                      fields={fields}
                      onUpdate={(data) =>
                        onUpdateCollaborator({ collabId: collab.id, data })
                      }
                      onRemove={() => onRemoveCollaborator(collab.id)}
                    />
                  ))}
                </div>
              )}

              {!isAdmin && collaborators.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-accent/50 rounded-lg text-xs text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Only table admins can manage collaborators.</span>
                </div>
              )}
            </div>
          )}

          {/* Share links tab */}
          {activeTab === "links" && (
            <div className="space-y-4 py-2">
              {isAdmin && (
                <CreateShareLinkForm
                  onCreateLink={onCreateShareLink}
                  isCreating={isCreatingLink}
                />
              )}

              {shareLinks.length === 0 ? (
                <div className="py-8 text-center">
                  <Link2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No share links yet.{" "}
                    {isAdmin
                      ? "Create one to share this table externally."
                      : "Only admins can create share links."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {shareLinks.map((link) => (
                    <ShareLinkRow
                      key={link.id}
                      link={link}
                      tableId={tableId}
                      onRevoke={() => onRevokeShareLink(link.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Access rules tab */}
          {activeTab === "access" && (
            <div className="space-y-6 py-3">
              <RowAccessConfig
                currentMode={rowAccessMode}
                onChangeMode={handleUpdateRowAccess}
                isUpdating={isUpdatingTable}
                disabled={!isAdmin}
              />

              {!isAdmin && (
                <div className="flex items-start gap-2 p-3 bg-accent/50 rounded-lg text-xs text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Only table admins can change access rules.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
