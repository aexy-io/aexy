"use client";

/**
 * Task detail / edit modal — the Trello-like task view.
 *
 * Extracted out of the project board page so the workspace-level Tasks tab
 * (`/sprints?tab=tasks`) can open the very same modal in place instead of
 * pushing the user onto a project board they'd then have to navigate back
 * from. It's deliberately route-agnostic: every scoped call derives its ids
 * from `task.sprint_id` / `task.team_id`, never from the URL.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRightLeft,
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Loader2,
  Pencil,
  Ticket,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EpicListItem,
  SprintListItem,
  SprintTask,
  TaskPriority,
  TaskStatus,
  projectTasksApi,
  sprintApi,
} from "@/lib/api";
import type { FileAIMetadata } from "@/lib/api";
import { TaskDescriptionEditor, TaskDescriptionEditorRef, MentionUser } from "@/components/planning/TaskDescriptionEditor";
import { TaskGitHubLinksSection } from "@/components/sprints/TaskGitHubLinksSection";
import { MoveToProjectModal } from "@/components/planning/MoveToProjectModal";
import { FileMetadataPopover } from "@/components/files/FileMetadataPopover";
import { FileAILine } from "@/components/files/FileAIBadges";
import {
  CollapsiblePRInsight,
  ReviewerSuggestionsCard,
  SimilarPRsCard,
  TaskAlignmentBadge,
} from "@/components/code-insights";
import { PRIORITY_CONFIG, STATUS_CONFIG } from "@/components/sprints/taskFieldConfig";
import { invalidateTaskCaches } from "@/hooks/invalidateTaskCaches";

// Local helper type for the AI block on task attachments — the SprintTask
// shape from lib/api.ts hasn't been re-typed for `ai` yet (tracked
// separately), so we cast at call sites.
type TaskAttachmentWithAI = {
  id: string;
  file_url: string;
  file_name: string;
  ai?: FileAIMetadata | null;
};

// Full activity log for a task. Lives in the "History" tab of the
// EditTaskModal so every change is attributable to the user who made it —
// creation, assignment, status, priority, points, epic, dates, estimate,
// title/description/labels edits, and comments.
function AssignmentHistoryPanel({
  sprintId,
  teamId,
  taskId,
  users,
}: {
  sprintId: string | null;
  teamId: string | null;
  taskId: string;
  users: MentionUser[];
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["taskActivities", sprintId, teamId, taskId],
    queryFn: () => sprintId
      ? sprintApi.getTaskActivities(sprintId, taskId)
      : projectTasksApi.getTaskActivities(teamId!, taskId),
    enabled: !!sprintId || !!teamId,
  });

  if (!sprintId && !teamId) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="task-history-empty">
        No activity available — task is not linked to a sprint or team.
      </p>
    );
  }
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading history…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">Failed to load activity.</p>;
  }

  const userById = new Map(users.map((u) => [u.id, u]));
  const lookupName = (id: string | null | undefined) =>
    id ? userById.get(id)?.name ?? "Unknown user" : "Unassigned";

  // Show oldest first so the chain reads top-to-bottom in the order it
  // actually happened.
  const events = (data?.activities ?? []).slice().reverse();

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="task-history-empty">
        No activity yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="task-history-list">
      {events.map((event) => {
        const meta = event.metadata as { from_assignee_id?: string | null; to_assignee_id?: string | null } | null;
        const actorName = event.actor_name ?? "System";
        const oldStr = event.old_value ?? "—";
        const newStr = event.new_value ?? "—";

        let line: React.ReactNode;
        switch (event.action) {
          case "created":
            line = <>created this task</>;
            break;
          case "assigned":
            line = (
              <>
                reassigned from{" "}
                <span className="text-foreground">
                  {lookupName(meta?.from_assignee_id ?? event.old_value)}
                </span>{" "}
                to{" "}
                <span className="text-foreground">
                  {lookupName(meta?.to_assignee_id ?? event.new_value)}
                </span>
              </>
            );
            break;
          case "unassigned":
            line = (
              <>
                unassigned{" "}
                <span className="text-foreground">
                  {lookupName(meta?.from_assignee_id ?? event.old_value)}
                </span>
              </>
            );
            break;
          case "status_changed":
            line = (
              <>
                changed status: <span className="text-foreground">{oldStr}</span>{" → "}
                <span className="text-foreground">{newStr}</span>
              </>
            );
            break;
          case "priority_changed":
            line = (
              <>
                changed priority: <span className="text-foreground">{oldStr}</span>{" → "}
                <span className="text-foreground">{newStr}</span>
              </>
            );
            break;
          case "points_changed":
            line = (
              <>
                changed story points: <span className="text-foreground">{oldStr}</span>{" → "}
                <span className="text-foreground">{newStr}</span>
              </>
            );
            break;
          case "epic_changed":
            line = (
              <>
                {event.new_value
                  ? <>linked to epic <span className="text-foreground">{newStr}</span></>
                  : <>removed from epic</>}
              </>
            );
            break;
          case "title_changed":
            line = <>renamed to <span className="text-foreground">{newStr}</span></>;
            break;
          case "description_changed":
            line = <>updated the description</>;
            break;
          case "labels_changed":
            line = <>updated labels</>;
            break;
          case "start_date_changed":
            line = (
              <>
                {event.new_value
                  ? <>set start date to <span className="text-foreground">{newStr}</span></>
                  : <>cleared start date</>}
              </>
            );
            break;
          case "end_date_changed":
            line = (
              <>
                {event.new_value
                  ? <>set due date to <span className="text-foreground">{newStr}</span></>
                  : <>cleared due date</>}
              </>
            );
            break;
          case "estimated_hours_changed":
            line = (
              <>
                {event.new_value
                  ? <>set estimate to <span className="text-foreground">{newStr}h</span></>
                  : <>cleared estimate</>}
              </>
            );
            break;
          case "comment":
            line = <>commented</>;
            break;
          case "attachment_added":
            line = (
              <>
                attached{" "}
                <span className="text-foreground">{newStr}</span>
              </>
            );
            break;
          case "attachment_removed":
            line = (
              <>
                removed attachment{" "}
                <span className="text-foreground">{oldStr}</span>
              </>
            );
            break;
          case "archived":
            line = <>archived this task</>;
            break;
          case "unarchived":
            line = <>restored this task</>;
            break;
          case "sprint_changed":
            line = event.new_value
              ? (
                <>
                  moved into sprint{" "}
                  <span className="text-foreground">{newStr}</span>
                </>
              )
              : <>moved to backlog</>;
            break;
          default:
            line = (
              <>
                updated {event.field_name ?? event.action}
                {event.old_value || event.new_value ? (
                  <>: <span className="text-foreground">{oldStr}</span>{" → "}
                    <span className="text-foreground">{newStr}</span></>
                ) : null}
              </>
            );
        }

        return (
          <li
            key={event.id}
            data-testid="task-history-item"
            data-history-action={event.action}
            className="flex flex-col gap-1 rounded-lg border border-border bg-background/40 p-3 text-sm"
          >
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">{actorName}</span>{" "}
              {line}
            </span>
            {event.action === "comment" && event.comment && (
              <p className="whitespace-pre-wrap text-foreground text-sm">{event.comment}</p>
            )}
            <time className="text-xs text-muted-foreground">
              {new Date(event.created_at).toLocaleString()}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

// Edit Task Modal - Trello-like task detail view
export interface EditTaskModalProps {
  task: SprintTask;
  onClose: () => void;
  onUpdate: (data: {
    taskId: string;
    sprintId: string | null;
    updates: {
      title?: string;
      description?: string;
      description_json?: Record<string, unknown>;
      story_points?: number;
      priority?: TaskPriority;
      status?: TaskStatus;
      labels?: string[];
      epic_id?: string | null;
      assignee_id?: string | null;
      contributes_to_goal?: boolean;
      mentioned_user_ids?: string[];
      mentioned_file_paths?: string[];
      start_date?: string | null;
      end_date?: string | null;
      estimated_hours?: number | null;
    };
  }) => Promise<SprintTask>;
  onDelete: (data: { sprintId: string | null; taskId: string }) => Promise<void>;
  isUpdating: boolean;
  sprints: SprintListItem[];
  epics: EpicListItem[];
  users: MentionUser[];
}

export function EditTaskModal({ task, onClose, onUpdate, onDelete, isUpdating, sprints, epics, users }: EditTaskModalProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const CACHE_KEY = `task_draft_${task.id}`;

  // Try to restore cached state
  const getCachedState = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }, [CACHE_KEY]);

  const cachedState = getCachedState();

  const [title, setTitle] = useState(cachedState?.title ?? task.title);
  const [descriptionJson, setDescriptionJson] = useState<Record<string, unknown> | null>(
    cachedState?.descriptionJson ?? (task as any).description_json ?? null
  );
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>(
    cachedState?.mentionedUserIds ?? (task as any).mentioned_user_ids ?? []
  );
  const [mentionedFilePaths, setMentionedFilePaths] = useState<string[]>(
    cachedState?.mentionedFilePaths ?? (task as any).mentioned_file_paths ?? []
  );
  const [storyPoints, setStoryPoints] = useState(cachedState?.storyPoints ?? task.story_points?.toString() ?? "");
  const [priority, setPriority] = useState<TaskPriority>(cachedState?.priority ?? task.priority);
  const [status, setStatus] = useState<TaskStatus>(cachedState?.status ?? task.status);
  const [epicId, setEpicId] = useState<string>(cachedState?.epicId ?? task.epic_id ?? "");
  const [sprintId, setSprintId] = useState<string>(cachedState?.sprintId ?? task.sprint_id ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(cachedState?.assigneeId ?? task.assignee_id ?? "");
  const [contributesToGoal, setContributesToGoal] = useState(cachedState?.contributesToGoal ?? task.contributes_to_goal ?? false);
  // Schedule + estimated effort fields. Use the first 16 chars of an ISO
  // timestamp ("YYYY-MM-DDTHH:MM") so they bind directly to a
  // <input type="datetime-local">.
  const [startDate, setStartDate] = useState<string>(
    cachedState?.startDate ?? (task.start_date ? task.start_date.slice(0, 16) : ""),
  );
  const [endDate, setEndDate] = useState<string>(
    cachedState?.endDate ?? (task.end_date ? task.end_date.slice(0, 16) : ""),
  );
  const [estimatedHours, setEstimatedHours] = useState<string>(
    cachedState?.estimatedHours ?? task.estimated_hours?.toString() ?? "",
  );
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRestoredNotice, setShowRestoredNotice] = useState(!!cachedState);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showMoveProject, setShowMoveProject] = useState(false);
  const editorRef = useRef<TaskDescriptionEditorRef>(null);

  // Cache form state when values change
  const taskStartDateLocal = task.start_date ? task.start_date.slice(0, 16) : "";
  const taskEndDateLocal = task.end_date ? task.end_date.slice(0, 16) : "";
  const taskEstimatedHoursStr = task.estimated_hours?.toString() ?? "";
  useEffect(() => {
    const currentState = {
      title,
      descriptionJson,
      mentionedUserIds,
      mentionedFilePaths,
      storyPoints,
      priority,
      status,
      epicId,
      sprintId,
      assigneeId,
      startDate,
      endDate,
      estimatedHours,
    };

    // Only cache if there are actual changes from original task
    const hasLocalChanges =
      title !== task.title ||
      JSON.stringify(descriptionJson) !== JSON.stringify((task as any).description_json || null) ||
      storyPoints !== (task.story_points?.toString() || "") ||
      priority !== task.priority ||
      status !== task.status ||
      epicId !== (task.epic_id || "") ||
      sprintId !== (task.sprint_id || "") ||
      assigneeId !== (task.assignee_id || "") ||
      startDate !== taskStartDateLocal ||
      endDate !== taskEndDateLocal ||
      estimatedHours !== taskEstimatedHoursStr;

    if (hasLocalChanges) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(currentState));
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  }, [CACHE_KEY, title, descriptionJson, mentionedUserIds, mentionedFilePaths, storyPoints, priority, status, epicId, sprintId, assigneeId, startDate, endDate, estimatedHours, taskStartDateLocal, taskEndDateLocal, taskEstimatedHoursStr, task]);

  // Clear cache helper
  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
  }, [CACHE_KEY]);

  const handleDescriptionChange = useCallback((content: Record<string, unknown>, mentions: { user_ids: string[]; file_paths: string[] }) => {
    setDescriptionJson(content);
    setMentionedUserIds(mentions.user_ids);
    setMentionedFilePaths(mentions.file_paths);
  }, []);

  // Extract plain text from TipTap JSON
  function extractPlainText(doc: Record<string, unknown>): string {
    let text = "";
    const traverse = (node: any) => {
      if (node?.type === "text" && node.text) {
        text += node.text;
      }
      if (node?.type === "paragraph" || node?.type === "heading") {
        text += "\n";
      }
      if (node?.content && Array.isArray(node.content)) {
        node.content.forEach(traverse);
      }
    };
    traverse(doc);
    return text.trim();
  }

  const hasChanges =
    title !== task.title ||
    JSON.stringify(descriptionJson) !== JSON.stringify((task as any).description_json || null) ||
    storyPoints !== (task.story_points?.toString() || "") ||
    priority !== task.priority ||
    status !== task.status ||
    epicId !== (task.epic_id || "") ||
    sprintId !== (task.sprint_id || "") ||
    assigneeId !== (task.assignee_id || "") ||
    startDate !== taskStartDateLocal ||
    endDate !== taskEndDateLocal ||
    estimatedHours !== taskEstimatedHoursStr ||
    newAttachmentFiles.length > 0;

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      setError("End date must be after start date");
      return;
    }

    const plainDescription = descriptionJson ? extractPlainText(descriptionJson) : undefined;

    try {
      await onUpdate({
        taskId: task.id,
        sprintId: task.sprint_id || null,
        updates: {
          title: title.trim(),
          description: plainDescription,
          description_json: descriptionJson || undefined,
          story_points: storyPoints ? parseInt(storyPoints) : undefined,
          priority,
          status,
          epic_id: epicId || null,
          assignee_id: assigneeId || null,
          contributes_to_goal: contributesToGoal,
          mentioned_user_ids: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
          mentioned_file_paths: mentionedFilePaths.length > 0 ? mentionedFilePaths : undefined,
          start_date: startDate ? new Date(startDate).toISOString() : null,
          end_date: endDate ? new Date(endDate).toISOString() : null,
          estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
        },
      });

      // Upload any newly attached files after the task PATCH succeeds.
      // Sprint tasks → sprint-scoped endpoint; backlog tasks → project endpoint.
      if (newAttachmentFiles.length > 0) {
        setIsUploadingAttachments(true);
        try {
          if (task.sprint_id) {
            await sprintApi.uploadTaskAttachments(
              task.sprint_id,
              task.id,
              newAttachmentFiles,
            );
          } else if (task.team_id) {
            await projectTasksApi.uploadTaskAttachments(
              task.team_id,
              task.id,
              newAttachmentFiles,
            );
          }
          invalidateTaskCaches(queryClient, task.workspace_id ?? null);
          setNewAttachmentFiles([]);
        } finally {
          setIsUploadingAttachments(false);
        }
      }

      clearCache();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update task";
      setError(errorMessage);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      if (task.sprint_id) {
        await sprintApi.deleteTaskAttachment(task.sprint_id, task.id, attachmentId);
      } else if (task.team_id) {
        await projectTasksApi.deleteTaskAttachment(task.team_id, task.id, attachmentId);
      } else {
        return;
      }
      invalidateTaskCaches(queryClient, task.workspace_id ?? null);
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    }
  };

  // Handle discard - clear cache and close
  const handleDiscard = () => {
    clearCache();
    onClose();
  };

  const handleRequestClose = useCallback(() => {
    if (hasChanges) {
      setShowCloseConfirm(true);
      return;
    }

    onClose();
  }, [hasChanges, onClose]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleRequestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRequestClose]);

  const handleDelete = async () => {
    try {
      await onDelete({
        sprintId: task.sprint_id || null,
        taskId: task.id,
      });
      clearCache();
      onClose();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    setStatus(newStatus);
  };

  const githubLinksQueryKey = ["taskGithubLinks", task.sprint_id, task.team_id, task.id];
  const canUseProjectGitHubLinks = !!task.team_id;

  const { data: githubLinks = [], isLoading: isLoadingGithubLinks } = useQuery({
    queryKey: githubLinksQueryKey,
    queryFn: () => task.sprint_id
      ? sprintApi.getTaskGitHubLinks(task.sprint_id, task.id)
      : projectTasksApi.getTaskGitHubLinks(task.team_id!, task.id),
    enabled: !!task.sprint_id || canUseProjectGitHubLinks,
  });

  const unlinkGitHubLinkMutation = useMutation({
    mutationFn: (linkId: string) => task.sprint_id
      ? sprintApi.unlinkGitHubLink(task.sprint_id, task.id, linkId)
      : projectTasksApi.unlinkGitHubLink(task.team_id!, task.id, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: githubLinksQueryKey });
      toast.success("GitHub link removed");
    },
    onError: () => {
      toast.error("Failed to remove GitHub link");
    },
  });

  const selectedSprintName = task.sprint_id
    ? sprints.find((s) => s.id === task.sprint_id)?.name || "Sprint"
    : "Project Backlog";

  const pullRequestLinks = githubLinks.filter((link) => link.link_type === "pull_request");
  const issueLinks = githubLinks.filter((link) => link.link_type === "github_issue");
  const mentionToken = task.identifier ?? null;

  const copyMentionToken = useCallback(async () => {
    if (!mentionToken) return;
    try {
      await navigator.clipboard.writeText(mentionToken);
      toast.success("Mention copied");
    } catch {
      toast.error("Copy failed — select and copy manually");
    }
  }, [mentionToken]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
      onClick={(e) => e.target === e.currentTarget && handleRequestClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        aria-describedby="task-modal-meta"
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/95 shadow-2xl shadow-black/40 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border bg-gradient-to-r from-background via-muted/70 to-background px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {isEditingTitle ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                  autoFocus
                  className="w-full rounded-lg border border-primary-500/40 bg-background/70 px-3 py-2 text-xl font-semibold text-foreground shadow-inner focus:border-primary-400 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  id="task-modal-title"
                  onClick={() => setIsEditingTitle(true)}
                  className="-mx-2 flex max-w-full items-start gap-2 rounded-lg px-2 py-1 text-left text-xl font-semibold text-foreground transition hover:bg-accent/60 focus:bg-accent/60 focus:outline-none"
                >
                  <span className="min-w-0 break-words">{title}</span>
                  <Pencil className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </button>
              )}
              <div id="task-modal-meta" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {selectedSprintName}
                </span>
                <span>•</span>
                <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
                {task.source_type === "ticket" && task.source_id && (
                  <>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => router.push(`/tickets/${task.source_id}`)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-primary-400 transition hover:bg-accent hover:text-primary-300"
                      title="Open the ticket this task was created from"
                    >
                      <Ticket className="h-3.5 w-3.5" />
                      Source ticket
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </>
                )}
                {hasChanges && (
                  <>
                    <span>•</span>
                    <span className="text-amber-400">Unsaved changes</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close task modal"
              onClick={handleRequestClose}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Main content */}
          <div className="space-y-5 p-5 sm:p-6">
            {/* Tabs: Details / History */}
            <div className="flex gap-2 border-b border-border" data-testid="task-tabs">
              <button
                type="button"
                data-testid="task-tab-details"
                onClick={() => setActiveTab("details")}
                className={cn(
                  "px-3 py-2 text-sm font-medium transition border-b-2",
                  activeTab === "details"
                    ? "text-foreground border-primary-500"
                    : "text-muted-foreground border-transparent hover:text-foreground",
                )}
              >
                Details
              </button>
              <button
                type="button"
                data-testid="task-tab-history"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "px-3 py-2 text-sm font-medium transition border-b-2",
                  activeTab === "history"
                    ? "text-foreground border-primary-500"
                    : "text-muted-foreground border-transparent hover:text-foreground",
                )}
              >
                History
              </button>
            </div>

            {activeTab === "history" && (
              <AssignmentHistoryPanel
                sprintId={task.sprint_id}
                teamId={task.team_id}
                taskId={task.id}
                users={users}
              />
            )}

            {activeTab === "details" && (
              <>
            {/* Quick status buttons */}
            <section className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</label>
                <span className="text-xs text-muted-foreground">Saved with the rest of the task</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(s)}
                    disabled={isUpdating}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      status === s
                        ? `${STATUS_CONFIG[s].bgColor} ${STATUS_CONFIG[s].color} shadow-sm ring-1 ring-current`
                        : "bg-background/70 text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </section>

            {/* Description with mentions */}
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Description
                </label>
                <span className="text-xs text-muted-foreground">Use @ to mention</span>
              </div>
              <TaskDescriptionEditor
                ref={editorRef}
                content={descriptionJson}
                onChange={handleDescriptionChange}
                placeholder="Add more details... Use @ to mention team members"
                users={users}
                minHeight="260px"
              />
            </section>

            {/* GitHub activity — auto-linked from mentions */}
            <section className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">GitHub activity</h3>
                </div>
                {mentionToken && (
                  <button
                    type="button"
                    onClick={copyMentionToken}
                    title="Copy task mention"
                    aria-label="Copy task mention token"
                    className="inline-flex items-center gap-2 self-start rounded-md border border-border bg-background/70 px-2 py-1 text-xs font-mono text-foreground transition hover:bg-accent"
                  >
                    <span>{mentionToken}</span>
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Paste <span className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{mentionToken ?? "[workspace-slug:task-key]"}</span> into a GitHub PR or issue title/body and it links here automatically. Edit the body to remove the mention and the link is dropped.
              </p>
              {isLoadingGithubLinks ? (
                <p className="text-sm text-muted-foreground">Loading linked GitHub activity...</p>
              ) : (pullRequestLinks.length + issueLinks.length) === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing linked yet — mention this task in a PR or issue to populate.</p>
              ) : (
                <div className="space-y-3">
                  {pullRequestLinks.length > 0 && (
                    <div className="space-y-2">
                      {pullRequestLinks.map((link) => {
                        const pr = link.pull_request;
                        if (!pr) return null;
                        return (
                          <div key={link.id} className="space-y-1.5">
                            <div className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                              <span className={cn(
                                "rounded-full px-2 py-0.5 text-xs",
                                pr.state === "open"
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : pr.state === "merged"
                                    ? "bg-violet-500/15 text-violet-300"
                                    : "bg-muted text-muted-foreground"
                              )}>
                                {pr.state || "linked"}
                              </span>
                              <a
                                href={pr.url || "#"}
                                target={pr.url ? "_blank" : undefined}
                                rel={pr.url ? "noreferrer" : undefined}
                                className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline"
                              >
                                {pr.repository} #{pr.number}
                                {pr.title ? ` - ${pr.title}` : ""}
                              </a>
                              <button
                                type="button"
                                aria-label="Remove link"
                                onClick={() => unlinkGitHubLinkMutation.mutate(link.id)}
                                disabled={unlinkGitHubLinkMutation.isPending}
                                title="Remove this link (edit the GitHub body to remove the mention permanently)"
                                className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                              >
                                {unlinkGitHubLinkMutation.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <X className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                            <TaskAlignmentBadge linkId={link.id} />
                            <CollapsiblePRInsight prId={pr.id} />
                          </div>
                        );
                      })}
                      {pullRequestLinks.length === 1 &&
                        pullRequestLinks[0].pull_request && (
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <SimilarPRsCard prId={pullRequestLinks[0].pull_request.id} />
                            <ReviewerSuggestionsCard
                              prId={pullRequestLinks[0].pull_request.id}
                            />
                          </div>
                        )}
                    </div>
                  )}
                  {issueLinks.length > 0 && (
                    <div className="space-y-2">
                      {issueLinks.map((link) => {
                        const issue = link.github_issue;
                        if (!issue) return null;
                        return (
                          <div key={link.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-xs",
                              issue.state === "open" || issue.state === "todo" || issue.state === "in_progress"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : issue.state === "done" || issue.state === "closed"
                                  ? "bg-violet-500/15 text-violet-300"
                                  : "bg-muted text-muted-foreground"
                            )}>
                              <GitBranch className="mr-1 inline h-3 w-3" />
                              {issue.state || "linked"}
                            </span>
                            <a
                              href={issue.url}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline"
                            >
                              {issue.repository} #{issue.number}
                              {issue.title ? ` - ${issue.title}` : ""}
                            </a>
                            <button
                              type="button"
                              aria-label="Remove link"
                              onClick={() => unlinkGitHubLinkMutation.mutate(link.id)}
                              disabled={unlinkGitHubLinkMutation.isPending}
                              title="Remove this link (edit the GitHub body to remove the mention permanently)"
                              className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                            >
                              {unlinkGitHubLinkMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Attachments */}
            <section className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Attachments</h3>
                <input
                  type="file"
                  multiple
                  data-testid="task-attachments-input-edit"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    setNewAttachmentFiles((prev) => [...prev, ...files]);
                    e.currentTarget.value = "";
                  }}
                  className="text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-primary-600 file:text-white file:font-medium hover:file:bg-primary-700 file:cursor-pointer"
                />
              </div>
              {(task.attachments?.length ?? 0) === 0 && newAttachmentFiles.length === 0 && (
                <p className="text-xs text-muted-foreground">No attachments yet.</p>
              )}
              {(task.attachments?.length ?? 0) > 0 && (
                <ul className="space-y-1" data-testid="task-attachments-existing">
                  {task.attachments?.map((a) => {
                    const ai = (a as TaskAttachmentWithAI).ai ?? null;
                    return (
                      <li
                        key={a.id}
                        className="flex flex-col gap-1 rounded border border-border bg-background/50 px-2 py-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <FileMetadataPopover
                            workspaceId={(task as any).workspace_id ?? null}
                            sourceType="task_attachment"
                            sourceId={a.id}
                            initialMetadata={ai}
                          >
                            <a
                              href={a.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block max-w-[70%] truncate text-blue-400 hover:underline"
                            >
                              {a.file_name}
                            </a>
                          </FileMetadataPopover>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(a.id)}
                            className="text-muted-foreground hover:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                        {ai && (ai.ai_tags.length > 0 || ai.ai_status !== "done") && (
                          <FileAILine ai={ai} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {newAttachmentFiles.length > 0 && (
                <ul className="mt-2 space-y-1" data-testid="task-attachments-pending">
                  {newAttachmentFiles.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between text-xs bg-background/50 border border-dashed border-border rounded px-2 py-1"
                    >
                      <span className="text-foreground truncate max-w-[80%]">
                        {file.name}{" "}
                        <span className="text-muted-foreground">
                          ({Math.round(file.size / 1024)} KB)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewAttachmentFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-muted-foreground hover:text-red-400"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-5 border-t border-border bg-muted/40 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Properties</h3>
              <p className="mt-1 text-xs text-muted-foreground">Changes are applied when you save.</p>
            </div>
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              >
                {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>

            {/* Story Points */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Story Points</label>
              <input
                type="number"
                min="0"
                max="21"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                placeholder="0"
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Schedule + Estimated Effort */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Start Date & Time
              </label>
              <input
                type="datetime-local"
                data-testid="task-edit-start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                End Date & Time
              </label>
              <input
                type="datetime-local"
                data-testid="task-edit-end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Estimated Hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                data-testid="task-edit-estimated-hours"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="0"
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Sprint */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Sprint</label>
              <select
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              >
                <option value="">No Sprint</option>
                {sprints.filter(s => s.status !== "completed").map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Epic */}
            {epics.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Epic</label>
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
                >
                  <option value="">No Epic</option>
                  {epics.map((epic) => (
                    <option key={epic.id} value={epic.id}>{epic.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-2 py-1.5 bg-background/50 border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary-500"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>

            {/* Sprint Goal Checkbox */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contributesToGoal}
                  onChange={(e) => setContributesToGoal(e.target.checked)}
                  className="rounded border-border text-primary-500 focus:ring-primary-500"
                />
                <span className="text-xs text-muted-foreground">Contributes to Sprint Goal</span>
              </label>
            </div>

            {/* GitHub link picker — the linked list renders in the "GitHub
                activity" section, which owns the shared query key. */}
            {task.sprint_id && (
              <TaskGitHubLinksSection
                sprintId={task.sprint_id}
                teamId={task.team_id}
                taskId={task.id}
              />
            )}

            {/* Move to project */}
            {task.workspace_id && task.team_id && (
              <div className="pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowMoveProject(true)}
                  className="w-full px-2 py-1.5 text-foreground hover:bg-accent rounded text-sm transition flex items-center justify-center gap-2"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Move to project…
                </button>
              </div>
            )}

            {/* Archive button */}
            <div className="pt-4 border-t border-border">
              {showDeleteConfirm ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-400">Archive this task?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      className="flex-1 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-foreground rounded text-xs"
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 px-2 py-1 bg-accent hover:bg-muted text-foreground rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full px-2 py-1.5 text-amber-400 hover:bg-amber-500/10 rounded text-sm transition"
                >
                  Archive Task
                </button>
              )}
            </div>
          </aside>
        </div>

        {/* Restored from draft notice */}
        {showRestoredNotice && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-2 bg-blue-500/10 border-t border-blue-500/30 text-sm">
            <span className="text-blue-400">Draft restored from previous session</span>
            <button
              onClick={() => setShowRestoredNotice(false)}
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-background/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {hasChanges ? "Review and save your changes." : "No unsaved changes."}
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={!hasChanges || isUpdating}
              className="px-4 py-2 text-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || isUpdating}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50 transition"
            >
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isUpdating ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {showMoveProject && task.workspace_id && task.team_id && (
          <MoveToProjectModal
            workspaceId={task.workspace_id}
            sourceProjectId={task.team_id}
            taskIds={[task.id]}
            hasSubtasks={(task.subtasks_count ?? 0) > 0}
            sourceStatusSlug={task.status}
            onClose={() => setShowMoveProject(false)}
            onMoved={() => {
              // Source is archived/done — close the detail modal so the user
              // lands back on whichever list opened it, which will re-fetch.
              onClose();
            }}
          />
        )}

        {showCloseConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Unsaved changes</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Save your edits before closing, or discard them and close the task.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowCloseConfirm(false)}
                  className="rounded-lg px-4 py-2 text-sm text-foreground transition hover:bg-accent"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="rounded-lg px-4 py-2 text-sm text-amber-300 transition hover:bg-amber-500/10"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isUpdating}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
