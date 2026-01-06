"use client";

import React, { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  MoreVertical,
  User,
  ExternalLink,
  Trash2,
  Sparkles,
  CheckCircle,
  GitBranch,
  FileText,
  Target,
  GripVertical,
  MoveRight,
  Copy,
  Edit3,
  Circle,
  Clock,
  PlayCircle,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SprintTask, TaskPriority, TaskStatus } from "@/lib/api";
import { Badge } from "@/components/ui/premium-card";
import { cn } from "@/lib/utils";

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; variant: "error" | "warning" | "info" | "default" }> = {
  critical: { label: "Critical", variant: "error" },
  high: { label: "High", variant: "warning" },
  medium: { label: "Medium", variant: "info" },
  low: { label: "Low", variant: "default" },
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "bg-slate-500",
  todo: "bg-blue-500",
  in_progress: "bg-amber-500",
  review: "bg-purple-500",
  done: "bg-green-500",
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  github_issue: <GitBranch className="h-3 w-3" />,
  jira: <FileText className="h-3 w-3" />,
  linear: <Target className="h-3 w-3" />,
  manual: <FileText className="h-3 w-3" />,
};

const STATUS_QUICK_ACTIONS: { status: TaskStatus; icon: React.ReactNode; label: string; color: string }[] = [
  { status: "backlog", icon: <Circle className="h-3 w-3" />, label: "Backlog", color: "text-slate-400 hover:text-slate-300" },
  { status: "todo", icon: <Clock className="h-3 w-3" />, label: "To Do", color: "text-blue-400 hover:text-blue-300" },
  { status: "in_progress", icon: <PlayCircle className="h-3 w-3" />, label: "In Progress", color: "text-amber-400 hover:text-amber-300" },
  { status: "review", icon: <Eye className="h-3 w-3" />, label: "Review", color: "text-purple-400 hover:text-purple-300" },
  { status: "done", icon: <CheckCircle2 className="h-3 w-3" />, label: "Done", color: "text-green-400 hover:text-green-300" },
];

interface TaskCardPremiumProps {
  task: SprintTask & { sprint_name?: string };
  isDragging?: boolean;
  isSelected?: boolean;
  showSprintBadge?: boolean;
  onDelete?: (taskId: string) => void;
  onClick?: (task: SprintTask) => void;
  onSelect?: (taskId: string) => void;
  onMoveSprint?: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  suggestion?: {
    suggested_developer_name: string | null;
    confidence: number;
    reasoning: string;
  };
}

