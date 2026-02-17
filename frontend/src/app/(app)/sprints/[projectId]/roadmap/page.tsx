"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronUp,
  MessageSquare,
  Lightbulb,
  Zap,
  Link2,
  Bug,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Vote,
  ChevronDown,
  X,
  Send,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { CommandPalette } from "@/components/CommandPalette";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { useProject } from "@/hooks/useProjects";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type RoadmapCategory = "feature" | "improvement" | "integration" | "bug_fix" | "other";
type RoadmapStatus = "under_review" | "planned" | "in_progress" | "completed" | "declined";

interface RoadmapRequestAuthor {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface RoadmapRequest {
  id: string;
  title: string;
  description: string | null;
  category: RoadmapCategory;
  status: RoadmapStatus;
  vote_count: number;
  comment_count: number;
  submitted_by: RoadmapRequestAuthor;
  admin_response: string | null;
  created_at: string;
  has_voted?: boolean;
}

interface RoadmapComment {
  id: string;
  content: string;
  author: RoadmapRequestAuthor;
  is_admin_response: boolean;
  created_at: string;
}

const CATEGORY_CONFIG: Record<RoadmapCategory, { label: string; icon: typeof Lightbulb; color: string }> = {
  feature: { label: "Feature", icon: Lightbulb, color: "text-blue-400 bg-blue-900/30" },
  improvement: { label: "Improvement", icon: Zap, color: "text-yellow-400 bg-yellow-900/30" },
  integration: { label: "Integration", icon: Link2, color: "text-purple-400 bg-purple-900/30" },
  bug_fix: { label: "Bug Fix", icon: Bug, color: "text-red-400 bg-red-900/30" },
  other: { label: "Other", icon: MoreHorizontal, color: "text-muted-foreground bg-accent" },
};

const STATUS_CONFIG: Record<RoadmapStatus, { label: string; icon: typeof Clock; color: string; bgColor: string }> = {
  under_review: { label: "Under Review", icon: Clock, color: "text-muted-foreground", bgColor: "bg-accent" },
  planned: { label: "Planned", icon: CheckCircle2, color: "text-blue-400", bgColor: "bg-blue-900/50" },
  in_progress: { label: "In Progress", icon: Loader2, color: "text-yellow-400", bgColor: "bg-yellow-900/50" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-green-400", bgColor: "bg-green-900/50" },
  declined: { label: "Declined", icon: XCircle, color: "text-red-400", bgColor: "bg-red-900/50" },
};

function StatusDropdown({
  currentStatus,
  onStatusChange,
  isUpdating,
  disabled = false,
}: {
  currentStatus: RoadmapStatus;
  onStatusChange: (status: RoadmapStatus) => void;
  isUpdating: boolean;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const config = STATUS_CONFIG[currentStatus];
  const StatusIcon = config.icon;

  if (disabled) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium",
          config.bgColor,
          config.color
        )}
      >
        <StatusIcon className={cn("h-4 w-4", currentStatus === "in_progress" && "animate-spin")} />
        {config.label}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        disabled={isUpdating}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition",
          config.bgColor,
          config.color,
          isUpdating && "opacity-50 cursor-not-allowed"
        )}
      >
        {isUpdating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <StatusIcon className={cn("h-4 w-4", currentStatus === "in_progress" && "animate-spin")} />
        )}
        {config.label}
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 w-48 bg-muted border border-border rounded-lg shadow-xl z-50 py-1">
            {(Object.entries(STATUS_CONFIG) as [RoadmapStatus, typeof STATUS_CONFIG.under_review][]).map(
              ([status, statusConfig]) => {
                const Icon = statusConfig.icon;
                return (
                  <button
                    key={status}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStatusChange(status);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition",
                      currentStatus === status
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", statusConfig.color)} />
                    {statusConfig.label}
                  </button>
                );
              }
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RequestDetailModal({
  request,
  publicSlug,
  isAdmin,
  onClose,
  onStatusChange,
  isUpdatingStatus,
}: {
  request: RoadmapRequest;
  publicSlug: string;
  isAdmin: boolean;
  onClose: () => void;
  onStatusChange: (status: RoadmapStatus) => void;
  isUpdatingStatus: boolean;
}) {
  const [comments, setComments] = useState<RoadmapComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const category = CATEGORY_CONFIG[request.category] || CATEGORY_CONFIG.other;
  const CategoryIcon = category.icon;

  // Load comments
  useEffect(() => {
    const loadComments = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `${API_BASE_URL}/public/projects/${publicSlug}/roadmap-requests/${request.id}/comments`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        if (response.ok) {
          const data = await response.json();
          setComments(data);
        }
      } catch (error) {
        console.error("Failed to load comments:", error);
      } finally {
        setIsLoadingComments(false);
      }
    };

    loadComments();
  }, [publicSlug, request.id]);

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    setIsSubmittingComment(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/public/projects/${publicSlug}/roadmap-requests/${request.id}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: newComment }),
        }
      );

      if (response.ok) {
        const comment = await response.json();
        setComments((prev) => [...prev, comment]);
        setNewComment("");
      }
    } catch (error) {
      console.error("Failed to submit comment:", error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-muted rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs", category.color)}>
                <CategoryIcon className="h-3 w-3" />
                {category.label}
              </span>
              <StatusDropdown
                currentStatus={request.status}
                onStatusChange={onStatusChange}
                isUpdating={isUpdatingStatus}
                disabled={!isAdmin}
              />
            </div>
            <h2 className="text-xl font-semibold text-foreground">{request.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Submitted by {request.submitted_by.name} · {new Date(request.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center px-3 py-2 bg-accent/50 rounded-lg">
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-bold text-foreground">{request.vote_count}</span>
              <span className="text-xs text-muted-foreground">votes</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Description */}
          {request.description && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
              <p className="text-foreground whitespace-pre-wrap">{request.description}</p>
            </div>
          )}

          {/* Admin Response */}
          {request.admin_response && (
            <div className="p-4 bg-primary-900/20 border border-primary-500/30 rounded-lg">
              <h3 className="text-sm font-medium text-primary-400 mb-2">Official Response</h3>
              <p className="text-foreground">{request.admin_response}</p>
            </div>
          )}

          {/* Comments */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Comments ({comments.length})
            </h3>

            {isLoadingComments ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No comments yet. Be the first to comment!</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={cn(
                      "p-3 rounded-lg",
                      comment.is_admin_response
                        ? "bg-primary-900/20 border border-primary-500/30"
                        : "bg-accent/50"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {comment.author.avatar_url ? (
                        <img
                          src={comment.author.avatar_url}
                          alt={comment.author.name}
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <span className="text-sm font-medium text-foreground">{comment.author.name}</span>
                      {comment.is_admin_response && (
                        <span className="text-xs px-1.5 py-0.5 bg-primary-500/20 text-primary-400 rounded">
                          Team
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{comment.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Comment Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
              }}
            />
            <button
              onClick={handleSubmitComment}
              disabled={!newComment.trim() || isSubmittingComment}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-foreground rounded-lg transition"
            >
              {isSubmittingComment ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestCard({
  request,
  isAdmin,
  onStatusChange,
  isUpdating,
  onClick,
}: {
  request: RoadmapRequest;
  isAdmin: boolean;
  onStatusChange: (requestId: string, status: RoadmapStatus) => void;
  isUpdating: boolean;
  onClick: () => void;
}) {
  const category = CATEGORY_CONFIG[request.category] || CATEGORY_CONFIG.other;
  const CategoryIcon = category.icon;

  return (
    <div
      className="bg-muted rounded-lg p-4 border border-border cursor-pointer hover:border-border transition"
      onClick={onClick}
    >
      <div className="flex gap-4">
        {/* Vote count */}
        <div className="flex flex-col items-center justify-center min-w-[60px] p-2 rounded-lg bg-accent/50 border border-border">
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{request.vote_count}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-foreground font-medium">{request.title}</h3>
              {request.description && (
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{request.description}</p>
              )}
            </div>

            {/* Status dropdown for admin */}
            <StatusDropdown
              currentStatus={request.status}
              onStatusChange={(status) => onStatusChange(request.id, status)}
              isUpdating={isUpdating}
              disabled={!isAdmin}
            />
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full", category.color)}>
              <CategoryIcon className="h-3 w-3" />
              {category.label}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {request.comment_count} comments
            </span>
            <span>
              by {request.submitted_by.name} · {new Date(request.created_at).toLocaleDateString()}
            </span>
          </div>

          {/* Admin response if any */}
          {request.admin_response && (
            <div className="mt-3 p-3 bg-accent/50 rounded-lg border-l-2 border-primary-500">
              <p className="text-xs text-primary-400 font-medium mb-1">Official Response</p>
              <p className="text-sm text-foreground line-clamp-2">{request.admin_response}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RoadmapPage({
  params,
}: {
  params: { projectId: string };
}) {
  const { projectId } = params;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();
  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspaceId);
  const { project } = useProject(currentWorkspaceId, projectId);

  const [requests, setRequests] = useState<RoadmapRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"votes" | "newest" | "oldest">("votes");
  const [statusFilter, setStatusFilter] = useState<RoadmapStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<RoadmapCategory | "">("");
  const [selectedRequest, setSelectedRequest] = useState<RoadmapRequest | null>(null);

  // Check if user is admin/owner
  const currentMember = workspaceMembers.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

  const loadRequests = async () => {
    if (!project?.public_slug) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (sortBy) params.append("sort_by", sortBy);
      if (statusFilter) params.append("status", statusFilter);
      if (categoryFilter) params.append("category", categoryFilter);

      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/public/projects/${project.public_slug}/roadmap-requests?${params}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRequests(Array.isArray(data.items) ? data.items : []);
      }
    } catch (error) {
      console.error("Failed to load requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (project?.public_slug) {
      loadRequests();
    }
  }, [project?.public_slug, sortBy, statusFilter, categoryFilter]);

  const handleStatusChange = async (requestId: string, newStatus: RoadmapStatus) => {
    if (!currentWorkspaceId || !project?.public_slug || !isAdmin) return;

    setUpdatingRequestId(requestId);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_BASE_URL}/workspaces/${currentWorkspaceId}/projects/${projectId}/roadmap-requests/${requestId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (response.ok) {
        setRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, status: newStatus } : r))
        );
        // Also update selected request if open
        if (selectedRequest?.id === requestId) {
          setSelectedRequest((prev) => prev ? { ...prev, status: newStatus } : null);
        }
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    } finally {
      setUpdatingRequestId(null);
    }
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  // Group requests by status
  const groupedRequests = {
    under_review: requests.filter((r) => r.status === "under_review"),
    planned: requests.filter((r) => r.status === "planned"),
    in_progress: requests.filter((r) => r.status === "in_progress"),
    completed: requests.filter((r) => r.status === "completed"),
    declined: requests.filter((r) => r.status === "declined"),
  };

  return (
    <div className="min-h-screen bg-background">
      <CommandPalette workspaceId={currentWorkspaceId} projectId={projectId} />

      {/* Header */}
      <header className="border-b border-border bg-muted/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                href={`/sprints/${projectId}`}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Vote className="h-5 w-5 text-primary-500" />
                  Feature Requests
                </h1>
                <p className="text-xs text-muted-foreground">
                  {requests.length} requests · {isAdmin ? "Manage" : "View"} user feedback and feature requests
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-3 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground"
              >
                <option value="votes">Most Voted</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as RoadmapStatus | "")}
                className="px-3 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground"
              >
                <option value="">All Statuses</option>
                {(Object.entries(STATUS_CONFIG) as [RoadmapStatus, typeof STATUS_CONFIG.under_review][]).map(
                  ([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  )
                )}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as RoadmapCategory | "")}
                className="px-3 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground"
              >
                <option value="">All Categories</option>
                {(Object.entries(CATEGORY_CONFIG) as [RoadmapCategory, typeof CATEGORY_CONFIG.feature][]).map(
                  ([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Vote className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No feature requests yet</h3>
            <p className="text-muted-foreground">
              Feature requests submitted through your public project page will appear here.
            </p>
            {project?.is_public && project?.public_slug && (
              <Link
                href={`/p/${project.public_slug}`}
                target="_blank"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition"
              >
                View Public Page
              </Link>
            )}
          </div>
        ) : statusFilter || categoryFilter ? (
          // Filtered view - show as flat list
          <div className="space-y-3">
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                isAdmin={isAdmin}
                onStatusChange={handleStatusChange}
                isUpdating={updatingRequestId === request.id}
                onClick={() => setSelectedRequest(request)}
              />
            ))}
          </div>
        ) : (
          // Grouped by status view
          <div className="space-y-8">
            {(["under_review", "planned", "in_progress", "completed", "declined"] as RoadmapStatus[]).map(
              (status) => {
                const statusRequests = groupedRequests[status];
                if (statusRequests.length === 0) return null;

                const config = STATUS_CONFIG[status];
                const Icon = config.icon;

                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className={cn("h-5 w-5", config.color)} />
                      <h2 className={cn("font-medium", config.color)}>{config.label}</h2>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {statusRequests.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {statusRequests.map((request) => (
                        <RequestCard
                          key={request.id}
                          request={request}
                          isAdmin={isAdmin}
                          onStatusChange={handleStatusChange}
                          isUpdating={updatingRequestId === request.id}
                          onClick={() => setSelectedRequest(request)}
                        />
                      ))}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </main>

      {/* Request Detail Modal */}
      {selectedRequest && project?.public_slug && (
        <RequestDetailModal
          request={selectedRequest}
          publicSlug={project.public_slug}
          isAdmin={isAdmin}
          onClose={() => setSelectedRequest(null)}
          onStatusChange={(status) => handleStatusChange(selectedRequest.id, status)}
          isUpdatingStatus={updatingRequestId === selectedRequest.id}
        />
      )}
    </div>
  );
}
