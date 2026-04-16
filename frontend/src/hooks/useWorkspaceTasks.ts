"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCallback, useMemo, useState } from "react";
import {
  workspaceTasksApi,
  sprintApi,
  epicApi,
  SprintTask,
  SprintListItem,
  TaskStatus,
  TaskPriority,
  EpicListItem,
} from "@/lib/api";
import { useProjects } from "@/hooks/useProjects";

export interface WorkspaceBoardFilters {
  assignees: string[];
  priorities: TaskPriority[];
  labels: string[];
  epics: string[];
  teams: string[];
  sprints: string[];
  storyPoints: number[];
  search: string;
}

export interface WorkspaceTaskWithMeta extends SprintTask {
  sprint_name?: string;
  sprint_status?: string;
  team_name?: string;
  team_color?: string;
  team_icon?: string;
}

const EMPTY_FILTERS: WorkspaceBoardFilters = {
  assignees: [],
  priorities: [],
  labels: [],
  epics: [],
  teams: [],
  sprints: [],
  storyPoints: [],
  search: "",
};

/**
 * Workspace-level tasks hook — fetches every task across every project/sprint
 * in a workspace and layers client-side filtering on top.
 */
export function useWorkspaceTasks(workspaceId: string | null) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<WorkspaceBoardFilters>(EMPTY_FILTERS);

  // 1. All projects in the workspace (for team filter + card badges).
  // Reuse the shared hook so the projects cache is de-duplicated with the rest
  // of the app (same query key shape: ["projects", workspaceId, status]).
  const { projects, isLoading: projectsLoading } = useProjects(workspaceId);

  // Stable list of project ids so the sprints query key is referentially stable
  // (derived from the cached projects list rather than a fresh array every render).
  const projectIds = useMemo(() => projects.map((p) => p.id).sort(), [projects]);

  // 2. All sprints across every project — fetched in parallel once we have projects.
  const { data: allSprints, isLoading: sprintsLoading } = useQuery({
    queryKey: ["workspaceSprints", workspaceId, projectIds],
    queryFn: async () => {
      if (!workspaceId || projects.length === 0) return [] as SprintListItem[];
      const results = await Promise.all(
        projects.map((p) =>
          sprintApi.list(workspaceId, p.id).catch(() => [] as SprintListItem[]),
        ),
      );
      return results.flat();
    },
    enabled: !!workspaceId && !projectsLoading,
  });

  // 3. Epics across the workspace — needed so the Epic filter shows real titles
  // (not UUIDs). Cheap endpoint that returns a flat list.
  const { data: allEpics } = useQuery({
    queryKey: ["epics", workspaceId, { include_archived: false }],
    queryFn: () => epicApi.list(workspaceId!, { include_archived: false, limit: 500 }),
    enabled: !!workspaceId,
  });

  // 4. All tasks in the workspace — server-side scoped to workspace_id. Ask
  // for the backend's max (1000) so the board doesn't silently truncate at the
  // default 500 in workspaces with a lot of tasks.
  const { data: tasksRaw, isLoading: tasksLoading } = useQuery({
    queryKey: ["workspaceTasks", workspaceId],
    queryFn: () => workspaceTasksApi.list(workspaceId!, { limit: 1000 }),
    enabled: !!workspaceId,
  });

  const truncated = (tasksRaw?.length ?? 0) >= 1000;

  // Build lookup maps for joining sprint/team metadata onto each task.
  const sprintMap = useMemo(() => {
    const m = new Map<string, SprintListItem>();
    (allSprints || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [allSprints]);

  const projectMap = useMemo(() => {
    const m = new Map<string, (typeof projects)[number]>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const epicMap = useMemo(() => {
    const m = new Map<string, EpicListItem>();
    (allEpics || []).forEach((e) => m.set(e.id, e));
    return m;
  }, [allEpics]);

  const tasks: WorkspaceTaskWithMeta[] = useMemo(() => {
    if (!tasksRaw) return [];
    return tasksRaw.map((t) => {
      const sprint = t.sprint_id ? sprintMap.get(t.sprint_id) : undefined;
      const team = t.team_id ? projectMap.get(t.team_id) : undefined;
      return {
        ...t,
        sprint_name: sprint?.name,
        sprint_status: sprint?.status,
        team_name: team?.name,
        team_color: team?.color,
        team_icon: team?.icon,
      };
    });
  }, [tasksRaw, sprintMap, projectMap]);

  // Client-side filtering (same pattern as useProjectBoard).
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matches =
          task.title.toLowerCase().includes(q) ||
          task.description?.toLowerCase().includes(q) ||
          task.labels?.some((l) => l.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (filters.assignees.length > 0) {
        if (!task.assignee_id || !filters.assignees.includes(task.assignee_id)) return false;
      }
      if (filters.priorities.length > 0) {
        if (!filters.priorities.includes(task.priority)) return false;
      }
      if (filters.labels.length > 0) {
        if (!task.labels?.some((l) => filters.labels.includes(l))) return false;
      }
      if (filters.epics.length > 0) {
        if (!task.epic_id || !filters.epics.includes(task.epic_id)) return false;
      }
      if (filters.teams.length > 0) {
        if (!task.team_id || !filters.teams.includes(task.team_id)) return false;
      }
      if (filters.sprints.length > 0) {
        if (!task.sprint_id || !filters.sprints.includes(task.sprint_id)) return false;
      }
      if (filters.storyPoints.length > 0) {
        if (task.story_points == null || !filters.storyPoints.includes(task.story_points)) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filters]);

  // Group filtered tasks by status for Kanban columns.
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, WorkspaceTaskWithMeta[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    filteredTasks.forEach((task) => {
      if (grouped[task.status]) grouped[task.status].push(task);
    });
    return grouped;
  }, [filteredTasks]);

  // Filter options — derived from the unfiltered task set so users can still
  // discover values even after applying filters.
  const filterOptions = useMemo(() => {
    const assignees = new Map<string, { id: string; name: string; avatar?: string }>();
    const labels = new Set<string>();
    const epics = new Map<string, string>();
    const storyPointsSet = new Set<number>();

    tasks.forEach((task) => {
      if (task.assignee_id) {
        assignees.set(task.assignee_id, {
          id: task.assignee_id,
          name: task.assignee_name || "Unknown",
          avatar: task.assignee_avatar_url || undefined,
        });
      }
      task.labels?.forEach((l) => labels.add(l));
      if (task.epic_id) {
        // Prefer the real epic title; fall back to the id if the epic list
        // hasn't loaded yet (or references a deleted epic).
        const epic = epicMap.get(task.epic_id);
        epics.set(task.epic_id, epic?.title || task.epic_id);
      }
      if (task.story_points != null) storyPointsSet.add(task.story_points);
    });

    return {
      assignees: Array.from(assignees.values()),
      labels: Array.from(labels),
      epics: Array.from(epics.entries()).map(([id, name]) => ({ id, name })),
      sprints: allSprints || [],
      teams: projects.map((p) => ({ id: p.id, name: p.name, color: p.color, icon: p.icon })),
      storyPoints: Array.from(storyPointsSet).sort((a, b) => a - b),
    };
  }, [tasks, allSprints, projects, epicMap]);

  // Status update mutation — used by drag-drop in the Kanban.
  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      if (!workspaceId) throw new Error("workspaceId required");
      return workspaceTasksApi.updateStatus(workspaceId, taskId, status);
    },
    // Optimistic update so the card doesn't snap back before the PATCH resolves.
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["workspaceTasks", workspaceId] });
      const prev = queryClient.getQueryData<SprintTask[]>(["workspaceTasks", workspaceId]);
      if (prev) {
        queryClient.setQueryData<SprintTask[]>(
          ["workspaceTasks", workspaceId],
          prev.map((t) => (t.id === taskId ? { ...t, status } : t)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["workspaceTasks", workspaceId], ctx.prev);
      }
      toast.error("Failed to update task status");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaceTasks", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
      queryClient.invalidateQueries({ queryKey: ["projectTasks"] });
    },
  });

  const updateFilters = useCallback((update: Partial<WorkspaceBoardFilters>) => {
    setFilters((prev) => ({ ...prev, ...update }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      filters.search.length > 0 ||
      filters.assignees.length > 0 ||
      filters.priorities.length > 0 ||
      filters.labels.length > 0 ||
      filters.epics.length > 0 ||
      filters.teams.length > 0 ||
      filters.sprints.length > 0 ||
      filters.storyPoints.length > 0,
    [filters],
  );

  return {
    tasks,
    filteredTasks,
    tasksByStatus,
    projects,
    sprints: allSprints || [],
    filterOptions,
    filters,
    updateFilters,
    clearFilters,
    hasActiveFilters,
    isLoading: tasksLoading || projectsLoading || sprintsLoading,
    updateTaskStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
    truncated,
  };
}
