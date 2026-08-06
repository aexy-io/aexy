"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Send, Trash2, X, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatAbsolute, formatRelative } from "@/lib/datetime";
import { WorkUpdate, WorkUpdateEntityType, workUpdatesApi } from "@/lib/api";

// Progress updates for one task or ticket. Shared by the task modal and the
// ticket detail page so both read and write the same stream — a standup note
// written on the ticket is the same fact as one written on the linked task.
//
// Deliberately not the comment thread: see backend models/work_update.py.
export function WorkUpdatesPanel({
  workspaceId,
  entityType,
  entityId,
}: {
  workspaceId: string | null;
  entityType: WorkUpdateEntityType;
  entityId: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentDeveloperId = user?.id ?? null;

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const queryKey = ["workUpdates", workspaceId, entityType, entityId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => workUpdatesApi.list(workspaceId!, entityType, entityId),
    enabled: !!workspaceId && !!entityId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    // The post is mirrored into the activity log, so the History tab and the
    // workspace feed are now stale too.
    queryClient.invalidateQueries({ queryKey: ["ticketTimeline", workspaceId, entityId] });
    queryClient.invalidateQueries({ queryKey: ["activityFeed", workspaceId] });
  };

  const describeError = (err: unknown, fallback: string) => {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    return typeof detail === "string" ? detail : fallback;
  };

  const postUpdate = useMutation({
    mutationFn: (body: string) =>
      workUpdatesApi.create(workspaceId!, entityType, entityId, body),
    onSuccess: () => {
      setDraft("");
      setActionError(null);
      invalidate();
    },
    onError: (err) => setActionError(describeError(err, "Could not post that update.")),
  });

  const saveEdit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      workUpdatesApi.edit(workspaceId!, id, body),
    onSuccess: () => {
      setEditingId(null);
      setActionError(null);
      invalidate();
    },
    onError: (err) => setActionError(describeError(err, "Could not save that edit.")),
  });

  const removeUpdate = useMutation({
    mutationFn: (id: string) => workUpdatesApi.remove(workspaceId!, id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err) => setActionError(describeError(err, "Could not delete that update.")),
  });

  const updates = data?.items ?? [];

  return (
    <div className="space-y-4" data-testid="work-updates-panel">
      {/* Compose. Placed above the list because the list is newest-first —
          writing and the thing you just wrote stay next to each other. */}
      <div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Where does this stand? e.g. API done, waiting on vendor sandbox creds."
          rows={3}
          data-testid="work-update-input"
          className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"
        />
        <div className="flex items-center justify-between gap-3 mt-2">
          <p className="text-xs text-muted-foreground">
            Progress updates are separate from comments — this is the current state of the work.
          </p>
          <button
            type="button"
            onClick={() => draft.trim() && postUpdate.mutate(draft)}
            disabled={!draft.trim() || postUpdate.isPending}
            data-testid="work-update-submit"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm shrink-0"
          >
            {postUpdate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Post update
          </button>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-500 dark:text-red-400" data-testid="work-update-error">
          {actionError}
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading updates…</p>}
      {error && (
        <p className="text-sm text-red-500 dark:text-red-400">Failed to load updates.</p>
      )}

      {!isLoading && !error && updates.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="work-updates-empty">
          No updates yet. The first one is the most useful.
        </p>
      )}

      <ol className="space-y-3" data-testid="work-updates-list">
        {updates.map((update) => (
          <UpdateItem
            key={update.id}
            update={update}
            isOwn={!!currentDeveloperId && update.author_id === currentDeveloperId}
            isEditing={editingId === update.id}
            editDraft={editDraft}
            onEditDraftChange={setEditDraft}
            onStartEdit={() => {
              setEditingId(update.id);
              setEditDraft(update.body);
              setActionError(null);
            }}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={() => saveEdit.mutate({ id: update.id, body: editDraft })}
            onDelete={() => removeUpdate.mutate(update.id)}
            isSaving={saveEdit.isPending}
            isDeleting={removeUpdate.isPending}
          />
        ))}
      </ol>
    </div>
  );
}

function UpdateItem({
  update,
  isOwn,
  isEditing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  isSaving,
  isDeleting,
}: {
  update: WorkUpdate;
  isOwn: boolean;
  isEditing: boolean;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  // A null author is someone who has left the workspace — the update is still
  // the best record of what was happening, so it stays.
  const authorName = update.author_name || update.author_email || "A former member";

  return (
    <li
      data-testid="work-update-item"
      className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 p-3 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-foreground font-medium">{authorName}</span>
        <span className="flex items-center gap-2 shrink-0">
          <time
            className="text-xs text-muted-foreground"
            title={formatAbsolute(update.created_at)}
          >
            {formatRelative(update.created_at)}
          </time>
          {update.edited_at && (
            <span
              className="text-xs text-muted-foreground italic"
              title={`Edited ${formatAbsolute(update.edited_at)}`}
            >
              edited
            </span>
          )}
          {isOwn && !isEditing && (
            <>
              <button
                type="button"
                onClick={onStartEdit}
                title="Edit this update"
                aria-label="Edit this update"
                data-testid="work-update-edit"
                className="text-muted-foreground hover:text-foreground transition"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                title="Delete this update"
                aria-label="Delete this update"
                data-testid="work-update-delete"
                className="text-muted-foreground hover:text-red-500 transition disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </span>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            rows={3}
            data-testid="work-update-edit-input"
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={!editDraft.trim() || isSaving}
              data-testid="work-update-edit-save"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition disabled:opacity-50 text-xs"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-foreground rounded-lg hover:bg-muted transition text-xs"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-foreground">{update.body}</p>
      )}
    </li>
  );
}
