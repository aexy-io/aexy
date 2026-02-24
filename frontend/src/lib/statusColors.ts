/**
 * Centralized Status Color Design Tokens
 *
 * Single source of truth for all status, priority, severity, and category colors.
 * Import from here instead of hardcoding Tailwind classes in components.
 *
 * Pattern: { bg: "...", text: "..." } for badge-style usage
 * Usage: <span className={`${TICKET_STATUS_COLORS[status].bg} ${TICKET_STATUS_COLORS[status].text}`}>
 */

export interface StatusColor {
  bg: string;
  text: string;
  dot?: string;
}

// ─── Ticket ──────────────────────────────────────────────

export const TICKET_STATUS_COLORS: Record<string, StatusColor> = {
  new: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  acknowledged: { bg: "bg-purple-50 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
  in_progress: { bg: "bg-yellow-50 dark:bg-yellow-900/30", text: "text-yellow-600 dark:text-yellow-400", dot: "bg-yellow-500" },
  waiting_on_submitter: { bg: "bg-orange-50 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  resolved: { bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400", dot: "bg-green-500" },
  closed: { bg: "bg-accent/50", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export const TICKET_PRIORITY_COLORS: Record<string, StatusColor> = {
  low: { bg: "bg-accent", text: "text-foreground" },
  medium: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" },
  high: { bg: "bg-orange-50 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400" },
  urgent: { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400" },
};

// ─── Tasks / Sprint ──────────────────────────────────────

export const TASK_STATUS_COLORS: Record<string, StatusColor> = {
  backlog: { bg: "bg-accent/50", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  todo: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  in_progress: { bg: "bg-yellow-50 dark:bg-yellow-900/30", text: "text-yellow-600 dark:text-yellow-400", dot: "bg-yellow-500" },
  review: { bg: "bg-purple-50 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
  done: { bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400", dot: "bg-green-500" },
};

export const SPRINT_STATUS_COLORS: Record<string, StatusColor> = {
  planning: { bg: "bg-blue-500/20", text: "text-blue-400", dot: "bg-blue-500" },
  active: { bg: "bg-green-500/20", text: "text-green-400", dot: "bg-green-500" },
  review: { bg: "bg-amber-500/20", text: "text-amber-400", dot: "bg-amber-500" },
  retrospective: { bg: "bg-purple-500/20", text: "text-purple-400", dot: "bg-purple-500" },
  completed: { bg: "bg-muted-foreground/20", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

// ─── Priority (generic, shared across modules) ──────────

export const PRIORITY_COLORS: Record<string, StatusColor> = {
  critical: { bg: "bg-red-500/20", text: "text-red-400", dot: "bg-red-600" },
  high: { bg: "bg-orange-500/20", text: "text-orange-400", dot: "bg-orange-500" },
  medium: { bg: "bg-amber-500/20", text: "text-amber-400", dot: "bg-amber-500" },
  low: { bg: "bg-muted-foreground/20", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

// ─── Severity ────────────────────────────────────────────

export const SEVERITY_COLORS: Record<string, StatusColor> = {
  blocker: { bg: "bg-red-600", text: "text-white", dot: "bg-red-600" },
  critical: { bg: "bg-red-500", text: "text-white", dot: "bg-red-500" },
  major: { bg: "bg-orange-500", text: "text-white", dot: "bg-orange-500" },
  minor: { bg: "bg-yellow-500", text: "text-black", dot: "bg-yellow-500" },
  trivial: { bg: "bg-muted-foreground", text: "text-white", dot: "bg-muted-foreground" },
};

// ─── Booking ─────────────────────────────────────────────

export const BOOKING_STATUS_COLORS: Record<string, StatusColor> = {
  pending: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400" },
  confirmed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  cancelled: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  completed: { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400" },
  no_show: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
};

// ─── Compliance Reminders ────────────────────────────────

export const REMINDER_STATUS_COLORS: Record<string, StatusColor> = {
  active: { bg: "bg-green-500/20", text: "text-green-400", dot: "bg-green-500" },
  paused: { bg: "bg-amber-500/20", text: "text-amber-400", dot: "bg-amber-500" },
  archived: { bg: "bg-muted-foreground/20", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export const REMINDER_INSTANCE_COLORS: Record<string, StatusColor> = {
  pending: { bg: "bg-muted-foreground/20", text: "text-muted-foreground" },
  notified: { bg: "bg-blue-500/20", text: "text-blue-400" },
  acknowledged: { bg: "bg-purple-500/20", text: "text-purple-400" },
  completed: { bg: "bg-green-500/20", text: "text-green-400" },
  skipped: { bg: "bg-amber-500/20", text: "text-amber-400" },
  escalated: { bg: "bg-orange-500/20", text: "text-orange-400" },
  overdue: { bg: "bg-red-500/20", text: "text-red-400" },
};

export const REMINDER_CATEGORY_COLORS: Record<string, StatusColor> = {
  compliance: { bg: "bg-blue-500/20", text: "text-blue-400" },
  review: { bg: "bg-purple-500/20", text: "text-purple-400" },
  audit: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
  security: { bg: "bg-red-500/20", text: "text-red-400" },
  training: { bg: "bg-green-500/20", text: "text-green-400" },
  maintenance: { bg: "bg-amber-500/20", text: "text-amber-400" },
  reporting: { bg: "bg-indigo-500/20", text: "text-indigo-400" },
  custom: { bg: "bg-muted-foreground/20", text: "text-muted-foreground" },
};

// ─── Agents / Automations ────────────────────────────────

export const AGENT_STATUS_COLORS: Record<string, StatusColor> = {
  active: { bg: "bg-green-500/20", text: "text-green-400", dot: "bg-green-500" },
  inactive: { bg: "bg-muted-foreground/20", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export const EXECUTION_STATUS_COLORS: Record<string, StatusColor> = {
  pending: { bg: "bg-amber-500/20", text: "text-amber-400", dot: "bg-amber-500" },
  running: { bg: "bg-blue-500/20", text: "text-blue-400", dot: "bg-blue-500" },
  completed: { bg: "bg-green-500/20", text: "text-green-400", dot: "bg-green-500" },
  failed: { bg: "bg-red-500/20", text: "text-red-400", dot: "bg-red-500" },
  cancelled: { bg: "bg-muted-foreground/20", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

// ─── Project ─────────────────────────────────────────────

export const PROJECT_STATUS_COLORS: Record<string, StatusColor> = {
  active: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", dot: "bg-green-500" },
  on_hold: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  completed: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  archived: { bg: "bg-muted-foreground/10", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

// ─── CRM ─────────────────────────────────────────────────

export const CRM_ATTRIBUTE_TYPE_COLORS: Record<string, string> = {
  text: "#64748b",
  number: "#3b82f6",
  currency: "#10b981",
  date: "#8b5cf6",
  datetime: "#8b5cf6",
  checkbox: "#f59e0b",
  select: "#ec4899",
  multi_select: "#ec4899",
  status: "#6366f1",
  email: "#06b6d4",
  phone: "#14b8a6",
  url: "#0ea5e9",
  rating: "#f59e0b",
  record_reference: "#a855f7",
  user_reference: "#22c55e",
};

// ─── Helpers ─────────────────────────────────────────────

const DEFAULT_STATUS_COLOR: StatusColor = {
  bg: "bg-muted-foreground/20",
  text: "text-muted-foreground",
  dot: "bg-muted-foreground",
};

/**
 * Safely get a status color with fallback
 */
export function getStatusColor(
  colors: Record<string, StatusColor>,
  key: string | undefined | null
): StatusColor {
  if (!key) return DEFAULT_STATUS_COLOR;
  return colors[key] ?? DEFAULT_STATUS_COLOR;
}
