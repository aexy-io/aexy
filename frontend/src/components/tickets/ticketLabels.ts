// Shared display vocabulary for tickets.
//
// The ticket detail page renders these slugs in its Status/Priority/Severity
// pickers, and the History tab renders the *same* slugs read back out of the
// activity log. When each surface kept its own copy the two drifted — history
// would say `waiting_on_submitter` while the picker above it said "Waiting on
// Submitter", so the same state read as two different things on one screen.
// One map, imported by both.

import { TicketStatus, TicketPriority, TicketSeverity } from "@/lib/api";

export const STATUS_OPTIONS: { value: TicketStatus; label: string; color: string }[] = [
  { value: "new", label: "New", color: "text-blue-600 dark:text-blue-400" },
  { value: "acknowledged", label: "Acknowledged", color: "text-purple-600 dark:text-purple-400" },
  { value: "in_progress", label: "In Progress", color: "text-yellow-600 dark:text-yellow-400" },
  { value: "waiting_on_submitter", label: "Waiting on Submitter", color: "text-orange-600 dark:text-orange-400" },
  { value: "resolved", label: "Resolved", color: "text-green-600 dark:text-green-400" },
  { value: "closed", label: "Closed", color: "text-muted-foreground" },
];

export const PRIORITY_OPTIONS: { value: TicketPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "text-muted-foreground" },
  { value: "medium", label: "Medium", color: "text-blue-600 dark:text-blue-400" },
  { value: "high", label: "High", color: "text-orange-600 dark:text-orange-400" },
  { value: "urgent", label: "Urgent", color: "text-red-600 dark:text-red-400" },
];

export const SEVERITY_OPTIONS: { value: TicketSeverity; label: string; color: string; description: string }[] = [
  { value: "low", label: "Low", color: "text-muted-foreground", description: "Minor impact" },
  { value: "medium", label: "Medium", color: "text-blue-600 dark:text-blue-400", description: "Moderate impact" },
  { value: "high", label: "High", color: "text-orange-600 dark:text-orange-400", description: "Significant impact" },
  { value: "critical", label: "Critical", color: "text-red-600 dark:text-red-400", description: "System down" },
];

const LABEL_BY_SLUG = new Map<string, string>([
  ...STATUS_OPTIONS.map((o) => [o.value as string, o.label] as const),
  ...PRIORITY_OPTIONS.map((o) => [o.value as string, o.label] as const),
  ...SEVERITY_OPTIONS.map((o) => [o.value as string, o.label] as const),
]);

/**
 * Human label for a ticket status / priority / severity slug.
 *
 * Falls back to title-casing the slug so a value we don't know about — an
 * older status, or one added server-side before this list catches up — still
 * reads as words rather than leaking `waiting_on_submitter` into the UI.
 */
export function ticketFieldLabel(slug: string | null | undefined): string {
  if (!slug) return "—";
  const known = LABEL_BY_SLUG.get(slug);
  if (known) return known;
  return slug
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