export function TaskCardPremium({
  task,
  isDragging,
  isSelected,
  showSprintBadge = false,
  onDelete,
  onClick,
  onSelect,
  onMoveSprint,
  onStatusChange,
  suggestion,
}: TaskCardPremiumProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showQuickStatus, setShowQuickStatus] = useState(false);
  const priorityConfig = PRIORITY_CONFIG[task.priority];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleClick = (e: React.MouseEvent) => {
    if (showMenu) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;

    // Shift+click for selection
    if (e.shiftKey && onSelect) {
      e.preventDefault();
      onSelect(task.id);
      return;
    }

    onClick?.(task);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(task.id);
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: isSortableDragging || isDragging ? 0.5 : 1,
        y: 0,
        scale: isSortableDragging ? 1.02 : 1,
      }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      whileHover={{ y: -1 }}
      onClick={handleClick}
      className={cn(
        "group relative bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 border transition-all duration-200",
        "hover:border-slate-500 hover:shadow-lg hover:shadow-black/20",
        isSelected
          ? "border-primary-500 ring-2 ring-primary-500/30"
          : "border-slate-700/50",
        suggestion && "ring-1 ring-primary-500/30",
        "cursor-pointer"
      )}
    >
      {/* Drag handle (visible on hover) */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1"
      >
        <GripVertical className="h-4 w-4 text-slate-500" />
      </div>

      {/* Selection checkbox */}
      {onSelect && (
        <div
          onClick={handleCheckboxClick}
          className={cn(
            "absolute -left-0.5 top-3 opacity-0 group-hover:opacity-100 transition-opacity",
            isSelected && "opacity-100"
          )}
        >
          <div
            className={cn(
              "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
              isSelected
                ? "bg-primary-500 border-primary-500"
                : "border-slate-500 hover:border-slate-400"
            )}
          >
            {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
          </div>
        </div>
      )}

      {/* Status indicator bar */}
      <div
        className={cn(
          "absolute top-0 left-3 right-3 h-0.5 rounded-b",
          STATUS_COLORS[task.status]
        )}
      />

      {/* Header row */}
      <div className="flex items-start justify-between mb-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          {task.source_type && (
            <span className="text-slate-500">{SOURCE_ICONS[task.source_type]}</span>
          )}
          <Badge variant={priorityConfig.variant} size="sm">
            {priorityConfig.label}
          </Badge>
          {task.story_points && (
            <Badge variant="outline" size="sm">
              {task.story_points} SP
            </Badge>
          )}
          {showSprintBadge && task.sprint_name && (
            <Badge variant="info" size="sm">
              {task.sprint_name}
            </Badge>
          )}
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="absolute right-0 top-full mt-1 w-40 bg-slate-700/95 backdrop-blur-xl rounded-lg shadow-xl z-20 py-1 border border-slate-600"
              >
                {task.source_url && (
                  <a
                    href={task.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-3 py-2 text-left text-xs text-white hover:bg-slate-600 flex items-center gap-2"
                    onClick={() => setShowMenu(false)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Source
                  </a>
                )}
                {onMoveSprint && (
                  <button
                    onClick={() => {
                      onMoveSprint(task.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-white hover:bg-slate-600 flex items-center gap-2"
                  >
                    <MoveRight className="h-3 w-3" />
                    Move to Sprint
                  </button>
                )}
                <button
                  onClick={() => {
                    onClick?.(task);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-white hover:bg-slate-600 flex items-center gap-2"
                >
                  <Edit3 className="h-3 w-3" />
                  Edit Task
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(task.title);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-white hover:bg-slate-600 flex items-center gap-2"
                >
                  <Copy className="h-3 w-3" />
                  Copy Title
                </button>
                {onDelete && (
                  <button
                    onClick={() => {
                      onDelete(task.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-slate-600 flex items-center gap-2"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                )}
              </motion.div>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-white mb-2 line-clamp-2 leading-snug">
        {task.title}
      </h4>

      {/* Description (truncated) */}
      {task.description && (
        <p className="text-xs text-slate-400 mb-2 line-clamp-2">{task.description}</p>
      )}

      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.slice(0, 3).map((label, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 text-slate-300 rounded"
            >
              {label}
            </span>
          ))}
          {task.labels.length > 3 && (
            <span className="text-[10px] text-slate-500">
              +{task.labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        {/* Assignee */}
        {task.assignee_id ? (
          <div className="flex items-center gap-1.5">
            {task.assignee_avatar_url ? (
              <Image
                src={task.assignee_avatar_url}
                alt={task.assignee_name || "Assignee"}
                width={18}
                height={18}
                className="rounded-full ring-1 ring-slate-600"
              />
            ) : (
              <div className="w-[18px] h-[18px] rounded-full bg-slate-600 flex items-center justify-center">
                <User className="h-2.5 w-2.5 text-slate-400" />
              </div>
            )}
            <span className="text-[11px] text-slate-300 truncate max-w-[80px]">
              {task.assignee_name || "Assigned"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <User className="h-3 w-3" />
            Unassigned
          </div>
        )}

        {/* AI Suggestion indicator */}
        {suggestion && (
          <div className="flex items-center gap-1 text-[10px] text-primary-400">
            <Sparkles className="h-3 w-3" />
            AI
          </div>
        )}

        {/* Subtasks */}
        {task.subtasks_count > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <CheckCircle className="h-3 w-3" />
            {task.subtasks_count}
          </div>
        )}
      </div>

      {/* AI Suggestion detail (expanded on hover) */}
      {suggestion && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="mt-2 pt-2 border-t border-slate-700/50"
        >
          <p className="text-[11px] text-slate-400">
            <span className="text-primary-400 font-medium">Suggested: </span>
            {suggestion.suggested_developer_name}
            <span className="text-slate-500 ml-1">
              ({Math.round(suggestion.confidence * 100)}%)
            </span>
          </p>
        </motion.div>
      )}

      {/* Quick Actions Bar - appears on hover */}
      <div className="absolute -bottom-1 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-1/2 pointer-events-none group-hover:pointer-events-auto z-10">
        <div className="flex items-center gap-0.5 bg-slate-700/95 backdrop-blur-sm rounded-full px-1.5 py-1 shadow-lg border border-slate-600">
          {/* Quick Edit */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick?.(task);
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600 rounded-full transition"
            title="Edit"
          >
            <Edit3 className="h-3 w-3" />
          </button>

          {/* Quick Status Change */}
          {onStatusChange && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQuickStatus(!showQuickStatus);
                }}
                className={cn(
                  "p-1.5 rounded-full transition",
                  STATUS_COLORS[task.status],
                  "bg-opacity-20 hover:bg-opacity-40"
                )}
                title="Change Status"
              >
                {STATUS_QUICK_ACTIONS.find(s => s.status === task.status)?.icon || <Circle className="h-3 w-3" />}
              </button>

              {showQuickStatus && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQuickStatus(false);
                    }}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-700/95 backdrop-blur-sm rounded-lg shadow-xl z-20 py-1 border border-slate-600 min-w-[120px]"
                  >
                    {STATUS_QUICK_ACTIONS.map(({ status, icon, label, color }) => (
                      <button
                        key={status}
                        onClick={(e) => {
                          e.stopPropagation();
                          onStatusChange(task.id, status);
                          setShowQuickStatus(false);
                        }}
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition",
                          status === task.status ? "bg-slate-600/50" : "hover:bg-slate-600/50",
                          color
                        )}
                      >
                        {icon}
                        {label}
                        {status === task.status && <CheckCircle className="h-3 w-3 ml-auto" />}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </div>
          )}

          {/* Delete */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Task card skeleton for loading state
export function TaskCardSkeleton() {
  return (
    <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/50 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-5 w-12 bg-slate-700 rounded" />
        <div className="h-5 w-10 bg-slate-700 rounded" />
      </div>
      <div className="h-4 w-3/4 bg-slate-700 rounded mb-2" />
      <div className="h-3 w-full bg-slate-700/50 rounded mb-2" />
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 bg-slate-700 rounded-full" />
          <div className="h-3 w-16 bg-slate-700 rounded" />
        </div>
      </div>
    </div>
  );
}

export default TaskCardPremium;
