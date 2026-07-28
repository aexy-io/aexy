/**
 * Presentation config for the canonical task status / priority enums.
 *
 * Lives outside the board page so both the board and the shared
 * `EditTaskModal` (which is now rendered from the workspace Tasks tab too)
 * read the same labels and color tokens.
 */

import { TaskPriority, TaskStatus } from "@/lib/api";
import {
  SPRINT_STATUS_COLORS as SPRINT_STATUS_COLORS_BASE,
  TASK_STATUS_COLORS as TASK_STATUS_COLORS_BASE,
} from "@/lib/statusColors";

// Status column configuration – derives text/bg from centralized tokens, adds label
export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  backlog: { label: "Backlog", color: TASK_STATUS_COLORS_BASE.backlog.text, bgColor: TASK_STATUS_COLORS_BASE.backlog.bg },
  todo: { label: "To Do", color: TASK_STATUS_COLORS_BASE.todo.text, bgColor: TASK_STATUS_COLORS_BASE.todo.bg },
  in_progress: { label: "In Progress", color: TASK_STATUS_COLORS_BASE.in_progress.text, bgColor: TASK_STATUS_COLORS_BASE.in_progress.bg },
  review: { label: "Review", color: TASK_STATUS_COLORS_BASE.review.text, bgColor: TASK_STATUS_COLORS_BASE.review.bg },
  done: { label: "Done", color: TASK_STATUS_COLORS_BASE.done.text, bgColor: TASK_STATUS_COLORS_BASE.done.bg },
};

// Sprint status dot colors – derived from centralized tokens
export const SPRINT_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(SPRINT_STATUS_COLORS_BASE).map(([k, v]) => [k, v.dot || "bg-muted-foreground"])
);

// Priority configuration for the modal
export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  critical: { label: "Critical", color: "text-red-600 dark:text-red-400" },
  high: { label: "High", color: "text-orange-600 dark:text-orange-400" },
  medium: { label: "Medium", color: "text-yellow-600 dark:text-yellow-400" },
  low: { label: "Low", color: "text-blue-600 dark:text-blue-400" },
};
