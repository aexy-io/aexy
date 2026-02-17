"use client";

import React from "react";
import {
  MoreVertical,
  User,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  XCircle,
  FileCheck,
  BookOpen,
} from "lucide-react";
import { UserStory, StoryStatus, StoryPriority } from "@/lib/api";
import { Badge } from "@/components/ui/premium-card";
import { cn } from "@/lib/utils";

const PRIORITY_CONFIG: Record<StoryPriority, { label: string; variant: "error" | "warning" | "info" | "default" }> = {
  critical: { label: "Critical", variant: "error" },
  high: { label: "High", variant: "warning" },
  medium: { label: "Medium", variant: "info" },
  low: { label: "Low", variant: "default" },
};

const STATUS_CONFIG: Record<StoryStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", color: "bg-muted-foreground", icon: <Circle className="h-3 w-3" /> },
  ready: { label: "Ready", color: "bg-blue-500", icon: <FileCheck className="h-3 w-3" /> },
  in_progress: { label: "In Progress", color: "bg-amber-500", icon: <Clock className="h-3 w-3" /> },
  review: { label: "Review", color: "bg-purple-500", icon: <Eye className="h-3 w-3" /> },
  accepted: { label: "Accepted", color: "bg-green-500", icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: "Rejected", color: "bg-red-500", icon: <XCircle className="h-3 w-3" /> },
};

interface StoryCardProps {
  story: UserStory;
  onClick?: (story: UserStory) => void;
  onDelete?: (storyId: string) => void;
  showEpic?: boolean;
  showRelease?: boolean;
  className?: string;
}

export function StoryCard({
  story,
  onClick,
  onDelete,
  showEpic = true,
  showRelease = true,
  className,
}: StoryCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const priorityConfig = PRIORITY_CONFIG[story.priority];
  const statusConfig = STATUS_CONFIG[story.status];

  const completedCriteria = story?.acceptance_criteria_completed as number;
  const totalCriteria = story?.acceptance_criteria_count as number;
  const criteriaProgress = totalCriteria > 0 ? (completedCriteria / totalCriteria) * 100 : 0;

  return (
    <div
      className={cn(
        "group relative bg-muted/50 border border-border/50 rounded-lg p-4 hover:border-border/50 hover:bg-muted/70 transition-all cursor-pointer",
        className
      )}
      onClick={() => onClick?.(story)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{story.key}</span>
          <Badge variant={priorityConfig.variant} className="text-xs">
            {priorityConfig.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-full", statusConfig.color)} title={statusConfig.label} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded hover:bg-accent/50 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground mb-2 line-clamp-2">{story.title}</h3>

      {/* Story format preview */}
      <div className="text-xs text-muted-foreground mb-3 space-y-1">
        <p className="line-clamp-1">
          <span className="text-muted-foreground">As a</span> {story.as_a}
        </p>
        <p className="line-clamp-1">
          <span className="text-muted-foreground">I want</span> {story.i_want}
        </p>
      </div>

      {/* Acceptance Criteria Progress */}
      {totalCriteria > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Acceptance Criteria</span>
            <span>
              {completedCriteria}/{totalCriteria}
            </span>
          </div>
          <div className="h-1 bg-accent rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${criteriaProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {story.story_points !== undefined && story.story_points !== null && (
            <span className="text-xs font-medium text-muted-foreground bg-accent/50 px-2 py-0.5 rounded">
              {story.story_points} pts
            </span>
          )}
          {story.labels && story.labels.length > 0 && (
            <span className="text-xs text-muted-foreground">{story.labels.length} labels</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {story.assignee_id && (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
              <User className="h-3 w-3 text-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          className="absolute right-2 top-10 z-10 bg-muted border border-border rounded-lg shadow-lg py-1 min-w-[140px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 flex items-center gap-2"
            onClick={() => {
              onClick?.(story);
              setShowMenu(false);
            }}
          >
            <BookOpen className="h-4 w-4" />
            View Details
          </button>
          {onDelete && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-accent/50 flex items-center gap-2"
              onClick={() => {
                onDelete(story.id);
                setShowMenu(false);
              }}
            >
              <XCircle className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
