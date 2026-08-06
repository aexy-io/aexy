"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Star, X } from "lucide-react";
import { getApiErrorMessage } from "@/lib/utils";
import { invalidateTaskCaches } from "@/hooks/invalidateTaskCaches";
import { SprintTask, TaskScope, taskAssigneesApi } from "@/lib/api";

// Collaborators — everyone on a task besides the primary assignee.
//
// The Assignee select above owns the *primary* slot and saves with the rest of
// the form. This control owns the other names and acts immediately, the same way
// the GitHub links section does. Splitting them that way is what lets the two
// coexist: the backend treats `assignee_id` as authoritative for the primary and
// leaves collaborator rows alone, so saving the form never clobbers this list
// and this list never moves the primary out from under the form.
//
// "All assignees equal" is the primary select set to "No primary" with names
// here — a real state, not a mode flag: `assignee_id` is genuinely null because
// nobody is individually accountable.
export function TaskCollaborators({
  task,
  users,
  onChanged,
}: {
  task: SprintTask;
  users: { id: string; name: string }[];
  onChanged?: (updated: SprintTask) => void;
}) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope: TaskScope = { sprintId: task.sprint_id, teamId: task.team_id };

  const assignees = task.assignees ?? [];
  const primary = assignees.find((a) => a.is_primary) ?? null;
  const collaborators = assignees.filter((a) => !a.is_primary);
  const assignedIds = new Set(assignees.map((a) => a.developer_id));
  const addable = users.filter((u) => !assignedIds.has(u.id));

  const afterChange = (updated: SprintTask) => {
    setError(null);
    invalidateTaskCaches(queryClient, task.workspace_id);
    onChanged?.(updated);
  };

  const addCollaborator = useMutation({
    mutationFn: (developerId: string) =>
      taskAssigneesApi.add(scope, task.id, developerId, false),
    onSuccess: (updated) => {
      setPicking(false);
      afterChange(updated);
    },
    onError: (err) => setError(getApiErrorMessage(err, "Could not add that person.")),
  });

  const removeAssignee = useMutation({
    mutationFn: (developerId: string) =>
      taskAssigneesApi.remove(scope, task.id, developerId),
    onSuccess: afterChange,
    onError: (err) => setError(getApiErrorMessage(err, "Could not remove that person.")),
  });

  const promote = useMutation({
    mutationFn: (developerId: string) =>
      taskAssigneesApi.setPrimary(scope, task.id, developerId),
    onSuccess: afterChange,
    onError: (err) => setError(getApiErrorMessage(err, "Could not change the primary.")),
  });

  const busy =
    addCollaborator.isPending || removeAssignee.isPending || promote.isPending;

  const nameFor = (developerId: string, fallback: string | null) =>
    users.find((u) => u.id === developerId)?.name ?? fallback ?? "Unknown user";

  return (
    <div data-testid="task-collaborators">
      <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
        Collaborators
      </label>

      {collaborators.length === 0 && !picking && (
        <p className="text-xs text-muted-foreground mb-1.5">
          {primary
            ? "Just the assignee so far."
            : assignees.length === 0
              ? "Nobody on this yet."
              : "No primary — everyone listed is equally on this."}
        </p>
      )}

      <ul className="space-y-1">
        {collaborators.map((person) => (
          <li
            key={person.developer_id}
            data-testid="task-collaborator"
            className="flex items-center justify-between gap-2 rounded bg-background/50 border border-border px-2 py-1"
          >
            <span className="truncate text-sm text-foreground">
              {nameFor(person.developer_id, person.name)}
            </span>
            <span className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => promote.mutate(person.developer_id)}
                disabled={busy}
                title="Make primary assignee"
                aria-label={`Make ${nameFor(person.developer_id, person.name)} the primary assignee`}
                data-testid="task-collaborator-promote"
                className="text-muted-foreground hover:text-amber-500 transition disabled:opacity-50"
              >
                <Star className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeAssignee.mutate(person.developer_id)}
                disabled={busy}
                title="Remove from task"
                aria-label={`Remove ${nameFor(person.developer_id, person.name)} from this task`}
                data-testid="task-collaborator-remove"
                className="text-muted-foreground hover:text-red-500 transition disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          </li>
        ))}
      </ul>

      {picking ? (
        <select
          autoFocus
          defaultValue=""
          disabled={busy}
          data-testid="task-collaborator-picker"
          onChange={(e) => e.target.value && addCollaborator.mutate(e.target.value)}
          onBlur={() => setPicking(false)}
          className="mt-1.5 w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
        >
          <option value="">Select someone…</option>
          {addable.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={busy || addable.length === 0}
          data-testid="task-collaborator-add"
          className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {addable.length === 0 ? "Everyone is already on this" : "Add collaborator"}
        </button>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-red-500 dark:text-red-400" data-testid="task-collaborator-error">
          {error}
        </p>
      )}
    </div>
  );
}
