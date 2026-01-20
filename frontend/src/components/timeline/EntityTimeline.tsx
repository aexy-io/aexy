"use client";

import React, { useState } from "react";
import {
  MessageCircle,
  Send,
  User,
  Loader2,
  Trash2,
  PlusCircle,
  Edit,
  RefreshCw,
  TrendingUp,
  Link,
  Unlink,
  UserPlus,
} from "lucide-react";
import { TimelineEntry, EntityActivityType } from "@/lib/api";
import { useEntityTimeline } from "@/hooks/useEntityActivity";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface EntityTimelineProps {
  workspaceId: string;
  entityType: EntityActivityType;
  entityId: string;
  className?: string;
  showCommentInput?: boolean;
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  created: <PlusCircle className="h-4 w-4" />,
  updated: <Edit className="h-4 w-4" />,
  comment: <MessageCircle className="h-4 w-4" />,
  status_changed: <RefreshCw className="h-4 w-4" />,
  assigned: <UserPlus className="h-4 w-4" />,
  progress_updated: <TrendingUp className="h-4 w-4" />,
  linked: <Link className="h-4 w-4" />,
  unlinked: <Unlink className="h-4 w-4" />,
};

const ACTIVITY_COLORS: Record<string, string> = {
  created: "bg-green-500/20 text-green-400 border-green-500/30",
  updated: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  comment: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  status_changed: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  assigned: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  progress_updated: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  linked: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  unlinked: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function TimelineItem({
  entry,
  onDelete,
  canDelete,
  isDeleting,
}: {
  entry: TimelineEntry;
  onDelete?: (id: string) => void;
  canDelete: boolean;
  isDeleting: boolean;
}) {
  const icon = ACTIVITY_ICONS[entry.activity_type] || <Edit className="h-4 w-4" />;
  const colorClass = ACTIVITY_COLORS[entry.activity_type] || ACTIVITY_COLORS.updated;

  return (
    <div className="flex gap-3 relative group">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center border", colorClass)}>
          {icon}
        </div>
        <div className="w-px flex-1 bg-slate-700/50 mt-2" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {entry.actor ? (
              <>
                {entry.actor.avatar_url ? (
                  <img
                    src={entry.actor.avatar_url}
                    alt={entry.actor.name || "User"}
                    className="w-5 h-5 rounded-full"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center">
                    <User className="h-3 w-3 text-slate-300" />
                  </div>
                )}
                <span className="text-sm font-medium text-slate-200">
                  {entry.actor.name || entry.actor.email || "Unknown"}
                </span>
              </>
            ) : (
              <span className="text-sm text-slate-400">System</span>
            )}
            <span className="text-xs text-slate-500">
              {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
            </span>
          </div>

          {canDelete && entry.activity_type === "comment" && onDelete && (
            <button
              onClick={() => onDelete(entry.id)}
              disabled={isDeleting}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 transition-all"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Display text */}
        {entry.display_text && (
          <p className="text-sm text-slate-300 mt-1">{entry.display_text}</p>
        )}

        {/* Comment content */}
        {entry.content && (
          <div className="mt-2 p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{entry.content}</p>
          </div>
        )}

        {/* Changes */}
        {entry.changes && Object.keys(entry.changes).length > 0 && (
          <div className="mt-2 space-y-1">
            {Object.entries(entry.changes).map(([field, change]) => (
              <div key={field} className="text-xs text-slate-400">
                <span className="font-medium text-slate-300">{field}:</span>{" "}
                <span className="line-through text-slate-500">{change.old || "—"}</span>
                {" → "}
                <span className="text-slate-300">{change.new || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EntityTimeline({
  workspaceId,
  entityType,
  entityId,
  className,
  showCommentInput = true,
}: EntityTimelineProps) {
  const [comment, setComment] = useState("");
  const {
    timeline,
    isLoading,
    error,
    addComment,
    deleteComment,
    isAddingComment,
    isDeletingComment,
  } = useEntityTimeline(workspaceId, entityType, entityId);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || isAddingComment) return;

    try {
      await addComment(comment.trim());
      setComment("");
    } catch (err) {
      console.error("Failed to add comment:", err);
    }
  };

  const handleDeleteComment = async (activityId: string) => {
    try {
      await deleteComment(activityId);
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  if (error) {
    return (
      <div className={cn("text-red-400 text-sm p-4", className)}>
        Failed to load timeline
      </div>
    );
  }

  return (
    <div className={cn("", className)}>
      {/* Comment Input */}
      {showCommentInput && (
        <form onSubmit={handleSubmitComment} className="mb-6">
          <div className="flex gap-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none min-h-[80px]"
              rows={2}
            />
            <button
              type="submit"
              disabled={!comment.trim() || isAddingComment}
              className="self-end px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {isAddingComment ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
      )}

      {/* Timeline */}
      <div className="space-y-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : timeline.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No activity yet
          </div>
        ) : (
          timeline.map((entry, index) => (
            <TimelineItem
              key={entry.id}
              entry={entry}
              onDelete={handleDeleteComment}
              canDelete={true}
              isDeleting={isDeletingComment}
            />
          ))
        )}
      </div>
    </div>
  );
}
