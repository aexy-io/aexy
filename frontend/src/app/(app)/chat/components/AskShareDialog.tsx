"use client";

import { useState, useMemo } from "react";
import {
  X, UserPlus, Users, Link2, Copy, Check, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useWorkspaceMembers } from "@/hooks/useWorkspace";
import {
  useAskParticipants,
  useAddAskParticipant,
  useRemoveAskParticipant,
  useUpdateAskParticipant,
  useAskShareLinks,
  useCreateAskShareLink,
  useRevokeAskShareLink,
} from "@/hooks/useAsk";
import type { AskParticipant, AskShareLink } from "@/lib/api";

interface AskShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  conversationId: string;
  conversationTitle: string | null;
  isOwner: boolean;
}

export function AskShareDialog({
  open,
  onOpenChange,
  workspaceId,
  conversationId,
  conversationTitle,
  isOwner,
}: AskShareDialogProps) {
  const [tab, setTab] = useState<"people" | "links">("people");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Share &ldquo;{conversationTitle || "Untitled"}&rdquo;
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setTab("people")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "people"
                ? "border-b-2 border-purple-500 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3 w-3 inline mr-1" />
            People
          </button>
          <button
            onClick={() => setTab("links")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "links"
                ? "border-b-2 border-purple-500 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Link2 className="h-3 w-3 inline mr-1" />
            Links
          </button>
        </div>

        {tab === "people" ? (
          <PeopleTab
            workspaceId={workspaceId}
            conversationId={conversationId}
            isOwner={isOwner}
          />
        ) : (
          <LinksTab
            workspaceId={workspaceId}
            conversationId={conversationId}
            isOwner={isOwner}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- People Tab ---

function PeopleTab({ workspaceId, conversationId, isOwner }: { workspaceId: string; conversationId: string; isOwner: boolean }) {
  const { data: participants, isLoading } = useAskParticipants(workspaceId, conversationId);
  const { members: workspaceMembers } = useWorkspaceMembers(workspaceId);
  const addParticipant = useAddAskParticipant(workspaceId, conversationId);
  const removeParticipant = useRemoveAskParticipant(workspaceId, conversationId);
  const updateParticipant = useUpdateAskParticipant(workspaceId, conversationId);

  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedPermission, setSelectedPermission] = useState("write");

  const members = workspaceMembers || [];
  const participantIds = new Set((participants || []).map((p: AskParticipant) => p.developer_id));

  const availableMembers = useMemo(
    () => (Array.isArray(members) ? members : []).filter(
      (m: any) => !participantIds.has(m.developer_id || m.id)
    ),
    [members, participantIds]
  );

  const handleAdd = async () => {
    if (!selectedMemberId) return;
    try {
      await addParticipant.mutateAsync({ developerId: selectedMemberId, permission: selectedPermission });
      setSelectedMemberId("");
      toast.success("Participant added");
    } catch {
      toast.error("Failed to add participant");
    }
  };

  const handleRemove = async (developerId: string) => {
    try {
      await removeParticipant.mutateAsync(developerId);
      toast.success("Participant removed");
    } catch {
      toast.error("Failed to remove participant");
    }
  };

  const handleUpdatePermission = async (developerId: string, permission: string) => {
    try {
      await updateParticipant.mutateAsync({ developerId, permission });
    } catch {
      toast.error("Failed to update permission");
    }
  };

  return (
    <div className="space-y-3 py-2">
      {/* Add member form */}
      {isOwner && availableMembers.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">Select a member...</option>
            {availableMembers.map((m: any) => (
              <option key={m.developer_id || m.id} value={m.developer_id || m.id}>
                {m.developer_name || m.name || m.email}
              </option>
            ))}
          </select>
          <select
            value={selectedPermission}
            onChange={(e) => setSelectedPermission(e.target.value)}
            className="w-20 rounded border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="read">Read</option>
            <option value="write">Write</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedMemberId || addParticipant.isPending}
            className="flex items-center gap-1 px-2 py-1.5 rounded bg-purple-500 text-white text-xs hover:bg-purple-600 disabled:opacity-50"
          >
            {addParticipant.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            Add
          </button>
        </div>
      )}

      {/* Participant list */}
      {isLoading ? (
        <div className="text-xs text-muted-foreground py-2">Loading...</div>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {(participants || []).map((p: AskParticipant) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                {(p.developer_name || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{p.developer_name || "Unknown"}</p>
              </div>
              {p.permission === "owner" ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 font-medium">
                  Owner
                </span>
              ) : isOwner ? (
                <div className="flex items-center gap-1">
                  <select
                    value={p.permission}
                    onChange={(e) => handleUpdatePermission(p.developer_id, e.target.value)}
                    className="text-[10px] rounded border border-border bg-background px-1 py-0.5"
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                  </select>
                  <button
                    onClick={() => handleRemove(p.developer_id)}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground capitalize">{p.permission}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Links Tab ---

function LinksTab({ workspaceId, conversationId, isOwner }: { workspaceId: string; conversationId: string; isOwner: boolean }) {
  const { data: links, isLoading } = useAskShareLinks(workspaceId, conversationId);
  const createLink = useCreateAskShareLink(workspaceId, conversationId);
  const revokeLink = useRevokeAskShareLink(workspaceId);

  const [linkPermission, setLinkPermission] = useState("read");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCreate = async () => {
    try {
      await createLink.mutateAsync({ permission: linkPermission });
      toast.success("Share link created");
    } catch {
      toast.error("Failed to create link");
    }
  };

  const handleRevoke = async (linkId: string) => {
    try {
      await revokeLink.mutateAsync(linkId);
      toast.success("Link revoked");
    } catch {
      toast.error("Failed to revoke link");
    }
  };

  const handleCopy = (token: string, linkId: string) => {
    const url = `${window.location.origin}/chat/join/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(linkId);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-3 py-2">
      {/* Create link form */}
      {isOwner && (
        <div className="flex gap-2">
          <select
            value={linkPermission}
            onChange={(e) => setLinkPermission(e.target.value)}
            className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="read">Read-only access</option>
            <option value="write">Write access</option>
          </select>
          <button
            onClick={handleCreate}
            disabled={createLink.isPending}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-500 text-white text-xs hover:bg-purple-600 disabled:opacity-50"
          >
            {createLink.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
            Create Link
          </button>
        </div>
      )}

      {/* Link list */}
      {isLoading ? (
        <div className="text-xs text-muted-foreground py-2">Loading...</div>
      ) : !links || links.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No share links yet.</p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {links.map((link: AskShareLink) => (
            <div key={link.id} className="flex items-center gap-2 px-2 py-2 rounded border border-border">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium capitalize">{link.permission} access</p>
                <p className="text-[10px] text-muted-foreground">
                  {link.use_count} uses
                  {link.max_uses ? ` / ${link.max_uses} max` : ""}
                  {link.expires_at ? ` · Expires ${new Date(link.expires_at).toLocaleDateString()}` : ""}
                </p>
              </div>
              <button
                onClick={() => handleCopy(link.token, link.id)}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
                title="Copy link"
              >
                {copiedId === link.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </button>
              {isOwner && (
                <button
                  onClick={() => handleRevoke(link.id)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  title="Revoke link"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
