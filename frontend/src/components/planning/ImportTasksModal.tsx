"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Check, ArrowRightLeft, Loader2, X, Inbox, FolderOpen, LayoutGrid } from "lucide-react";
import { SprintTask, SprintListItem, projectTasksApi } from "@/lib/api";
import { TASK_STATUS_COLORS, PRIORITY_COLORS } from "@/lib/statusColors";
import { toast } from "sonner";

interface ImportTasksModalProps {
  projectId: string;
  targetSprintId: string;
  targetSprintName: string;
  sprints: SprintListItem[];
  onClose: () => void;
}

export function ImportTasksModal({
  projectId,
  targetSprintId,
  targetSprintName,
  sprints,
  onClose,
}: ImportTasksModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "backlog" | string>("all");
  const queryClient = useQueryClient();

  // Fetch all project tasks including those in sprints
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ["projectTasks", projectId, "import"],
    queryFn: () => projectTasksApi.list(projectId, { includeSprintTasks: true }),
  });

  // Separate importable tasks from current board tasks
  const { availableTasks, boardTasks } = useMemo(() => {
    const nonArchived = allTasks.filter((t) => !t.is_archived);
    let importable = nonArchived.filter((t) => t.sprint_id !== targetSprintId);
    const board = nonArchived.filter((t) => t.sprint_id === targetSprintId);

    if (search) {
      const q = search.toLowerCase();
      const matchesSearch = (t: SprintTask) =>
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q);
      importable = importable.filter(matchesSearch);
    }

    if (sourceFilter === "backlog") {
      importable = importable.filter((t) => !t.sprint_id);
    } else if (sourceFilter !== "all" && sourceFilter !== "board") {
      importable = importable.filter((t) => t.sprint_id === sourceFilter);
    }

    return { availableTasks: importable, boardTasks: board };
  }, [allTasks, targetSprintId, search, sourceFilter]);

  // Group importable tasks by source
  const groupedTasks = useMemo(() => {
    const backlog = availableTasks.filter((t) => !t.sprint_id);
    const bySprint: Record<string, SprintTask[]> = {};

    for (const task of availableTasks) {
      if (task.sprint_id) {
        if (!bySprint[task.sprint_id]) bySprint[task.sprint_id] = [];
        bySprint[task.sprint_id].push(task);
      }
    }

    return { backlog, bySprint };
  }, [availableTasks]);

  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sprints) {
      map[s.id] = s.name;
    }
    return map;
  }, [sprints]);

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      const results = await Promise.all(
        taskIds.map((taskId) =>
          projectTasksApi.moveToSprint(projectId, taskId, targetSprintId)
        )
      );
      return results;
    },
    onSuccess: (results) => {
      toast.success(`Imported ${results.length} task${results.length > 1 ? "s" : ""} into ${targetSprintName}`);
      queryClient.invalidateQueries({ queryKey: ["projectTasks"] });
      queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
      queryClient.invalidateQueries({ queryKey: ["projectBoard"] });
      onClose();
    },
    onError: () => {
      toast.error("Failed to import tasks");
    },
  });

  const toggleTask = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === availableTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableTasks.map((t) => t.id)));
    }
  };

  const handleImport = () => {
    if (selectedIds.size === 0) return;
    importMutation.mutate(Array.from(selectedIds));
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const backlogCount = allTasks.filter((t) => !t.sprint_id && !t.is_archived).length;
  const otherSprintIds = [...new Set(allTasks.filter((t) => t.sprint_id && t.sprint_id !== targetSprintId && !t.is_archived).map((t) => t.sprint_id!))];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-muted rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Import Existing Tasks</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Move tasks from backlog or other sprints into <span className="font-medium text-foreground">{targetSprintName}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-lg transition">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Search + Filter */}
        <div className="px-6 py-3 border-b border-border flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-3 py-2 bg-accent border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
              autoFocus
            />
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 bg-accent border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary-500"
          >
            <option value="all">All sources</option>
            <option value="backlog">Backlog ({backlogCount})</option>
            {otherSprintIds.map((sid) => (
              <option key={sid} value={sid}>
                {sprintNameMap[sid] || "Sprint"} ({allTasks.filter((t) => t.sprint_id === sid).length})
              </option>
            ))}
          </select>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {/* Current Board Tasks (read-only) */}
              {boardTasks.length > 0 && sourceFilter === "all" && !search && (
                <div className="mb-3 pb-3 border-b border-border">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Already in {targetSprintName} ({boardTasks.length})
                  </div>
                  {boardTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg opacity-50"
                    >
                      <div className="h-4 w-4 rounded border border-border bg-accent flex-shrink-0 flex items-center justify-center">
                        <Check className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-muted-foreground truncate block">{task.title}</span>
                        {task.description && (
                          <span className="text-xs text-muted-foreground/70 truncate block mt-0.5" title={task.description}>
                            {task.description.length > 60 ? task.description.slice(0, 60) + "..." : task.description}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${(TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.todo).text} ${(TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.todo).bg}`}>
                        {task.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {availableTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Inbox className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm">
                    {search ? "No tasks match your search" : "No tasks available to import"}
                  </p>
                </div>
              ) : (
                <>
                  {/* Select All */}
                  <button
                    onClick={toggleAll}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                  >
                    <div
                      className={`h-4 w-4 rounded border flex items-center justify-center transition ${
                        selectedIds.size === availableTasks.length && availableTasks.length > 0
                          ? "bg-primary-600 border-primary-600"
                          : "border-border"
                      }`}
                    >
                      {selectedIds.size === availableTasks.length && availableTasks.length > 0 && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </div>
                    Select all ({availableTasks.length})
                  </button>

                  {/* Backlog Tasks */}
                  {groupedTasks.backlog.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Inbox className="h-3.5 w-3.5" />
                        Backlog ({groupedTasks.backlog.length})
                      </div>
                      {groupedTasks.backlog.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          selected={selectedIds.has(task.id)}
                          onToggle={() => toggleTask(task.id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Other Sprint Tasks */}
                  {Object.entries(groupedTasks.bySprint).map(([sprintId, tasks]) => (
                    <div key={sprintId}>
                      <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <FolderOpen className="h-3.5 w-3.5" />
                        {sprintNameMap[sprintId] || "Sprint"} ({tasks.length})
                      </div>
                      {tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          selected={selectedIds.has(task.id)}
                          onToggle={() => toggleTask(task.id)}
                        />
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {selectedIds.size} task{selectedIds.size !== 1 ? "s" : ""} selected
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-foreground hover:bg-accent rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selectedIds.size === 0 || importMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50"
            >
              {importMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4" />
              )}
              Import {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  selected,
  onToggle,
}: {
  task: SprintTask;
  selected: boolean;
  onToggle: () => void;
}) {
  const statusColor = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.todo;
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const description = task.description || "";
  const truncatedDesc = description.length > 60 ? description.slice(0, 60) + "..." : description;

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition ${
        selected ? "bg-primary-500/10" : "hover:bg-accent"
      }`}
    >
      <div
        className={`h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center transition ${
          selected ? "bg-primary-600 border-primary-600" : "border-border"
        }`}
      >
        {selected && <Check className="h-3 w-3 text-white" />}
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground truncate block">{task.title}</span>
        {truncatedDesc && (
          <span
            className="text-xs text-muted-foreground truncate block mt-0.5"
            title={description}
          >
            {truncatedDesc}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {task.story_points != null && (
          <span className="text-xs text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
            {task.story_points}pt
          </span>
        )}
        <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColor.text} ${priorityColor.bg}`}>
          {task.priority}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor.text} ${statusColor.bg}`}>
          {task.status}
        </span>
      </div>
    </button>
  );
}
