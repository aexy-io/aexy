"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import {
  sprintApi,
  projectTasksApi,
  SprintListItem,
  SprintTask,
  TaskStatus,
  TaskPriority,
} from "@/lib/api";

export type BoardViewMode = "sprint" | "status";

export interface BoardFilters {
  assignees: string[];
  priorities: TaskPriority[];
  labels: string[];
  epics: string[];
  sprints: string[];
  search: string;
}

export interface TaskWithSprint extends SprintTask {
  sprint_name?: string;
  sprint_status?: string;
}

// Fetch all tasks across sprints for a project
export function useProjectBoard(
  workspaceId: string | null,
  projectId: string | null
) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<BoardViewMode>("status");
  const [filters, setFilters] = useState<BoardFilters>({
    assignees: [],
    priorities: [],
    labels: [],
    epics: [],
    sprints: [],
    search: "",
  });

  // Fetch all sprints for the project
  const {
    data: sprints,
    isLoading: sprintsLoading,
  } = useQuery<SprintListItem[]>({
    queryKey: ["sprints", workspaceId, projectId],
    queryFn: () => sprintApi.list(workspaceId!, projectId!),
    enabled: !!workspaceId && !!projectId,
  });

  // Fetch tasks for each sprint AND project-level tasks (without sprint)
  const {
    data: allTasks,
    isLoading: tasksLoading,
  } = useQuery<TaskWithSprint[]>({
    queryKey: ["projectTasks", workspaceId, projectId, sprints?.map(s => s.id)],
    queryFn: async () => {
      const allTasksList: TaskWithSprint[] = [];

      // Fetch project-level tasks (tasks without a sprint)
      if (projectId) {
        try {
          const backlogTasks = await projectTasksApi.list(projectId, { includeSprintTasks: false });
          allTasksList.push(...backlogTasks.map((task: SprintTask) => ({
            ...task,
            sprint_name: undefined,
            sprint_status: undefined,
          })));
        } catch (error) {
          console.error("Failed to fetch project tasks:", error);
        }
      }

      // Fetch tasks for all sprints in parallel
      if (sprints && sprints.length > 0) {
        const taskPromises = sprints.map(async (sprint) => {
          const tasks = await sprintApi.getTasks(sprint.id);
          return tasks.map((task: SprintTask) => ({
            ...task,
            sprint_name: sprint.name,
            sprint_status: sprint.status,
          }));
        });

        const taskArrays = await Promise.all(taskPromises);
        allTasksList.push(...taskArrays.flat());
      }

      return allTasksList;
    },
    enabled: !!projectId,
  });

  // Move task to different sprint
  const moveTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      fromSprintId,
      toSprintId,
    }: {
      taskId: string;
      fromSprintId: string;
      toSprintId: string;
    }) => {
      // First get the task data
      const task = allTasks?.find(t => t.id === taskId);
      if (!task) throw new Error("Task not found");

      // Remove from current sprint
      await sprintApi.removeTask(fromSprintId, taskId);

      // Add to new sprint
      await sprintApi.addTask(toSprintId, {
        title: task.title,
        description: task.description || undefined,
        story_points: task.story_points || undefined,
        priority: task.priority,
        status: task.status,
        labels: task.labels,
        epic_id: task.epic_id || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTasks", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
      queryClient.invalidateQueries({ queryKey: ["sprintStats"] });
    },
  });

  // Update task status (works for both sprint tasks and project-level tasks)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, sprintId, status }: { taskId: string; sprintId: string | null; status: TaskStatus }) => {
      if (!sprintId && projectId) {
        // Project-level task - use project tasks API
        return projectTasksApi.update(projectId, taskId, { status });
      }
      if (sprintId) {
        return sprintApi.updateTaskStatus(sprintId, taskId, status);
      }
      throw new Error("Either sprintId or projectId is required");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTasks", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
    },
  });

  // Update task (full update for editing)
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, sprintId, updates }: {
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
      };
    }) => {
      if (!sprintId && projectId) {
        // Project-level task - use project tasks API
        return projectTasksApi.update(projectId, taskId, updates);
      }
      if (sprintId) {
        return sprintApi.updateTask(sprintId, taskId, updates);
      }
      throw new Error("Either sprintId or projectId is required");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTasks", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
    },
  });

  // Add task to a sprint (or project backlog if no sprint)
  const addTaskMutation = useMutation({
    mutationFn: async ({
      sprintId,
      task,
    }: {
      sprintId: string | null;
      task: {
        title: string;
        description?: string;
        description_json?: Record<string, unknown>;
        story_points?: number;
        priority: TaskPriority;
        status: TaskStatus;
        labels?: string[];
        epic_id?: string;
        assignee_id?: string;
        mentioned_user_ids?: string[];
        mentioned_file_paths?: string[];
      };
    }) => {
      if (!sprintId) {
        // Create project-level task (no sprint) using project tasks API
        if (!projectId) {
          throw new Error("Project ID is required to create a task.");
        }
        return projectTasksApi.create(projectId, {
          title: task.title,
          description: task.description,
          description_json: task.description_json,
          story_points: task.story_points,
          priority: task.priority,
          status: task.status,
          labels: task.labels,
          epic_id: task.epic_id,
          assignee_id: task.assignee_id,
          mentioned_user_ids: task.mentioned_user_ids,
          mentioned_file_paths: task.mentioned_file_paths,
        });
      }
      return sprintApi.addTask(sprintId, task);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTasks", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
      queryClient.invalidateQueries({ queryKey: ["sprintStats"] });
    },
  });

  // Delete task (works for both sprint and project-level tasks)
  const deleteTaskMutation = useMutation({
    mutationFn: async ({ sprintId, taskId }: { sprintId: string | null; taskId: string }) => {
      if (!sprintId && projectId) {
        // Project-level task - use project tasks API
        return projectTasksApi.delete(projectId, taskId);
      }
      if (sprintId) {
        return sprintApi.removeTask(sprintId, taskId);
      }
      throw new Error("Either sprintId or projectId is required");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTasks", workspaceId, projectId] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
      queryClient.invalidateQueries({ queryKey: ["sprintStats"] });
    },
  });

  // Filter tasks
  const filteredTasks = useMemo(() => {
    if (!allTasks) return [];

    return allTasks.filter((task) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          task.title.toLowerCase().includes(searchLower) ||
          task.description?.toLowerCase().includes(searchLower) ||
          task.labels?.some(l => l.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      // Assignee filter
      if (filters.assignees.length > 0) {
        if (!task.assignee_id || !filters.assignees.includes(task.assignee_id)) {
          return false;
        }
      }

      // Priority filter
      if (filters.priorities.length > 0) {
        if (!filters.priorities.includes(task.priority)) {
          return false;
        }
      }

      // Label filter
      if (filters.labels.length > 0) {
        if (!task.labels?.some(l => filters.labels.includes(l))) {
          return false;
        }
      }

      // Epic filter
      if (filters.epics.length > 0) {
        if (!task.epic_id || !filters.epics.includes(task.epic_id)) {
          return false;
        }
      }

      // Sprint filter
      if (filters.sprints.length > 0) {
        if (!task.sprint_id || !filters.sprints.includes(task.sprint_id)) {
          return false;
        }
      }

      return true;
    });
  }, [allTasks, filters]);

  // Group tasks by sprint (for sprint view)
  const tasksBySprint = useMemo(() => {
    const grouped: Record<string, TaskWithSprint[]> = {};

    // Initialize with empty arrays for all sprints
    sprints?.forEach((sprint) => {
      grouped[sprint.id] = [];
    });

    // Add backlog group for unassigned tasks (tasks without sprint_id)
    grouped["backlog"] = [];

    // Group tasks
    filteredTasks.forEach((task) => {
      if (task.sprint_id && grouped[task.sprint_id]) {
        grouped[task.sprint_id].push(task);
      } else if (!task.sprint_id) {
        // Tasks without sprint go to backlog
        grouped["backlog"].push(task);
      }
    });

    return grouped;
  }, [filteredTasks, sprints]);

  // Group tasks by status (for status view)
  const tasksByStatus = useMemo(() => {
    const statuses: TaskStatus[] = ["backlog", "todo", "in_progress", "review", "done"];
    const grouped: Record<TaskStatus, TaskWithSprint[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };

    filteredTasks.forEach((task) => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });

    return grouped;
  }, [filteredTasks]);

  // Get unique values for filter options
  const filterOptions = useMemo(() => {
    const assignees = new Map<string, { id: string; name: string; avatar?: string }>();
    const labels = new Set<string>();
    const epics = new Map<string, string>();

    allTasks?.forEach((task) => {
      if (task.assignee_id) {
        assignees.set(task.assignee_id, {
          id: task.assignee_id,
          name: task.assignee_name || "Unknown",
          avatar: task.assignee_avatar_url || undefined,
        });
      }
      task.labels?.forEach((l) => labels.add(l));
      if (task.epic_id) {
        epics.set(task.epic_id, task.epic_id); // TODO: get epic name
      }
    });

    return {
      assignees: Array.from(assignees.values()),
      labels: Array.from(labels),
      epics: Array.from(epics.entries()).map(([id, name]) => ({ id, name })),
      sprints: sprints || [],
    };
  }, [allTasks, sprints]);

  // Update filters
  const updateFilters = useCallback((update: Partial<BoardFilters>) => {
    setFilters((prev) => ({ ...prev, ...update }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      assignees: [],
      priorities: [],
      labels: [],
      epics: [],
      sprints: [],
      search: "",
    });
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search.length > 0 ||
      filters.assignees.length > 0 ||
      filters.priorities.length > 0 ||
      filters.labels.length > 0 ||
      filters.epics.length > 0 ||
      filters.sprints.length > 0
    );
  }, [filters]);

  return {
    // Data
    sprints: sprints || [],
    allTasks: allTasks || [],
    filteredTasks,
    tasksBySprint,
    tasksByStatus,
    filterOptions,

    // Loading states
    isLoading: sprintsLoading || tasksLoading,

    // View mode
    viewMode,
    setViewMode,

    // Filters
    filters,
    updateFilters,
    clearFilters,
    hasActiveFilters,

    // Mutations
    moveTask: moveTaskMutation.mutateAsync,
    isMovingTask: moveTaskMutation.isPending,
    updateTaskStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
    updateTask: updateTaskMutation.mutateAsync,
    isUpdatingTask: updateTaskMutation.isPending,
    addTask: addTaskMutation.mutateAsync,
    isAddingTask: addTaskMutation.isPending,
    deleteTask: deleteTaskMutation.mutateAsync,
    isDeletingTask: deleteTaskMutation.isPending,
  };
}

// Hook for board selection state
export function useBoardSelection() {
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

  const toggleTask = useCallback((taskId: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((taskIds: string[]) => {
    setSelectedTasks(new Set(taskIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTasks(new Set());
  }, []);

  const isSelected = useCallback(
    (taskId: string) => selectedTasks.has(taskId),
    [selectedTasks]
  );

  return {
    selectedTasks,
    selectedCount: selectedTasks.size,
    toggleTask,
    selectAll,
    clearSelection,
    isSelected,
    hasSelection: selectedTasks.size > 0,
  };
}
