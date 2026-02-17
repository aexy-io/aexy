"use client";

import { useState, useEffect } from "react";
import {
  ChevronUp,
  MessageSquare,
  Plus,
  Lightbulb,
  Zap,
  Link2,
  Bug,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Send,
  Github,
  ArrowRight,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  publicProjectApi,
  authApi,
  RoadmapRequest,
  RoadmapComment,
  RoadmapCategory,
  RoadmapStatus,
} from "@/lib/api";
import { LoadingSpinner, EmptyState } from "./shared";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { Pagination } from "@/components/ui/pagination";

interface RoadmapTabProps {
  publicSlug: string;
  isAuthenticated?: boolean;
}

const CATEGORY_CONFIG: Record<RoadmapCategory, { label: string; icon: typeof Lightbulb; color: string }> = {
  feature: { label: "Feature", icon: Lightbulb, color: "text-blue-400 bg-blue-900/30" },
  improvement: { label: "Improvement", icon: Zap, color: "text-yellow-400 bg-yellow-900/30" },
  integration: { label: "Integration", icon: Link2, color: "text-purple-400 bg-purple-900/30" },
  bug_fix: { label: "Bug Fix", icon: Bug, color: "text-red-400 bg-red-900/30" },
  other: { label: "Other", icon: MoreHorizontal, color: "text-muted-foreground bg-accent" },
};

