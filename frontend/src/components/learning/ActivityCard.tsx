"use client";

import { useState } from "react";
import {
  Play,
  Pause,
  CheckCircle2,
  Clock,
  ExternalLink,
  MoreVertical,
  Trash2,
  Star,
  BookOpen,
  Video,
  Code2,
  Users,
  FileText,
  Briefcase,
} from "lucide-react";
import { LearningActivityLog, ActivityType, ActivityStatus } from "@/lib/api";

interface ActivityCardProps {
  activity: LearningActivityLog;
  onStart?: () => Promise<unknown>;
  onComplete?: (data?: { rating?: number; notes?: string }) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onStartSession?: () => Promise<unknown>;
  onEndSession?: () => Promise<unknown>;
  isActiveSession?: boolean;
  compact?: boolean;
}

const activityTypeConfig: Record<ActivityType, { icon: typeof BookOpen; color: string; label: string }> = {
  course: { icon: BookOpen, color: "text-blue-600 dark:text-blue-400", label: "Course" },
  video: { icon: Video, color: "text-red-600 dark:text-red-400", label: "Video" },
  task: { icon: Code2, color: "text-green-600 dark:text-green-400", label: "Task" },
  project: { icon: Briefcase, color: "text-purple-600 dark:text-purple-400", label: "Project" },
  pairing: { icon: Users, color: "text-orange-600 dark:text-orange-400", label: "Pairing" },
  reading: { icon: FileText, color: "text-yellow-600 dark:text-yellow-400", label: "Reading" },
};

const statusConfig: Record<ActivityStatus, { color: string; bgColor: string; label: string }> = {
  not_started: { color: "text-muted-foreground", bgColor: "bg-accent", label: "Not Started" },
  in_progress: { color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-900/30", label: "In Progress" },
  completed: { color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 dark:bg-green-900/30", label: "Completed" },
  skipped: { color: "text-muted-foreground", bgColor: "bg-muted", label: "Skipped" },
};

export function ActivityCard({
  activity,
  onStart,
  onComplete,
  onDelete,
  onStartSession,
  onEndSession,
  isActiveSession = false,
  compact = false,
}: ActivityCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const typeConfig = activityTypeConfig[activity.activity_type];
  const status = statusConfig[activity.status];
  const TypeIcon = typeConfig.icon;

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const handleStart = async () => {
    if (!onStart) return;
    setIsLoading(true);
    try {
      await onStart();
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!onComplete) return;
    setShowRatingModal(true);
  };

  const submitComplete = async () => {
    if (!onComplete) return;
    setIsLoading(true);
    try {
      await onComplete({ rating: rating > 0 ? rating : undefined });
      setShowRatingModal(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsLoading(true);
    try {
      await onDelete();
    } finally {
      setIsLoading(false);
      setShowMenu(false);
    }
  };

  const handleToggleSession = async () => {
    if (isActiveSession && onEndSession) {
      setIsLoading(true);
      try {
        await onEndSession();
      } finally {
        setIsLoading(false);
      }
    } else if (!isActiveSession && onStartSession) {
      setIsLoading(true);
      try {
        await onStartSession();
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg ${status.bgColor} border border-border`}>
        <div className={`p-2 rounded-lg bg-muted ${typeConfig.color}`}>
          <TypeIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{activity.title}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={status.color}>{status.label}</span>
            {activity.actual_time_spent_minutes > 0 && (
              <>
                <span>-</span>
                <span>{formatDuration(activity.actual_time_spent_minutes)}</span>
              </>
            )}
          </div>
        </div>
        {activity.status === "completed" && activity.points_earned > 0 && (
          <span className="text-xs font-medium text-yellow-400">+{activity.points_earned} pts</span>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`rounded-xl border border-border overflow-hidden ${status.bgColor}`}>
        {/* Header */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Thumbnail or Icon */}
              {activity.thumbnail_url ? (
                <img
                  src={activity.thumbnail_url}
                  alt={activity.title}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className={`p-3 rounded-lg bg-muted ${typeConfig.color} flex-shrink-0`}>
                  <TypeIcon className="h-6 w-6" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${typeConfig.color} bg-muted`}>
                    {typeConfig.label}
                  </span>
                  <span className={`text-xs ${status.color}`}>{status.label}</span>
                </div>
                <h3 className="font-medium text-foreground line-clamp-2">{activity.title}</h3>
                {activity.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{activity.description}</p>
                )}
              </div>
            </div>

            {/* Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-8 w-36 bg-muted border border-border rounded-lg shadow-xl z-10">
                  {activity.external_url && (
                    <a
                      href={activity.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Link
                    </a>
                  )}
                  {onDelete && (
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-accent w-full text-left"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {activity.status === "in_progress" && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{activity.progress_percentage}%</span>
              </div>
              <div className="h-2 bg-accent rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${activity.progress_percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            {activity.estimated_duration_minutes && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Est: {formatDuration(activity.estimated_duration_minutes)}</span>
              </div>
            )}
            {activity.actual_time_spent_minutes > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-blue-400" />
                <span>Spent: {formatDuration(activity.actual_time_spent_minutes)}</span>
              </div>
            )}
            {activity.points_earned > 0 && (
              <div className="flex items-center gap-1 text-yellow-400">
                <Star className="h-3 w-3" />
                <span>{activity.points_earned} pts</span>
              </div>
            )}
            {activity.rating && (
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-3 w-3 ${star <= activity.rating! ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Skill tags */}
          {activity.skill_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {activity.skill_tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-accent text-foreground rounded">
                  {tag}
                </span>
              ))}
              {activity.skill_tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{activity.skill_tags.length - 3} more</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {activity.status !== "completed" && activity.status !== "skipped" && (
          <div className="border-t border-border p-3 flex items-center gap-2 bg-muted/50">
            {activity.status === "not_started" && onStart && (
              <button
                onClick={handleStart}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Start
              </button>
            )}

            {activity.status === "in_progress" && (
              <>
                {(onStartSession || onEndSession) && (
                  <button
                    onClick={handleToggleSession}
                    disabled={isLoading}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                      isActiveSession
                        ? "bg-orange-600 hover:bg-orange-700 text-white"
                        : "bg-accent hover:bg-muted text-foreground"
                    }`}
                  >
                    {isActiveSession ? (
                      <>
                        <Pause className="h-4 w-4" />
                        Stop Timer
                      </>
                    ) : (
                      <>
                        <Clock className="h-4 w-4" />
                        Start Timer
                      </>
                    )}
                  </button>
                )}
                {onComplete && (
                  <button
                    onClick={handleComplete}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-muted rounded-xl p-6 max-w-sm w-full mx-4 border border-border">
            <h3 className="text-lg font-medium text-foreground mb-4">Rate this activity</h3>
            <p className="text-sm text-muted-foreground mb-4">How helpful was this activity for your learning?</p>
            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 transition"
                >
                  <Star
                    className={`h-8 w-8 ${
                      star <= rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground hover:text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRatingModal(false)}
                className="flex-1 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={submitComplete}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
