"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceMembers } from "@/hooks/useWorkspace";
import { entityActivityApi, TimelineEntry } from "@/lib/api";
import { ticketFieldLabel } from "./ticketLabels";

// Full audit trail for a ticket, mirroring the task's History tab.
//
// The "Responses" tab shows `ticket_responses` — the conversation, plus the
// synthetic "Status changed from x to y" notes the service writes there. That
// is not the audit trail: a response row only exists when a developer was
// attached to the change, so anything done by an automation, an escalation or
// the alert ingest path left no trace on the ticket at all. The real record is
// `entity_activities`, which `TicketService` has been writing on create,
// update, assign, response and delete all along with nothing reading it back
// per-ticket. This tab is that read.
export function TicketHistoryPanel({
  workspaceId,
  ticketId,
}: {
  workspaceId: string | null;
  ticketId: string;
}) {
  const { members } = useWorkspaceMembers(workspaceId);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ticketTimeline", workspaceId, ticketId],
    queryFn: () => entityActivityApi.getTimeline(workspaceId!, "ticket", ticketId, { limit: 100 }),
    enabled: !!workspaceId && !!ticketId,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading history…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-500 dark:text-red-400">Failed to load history.</p>;
  }

  // Developer ids are what the log stores for assignment changes; turn them
  // back into names. An id with no matching member is someone who has since
  // been removed from the workspace — say so rather than printing a raw uuid.
  const nameById = new Map(
    members.map((m) => [m.developer_id, m.developer_name || m.developer_email || "Unknown user"]),
  );
  const lookupName = (id: string | null | undefined) =>
    !id ? "nobody" : nameById.get(id) ?? "a former member";

  // Oldest first, so the chain reads top-to-bottom in the order it happened —
  // same as the task history. The endpoint returns newest first.
  const entries = (data?.entries ?? []).slice().reverse();

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="ticket-history-empty">
        No history yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="ticket-history-list">
      {entries.map((entry) => (
        <li
          key={entry.id}
          data-testid="ticket-history-item"
          data-history-action={entry.activity_type}
          className="flex flex-col gap-1 rounded-lg border border-border bg-background/40 p-3 text-sm"
        >
          {renderLine(entry, lookupName)}
          {entry.content && (
            <p className="whitespace-pre-wrap text-foreground text-sm">{entry.content}</p>
          )}
          <time className="text-xs text-muted-foreground">
            {new Date(entry.created_at).toLocaleString()}
          </time>
        </li>
      ))}
    </ol>
  );
}

function renderLine(
  entry: TimelineEntry,
  lookupName: (id: string | null | undefined) => string,
): React.ReactNode {
  const actorName = entry.actor?.name || entry.actor?.email || "System";
  const changes = entry.changes ?? {};
  const val = (field: string, side: "old" | "new") => changes[field]?.[side] ?? null;

  const strong = (text: string) => <span className="text-foreground">{text}</span>;
  const withActor = (predicate: React.ReactNode) => (
    <span className="text-muted-foreground">
      <span className="text-foreground font-medium">{actorName}</span> {predicate}
    </span>
  );

  switch (entry.activity_type) {
    case "created":
      return withActor(<>raised this ticket</>);

    case "status_changed":
    case "resolved":
      if ("status" in changes) {
        return withActor(
          <>
            changed status: {strong(ticketFieldLabel(val("status", "old")))}
            {" → "}
            {strong(ticketFieldLabel(val("status", "new")))}
          </>,
        );
      }
      break;

    case "assigned": {
      const from = val("assignee_id", "old");
      const to = val("assignee_id", "new");
      if (!to) return withActor(<>unassigned {strong(lookupName(from))}</>);
      if (!from) return withActor(<>assigned this to {strong(lookupName(to))}</>);
      return withActor(
        <>
          reassigned from {strong(lookupName(from))} to {strong(lookupName(to))}
        </>,
      );
    }

    case "comment":
      return withActor(<>added a response</>);

    case "updated": {
      // `priority` and `severity` are slugs like status; everything else the
      // service records as a plain new value with no old side.
      const fields = Object.keys(changes);
      if (fields.length === 0) return withActor(<>made changes</>);
      if (fields.length === 1) {
        const field = fields[0];
        const oldVal = val(field, "old");
        const newVal = val(field, "new");
        const label = field.replace(/_/g, " ");
        const isSlug = field === "priority" || field === "severity";
        const show = (v: string | null) => (isSlug ? ticketFieldLabel(v) : v ?? "—");
        if (oldVal !== null) {
          return withActor(
            <>
              changed {label}: {strong(show(oldVal))}
              {" → "}
              {strong(show(newVal))}
            </>,
          );
        }
        return withActor(
          <>
            set {label} to {strong(show(newVal))}
          </>,
        );
      }
      return withActor(<>updated {fields.map((f) => f.replace(/_/g, " ")).join(", ")}</>);
    }
  }

  // Long tail — escalations, links, automation-driven types. `display_text` is
  // a whole sentence that already names the actor, so it stands alone.
  return (
    <span className="text-muted-foreground">
      {entry.display_text || entry.title || `${actorName} performed an action`}
    </span>
  );
}
