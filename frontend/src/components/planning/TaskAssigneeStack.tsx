"use client";

import React from "react";
import Image from "next/image";
import { User } from "lucide-react";
import { SprintTask, TaskAssignee } from "@/lib/api";

const MAX_FACES = 3;

/**
 * The people on a task, as shown on a card or row.
 *
 * Reads `assignees`, not `assignee_id`. A task can carry several people and no
 * primary — the "everyone equally on this" arrangement — and keying off the
 * single column renders that as "Unassigned", the opposite of the truth.
 *
 * Falls back to the `assignee_*` columns when `assignees` is absent, so a
 * response cached from before the field existed still shows a face instead of
 * silently emptying every card.
 */
export function effectiveAssignees(task: SprintTask): TaskAssignee[] {
  if (task.assignees && task.assignees.length > 0) return task.assignees;
  if (task.assignee_id) {
    return [
      {
        developer_id: task.assignee_id,
        name: task.assignee_name,
        email: null,
        avatar_url: task.assignee_avatar_url,
        is_primary: true,
        added_by_id: null,
        created_at: null,
      },
    ];
  }
  return [];
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().slice(0, 1).toUpperCase();
}

export function TaskAssigneeStack({ task }: { task: SprintTask }) {
  const people = effectiveAssignees(task);

  if (people.length === 0) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <User className="h-3 w-3" />
        Unassigned
      </div>
    );
  }

  const shown = people.slice(0, MAX_FACES);
  const overflow = people.length - shown.length;
  // Primary is first in the payload; with no primary there is no single name to
  // show, so the count speaks instead.
  const primary = people.find((p) => p.is_primary) ?? null;

  return (
    <div
      className="flex items-center gap-1.5"
      data-testid="task-assignee-stack"
      data-assignee-count={people.length}
      title={people
        .map((p) => `${p.name ?? "Unknown"}${p.is_primary ? " (primary)" : ""}`)
        .join(", ")}
    >
      <div className="flex items-center -space-x-1.5">
        {shown.map((person) =>
          person.avatar_url ? (
            <Image
              key={person.developer_id}
              src={person.avatar_url}
              alt={person.name || "Assignee"}
              width={18}
              height={18}
              className="rounded-full ring-1 ring-border bg-background"
            />
          ) : (
            <div
              key={person.developer_id}
              className="w-[18px] h-[18px] rounded-full bg-muted ring-1 ring-border flex items-center justify-center text-[9px] font-medium text-muted-foreground"
            >
              {initials(person.name)}
            </div>
          ),
        )}
        {overflow > 0 && (
          <div className="w-[18px] h-[18px] rounded-full bg-accent ring-1 ring-border flex items-center justify-center text-[9px] font-medium text-foreground">
            +{overflow}
          </div>
        )}
      </div>
      <span className="text-[11px] text-foreground truncate max-w-[80px]">
        {people.length === 1
          ? people[0].name || "Assigned"
          : primary
            ? `${primary.name ?? "Assigned"} +${people.length - 1}`
            : `${people.length} assignees`}
      </span>
    </div>
  );
}
