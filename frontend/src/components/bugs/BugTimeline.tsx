"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  User,
  ArrowRight,
  Send,
  Loader2,
  Plus,
  Settings,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bugsApi, BugActivity, BugActivityAction } from "@/lib/api";

interface BugTimelineProps {
  workspaceId: string;
  bugId: string;
}

const actionConfig: Record<
  BugActivityAction,
  {
    icon: React.ElementType;
    label: string;
    color: string;
    bgColor: string;
  }
> = {
  created: {
    icon: Plus,
    label: "created this bug",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  updated: {
    icon: Settings,
    label: "updated",
    color: "text-muted-foreground",
    bgColor: "bg-muted-foreground/10",
  },
  status_changed: {
    icon: ArrowRight,
    label: "changed status",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  assigned: {
    icon: UserCheck,
    label: "assigned",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-500/10",
  },
  comment: {
    icon: MessageSquare,
    label: "commented",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10",
  },
  verified: {
    icon: CheckCircle2,
    label: "verified the fix",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  reopened: {
    icon: RefreshCw,
    label: "reopened this bug",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10",
  },
};

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: "New",
    confirmed: "Confirmed",
    in_progress: "In Progress",
    fixed: "Fixed",
    verified: "Verified",
    closed: "Closed",
    wont_fix: "Won't Fix",
    duplicate: "Duplicate",
    cannot_reproduce: "Cannot Reproduce",
  };
  return labels[status] || status;
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    status: "status",
    severity: "severity",
    priority: "priority",
    assignee_id: "assignee",
    title: "title",
    description: "description",
  };
  return labels[field] || field;
}

export function BugTimeline({ workspaceId, bugId }: BugTimelineProps) {
  const [newComment, setNewComment] = useState("");
  const queryClient = useQueryClient();

  const { data: activities, isLoading } = useQuery({
    queryKey: ["bug-activities", workspaceId, bugId],
    queryFn: () => bugsApi.getActivities(workspaceId, bugId),
    enabled: !!workspaceId && !!bugId,
  });

  const addCommentMutation = useMutation({
    mutationFn: (comment: string) =>
      bugsApi.addComment(workspaceId, bugId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["bug-activities", workspaceId, bugId],
      });
      setNewComment("");
    },
  });

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment.trim());
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sortedActivities = [...(activities || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Activity
      </h3>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-accent/50" />

        <div className="space-y-4">
          {sortedActivities.map((activity) => {
            const config = actionConfig[activity.action] || actionConfig.updated;
            const Icon = config.icon;

            return (
              <div key={activity.id} className="relative flex gap-3 pl-1">
                {/* Icon */}
                <div
                  className={cn(
                    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border",
                    config.bgColor
                  )}
                >
                  <Icon className={cn("h-4 w-4", config.color)} />
                </div>

                {/* Content */}
                <div className="flex-1 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {/* Actor and action */}
                      <p className="text-sm">
                        <span className="font-medium text-foreground">
                          {activity.actor_name || "System"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {activity.action === "status_changed" &&
                          activity.old_value &&
                          activity.new_value ? (
                            <>
                              changed status from{" "}
                              <span className="text-foreground">
                                {getStatusLabel(activity.old_value)}
                              </span>{" "}
                              to{" "}
                              <span className="text-foreground">
                                {getStatusLabel(activity.new_value)}
                              </span>
                            </>
                          ) : activity.action === "updated" &&
                            activity.field_name ? (
                            <>
                              updated {getFieldLabel(activity.field_name)}
                              {activity.old_value && activity.new_value && (
                                <>
                                  {" "}
                                  from{" "}
                                  <span className="text-foreground">
                                    {activity.old_value}
                                  </span>{" "}
                                  to{" "}
                                  <span className="text-foreground">
                                    {activity.new_value}
                                  </span>
                                </>
                              )}
                            </>
                          ) : (
                            config.label
                          )}
                        </span>
                      </p>

                      {/* Comment content */}
                      {activity.comment && (
                        <div className="mt-2 rounded-lg bg-muted/50 border border-border/50 p-3">
                          <p className="text-sm text-foreground whitespace-pre-wrap">
                            {activity.comment}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(activity.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {sortedActivities.length === 0 && (
            <div className="pl-12 py-4 text-sm text-muted-foreground">
              No activity yet
            </div>
          )}
        </div>
      </div>

      {/* Add comment form */}
      <form onSubmit={handleSubmitComment} className="pt-4 border-t border-border/50">
        <div className="flex gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/50 border border-border">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-2">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!newComment.trim() || addCommentMutation.isPending}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-accent disabled:text-muted-foreground text-foreground text-sm font-medium rounded-lg transition-colors"
              >
                {addCommentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Comment
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