const STATUS_CONFIG: Record<RoadmapStatus, { label: string; icon: typeof Clock; color: string }> = {
  under_review: { label: "Under Review", icon: Clock, color: "text-muted-foreground" },
  planned: { label: "Planned", icon: CheckCircle2, color: "text-blue-400" },
  in_progress: { label: "In Progress", icon: Loader2, color: "text-yellow-400" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-green-400" },
  declined: { label: "Declined", icon: XCircle, color: "text-red-400" },
};

function getLoginUrls() {
  if (typeof window === "undefined") {
    return {
      github: authApi.getGitHubLoginUrl(undefined),
      google: authApi.getGoogleLoginUrl(undefined),
    };
  }

  // Store the current hash in sessionStorage so we can restore it after login
  const currentHash = window.location.hash;
  if (currentHash) {
    sessionStorage.setItem("postLoginHash", currentHash);
  }

  // Use URL without hash for redirect (hash must come after query params)
  const redirectUrl = window.location.origin + window.location.pathname + window.location.search;

  return {
    github: authApi.getGitHubLoginUrl(redirectUrl),
    google: authApi.getGoogleLoginUrl(redirectUrl),
  };
}

function LoginModal({ onClose }: { onClose: () => void }) {
  const loginUrls = getLoginUrls();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-muted rounded-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-primary-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lightbulb className="h-6 w-6 text-primary-400" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Login to Submit a Feature Request</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in with your account to submit feature requests, comment and vote on ideas.
          </p>

          <div className="space-y-3">
            <a
              href={loginUrls.google}
              className="group relative overflow-hidden bg-white text-black px-4 py-3 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3 w-full"
            >
              <GoogleIcon />
              Continue with Google
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href={loginUrls.github}
              className="group bg-accent hover:bg-muted text-foreground px-4 py-3 rounded-lg text-sm font-semibold transition-all border border-border hover:border-muted-foreground flex items-center justify-center gap-3 w-full"
            >
              <Github className="h-5 w-5" />
              Continue with GitHub
            </a>
          </div>

          <button
            onClick={onClose}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestCard({
  request,
  isAuthenticated,
  onVote,
  onOpenComments,
  onLoginRequired,
}: {
  request: RoadmapRequest;
  isAuthenticated: boolean;
  onVote: () => void;
  onOpenComments: () => void;
  onLoginRequired: () => void;
}) {
  const category = CATEGORY_CONFIG[request.category as RoadmapCategory] || CATEGORY_CONFIG.other;
  const status = STATUS_CONFIG[request.status as RoadmapStatus] || STATUS_CONFIG.under_review;
  const CategoryIcon = category.icon;
  const StatusIcon = status.icon;

  const handleVoteClick = () => {
    if (isAuthenticated) {
      onVote();
    } else {
      onLoginRequired();
    }
  };

  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex gap-4">
        {/* Vote button */}
        <button
          onClick={handleVoteClick}
          className={`flex flex-col items-center justify-center min-w-[60px] p-2 rounded-lg border transition cursor-pointer ${
            request.has_voted
              ? "bg-primary-600/20 border-primary-500 text-primary-400"
              : "bg-accent/50 border-border text-muted-foreground hover:border-muted-foreground"
          }`}
          title={isAuthenticated ? (request.has_voted ? "Remove vote" : "Upvote") : "Login to vote"}
        >
          <ChevronUp className={`h-5 w-5 ${request.has_voted ? "text-primary-400" : ""}`} />
          <span className="text-sm font-semibold">{request.vote_count}</span>
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-foreground font-medium">{request.title}</h3>
              {request.description && (
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{request.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {/* Category badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${category.color}`}>
              <CategoryIcon className="h-3 w-3" />
              {category.label}
            </span>

            {/* Status badge */}
            <span className={`inline-flex items-center gap-1 text-xs ${status.color}`}>
              <StatusIcon className={`h-3 w-3 ${request.status === "in_progress" ? "animate-spin" : ""}`} />
              {status.label}
            </span>

            {/* Comments */}
            <button
              onClick={onOpenComments}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
            >
              <MessageSquare className="h-3 w-3" />
              {request.comment_count} comments
            </button>

            {/* Submitter */}
            <span className="text-xs text-muted-foreground">
              by {request.submitted_by.name || "Anonymous"}
            </span>

            {/* Date */}
            <span className="text-xs text-muted-foreground">
              {new Date(request.created_at).toLocaleDateString()}
            </span>
          </div>

          {/* Admin response */}
          {request.admin_response && (
            <div className="mt-3 p-3 bg-accent/50 rounded-lg border-l-2 border-primary-500">
              <p className="text-xs text-primary-400 font-medium mb-1">Official Response</p>
              <p className="text-sm text-foreground">{request.admin_response}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentsModal({
  request,
  publicSlug,
  isAuthenticated,
  onClose,
}: {
  request: RoadmapRequest;
  publicSlug: string;
  isAuthenticated: boolean;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<RoadmapComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const loadComments = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await publicProjectApi.getRoadmapComments(publicSlug, request.id);
      setComments(data);
    } catch (err) {
      console.error("Failed to load comments:", err);
      setLoadError("Failed to load comments.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [publicSlug, request.id]);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !isAuthenticated) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const comment = await publicProjectApi.createRoadmapComment(publicSlug, request.id, newComment);
      setComments([...comments, comment]);
      setNewComment("");
    } catch (err) {
      console.error("Failed to submit comment:", err);
      setSubmitError("Failed to post comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-muted rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground">{request.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{request.vote_count} votes · {comments.length} comments</p>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="h-5 w-5" />
                <span>{loadError}</span>
              </div>
              <button
                onClick={loadComments}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No comments yet. Be the first to comment!</p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className={`p-3 rounded-lg ${comment.is_admin_response ? "bg-primary-900/20 border border-primary-700/50" : "bg-accent/50"}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {comment.author.avatar_url ? (
                    <img src={comment.author.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs text-foreground">
                      {(comment.author.name || "A")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-foreground">{comment.author.name || "Anonymous"}</span>
                  {comment.is_admin_response && (
                    <span className="text-xs text-primary-400 bg-primary-900/50 px-1.5 py-0.5 rounded">Admin</span>
                  )}
                  <span className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-foreground">{comment.content}</p>
              </div>
            ))
          )}
        </div>

        {/* Comment input */}
        <div className="p-4 border-t border-border">
          {isAuthenticated ? (
            <div className="space-y-2">
              {submitError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {submitError}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 bg-accent border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary-500"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmitComment()}
                />
                <button
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || isSubmitting}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-foreground rounded-lg transition"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              Login to Comment
            </button>
          )}
        </div>

        {/* Login Modal */}
        {showLoginModal && (
          <LoginModal onClose={() => setShowLoginModal(false)} />
        )}
      </div>
    </div>
  );
}

function CreateRequestModal({
  publicSlug,
  onClose,
  onCreated,
}: {
  publicSlug: string;
  onClose: () => void;
  onCreated: (request: RoadmapRequest) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<RoadmapCategory>("feature");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const request = await publicProjectApi.createRoadmapRequest(publicSlug, {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
      });
      onCreated(request);
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: unknown } } };
      const detail = axiosErr?.response?.data?.detail;
      const msg =
        (Array.isArray(detail) ? detail[0]?.msg : null) ??
        (typeof detail === "string" ? detail : null) ??
        "Failed to create request. Please try again.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-muted rounded-xl max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground">Submit a Request</h3>
          <p className="text-sm text-muted-foreground mt-1">Share your idea with the community</p>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of your request"
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide more details about your request..."
              rows={3}
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Category</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(CATEGORY_CONFIG) as [RoadmapCategory, typeof CATEGORY_CONFIG.feature][]).map(
                ([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition ${
                        category === key
                          ? "bg-primary-600/20 border-primary-500 text-foreground"
                          : "bg-accent/50 border-border text-muted-foreground hover:border-muted-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {config.label}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-foreground rounded-lg transition"
          >
            {isSubmitting ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

export function RoadmapTab({ publicSlug, isAuthenticated = false }: RoadmapTabProps) {
  const [requests, setRequests] = useState<RoadmapRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"votes" | "newest" | "oldest">("votes");
  const [statusFilter, setStatusFilter] = useState<RoadmapStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<RoadmapCategory | "">("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RoadmapRequest | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const loadRequests = async (page: number = currentPage) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await publicProjectApi.getRoadmapRequests(publicSlug, {
        sortBy,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setRequests(data.items);
      setTotalPages(data.total_pages);
      setTotalItems(data.total);
      setCurrentPage(data.page);
    } catch (err) {
      console.error("Failed to load roadmap requests:", err);
      setError("Failed to load requests. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
    loadRequests(1);
  }, [publicSlug, sortBy, statusFilter, categoryFilter]);

  const handleVote = async (request: RoadmapRequest) => {
    if (!isAuthenticated) return;

    setVoteError(null);
    try {
      const result = await publicProjectApi.voteRoadmapRequest(publicSlug, request.id);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === request.id
            ? { ...r, vote_count: result.vote_count, has_voted: result.has_voted }
            : r
        )
      );
    } catch (err) {
      console.error("Failed to vote:", err);
      setVoteError("Failed to register vote. Please try again.");
      // Auto-dismiss after 3 seconds
      setTimeout(() => setVoteError(null), 3000);
    }
  };

  const handleCreated = (newRequest: RoadmapRequest) => {
    // Go to page 1 to show the new request at the top
    setCurrentPage(1);
    loadRequests(1);
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      loadRequests(page);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="h-6 w-6" />
          <span className="text-lg font-medium">{error}</span>
        </div>
        <button
          onClick={()=>loadRequests(1)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm font-medium transition"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Vote error toast */}
      {voteError && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-red-900/90 border border-red-700 rounded-lg text-red-200 text-sm shadow-lg animate-in slide-in-from-bottom-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {voteError}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="bg-accent border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
          >
            <option value="votes">Most Voted</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RoadmapStatus | "")}
            className="bg-accent border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
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

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as RoadmapCategory | "")}
            className="bg-accent border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
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

        {/* Create button */}
        <button
          onClick={() => isAuthenticated ? setShowCreateModal(true) : setShowLoginModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition"
        >
          <Plus className="h-4 w-4" />
          Submit Request
        </button>
      </div>

      {/* Requests list */}
      {requests.length === 0 ? (
        <EmptyState message="No requests yet. Be the first to submit one!" />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              isAuthenticated={isAuthenticated}
              onVote={() => handleVote(request)}
              onOpenComments={() => setSelectedRequest(request)}
              onLoginRequired={() => setShowLoginModal(true)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={goToPage}
        className="pt-4"
      />

      {/* Status legend */}
      <div className="flex items-center justify-center gap-4 pt-4 flex-wrap">
        {(Object.entries(STATUS_CONFIG) as [RoadmapStatus, typeof STATUS_CONFIG.under_review][]).map(
          ([key, config]) => {
            const Icon = config.icon;
            return (
              <div key={key} className={`flex items-center gap-1.5 ${config.color}`}>
                <Icon className="h-3 w-3" />
                <span className="text-xs">{config.label}</span>
              </div>
            );
          }
        )}
      </div>

      {/* Modals */}
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}

      {showCreateModal && (
        <CreateRequestModal
          publicSlug={publicSlug}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedRequest && (
        <CommentsModal
          request={selectedRequest}
          publicSlug={publicSlug}
          isAuthenticated={isAuthenticated}
          onClose={() => setSelectedRequest(null)}
        />
      )}
    </div>
  );
}
