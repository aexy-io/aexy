"use client";

import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  User,
  Calendar,
} from "lucide-react";
import { usePeerRequests } from "@/hooks/useReviews";
import { ReviewRequest } from "@/lib/api";

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", icon: Clock },
  accepted: { label: "Accepted", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", icon: CheckCircle },
  declined: { label: "Declined", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: XCircle },
  completed: { label: "Completed", color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", icon: CheckCircle },
};

function RequestCard({ request }: { request: ReviewRequest }) {
  const status = statusConfig[request.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <Link
      href={`/reviews/peer-requests/${request.id}`}
      className="block bg-background/50 border border-border rounded-xl p-5 hover:border-border hover:bg-background transition group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <MessageSquare className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-foreground font-medium group-hover:text-amber-400 transition">
              Peer Review Request
            </p>
            <p className="text-xs text-muted-foreground">
              From {request.requester_name || "Unknown"}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bg}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {status.label}
        </span>
      </div>

      {request.message && (
        <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
          &quot;{request.message}&quot;
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(request.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="capitalize">{request.request_source}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground transition" />
      </div>
    </Link>
  );
}

export default function PeerRequestsPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const developerId = user?.id;

  const { requests, isLoading, error, refetch } = usePeerRequests(developerId);

  const pendingRequests = requests.filter((r) => r.status === "pending" || r.status === "accepted");
  const completedRequests = requests.filter((r) => r.status === "completed" || r.status === "declined");

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading peer requests...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Link */}
        <Link
          href="/reviews"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reviews
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl">
            <MessageSquare className="h-7 w-7 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Peer Review Requests</h1>
            <p className="text-muted-foreground text-sm">
              Feedback requests from your colleagues
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-background/50 rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold text-foreground">{requests.length}</p>
            <p className="text-sm text-muted-foreground">Total Requests</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold text-amber-400">
              {requests.filter((r) => r.status === "pending").length}
            </p>
            <p className="text-sm text-muted-foreground">Pending</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold text-blue-400">
              {requests.filter((r) => r.status === "accepted").length}
            </p>
            <p className="text-sm text-muted-foreground">In Progress</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold text-green-400">
              {requests.filter((r) => r.status === "completed").length}
            </p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400">Failed to load peer requests</p>
            <button
              onClick={refetch}
              className="mt-4 text-amber-400 hover:text-amber-300"
            >
              Try again
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium text-foreground mb-2">No peer requests yet</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              When colleagues request your feedback for their performance review, they&apos;ll appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-400" />
                  Pending Requests ({pendingRequests.length})
                </h2>
                <div className="space-y-3">
                  {pendingRequests.map((request) => (
                    <RequestCard key={request.id} request={request} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed Requests */}
            {completedRequests.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  Completed ({completedRequests.length})
                </h2>
                <div className="space-y-3">
                  {completedRequests.map((request) => (
                    <RequestCard key={request.id} request={request} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 bg-background/30 rounded-xl p-6 border border-border/50">
          <h3 className="text-foreground font-medium mb-3">About Peer Reviews</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Peer reviews use the COIN framework for structured, constructive feedback:
          </p>
          <div className="grid md:grid-cols-4 gap-4 text-sm">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-cyan-400 font-medium mb-1">Context</p>
              <p className="text-muted-foreground text-xs">The situation or setting</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-blue-400 font-medium mb-1">Observation</p>
              <p className="text-muted-foreground text-xs">Specific behavior observed</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-purple-400 font-medium mb-1">Impact</p>
              <p className="text-muted-foreground text-xs">Effect on team/project</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-green-400 font-medium mb-1">Next Steps</p>
              <p className="text-muted-foreground text-xs">Actionable recommendations</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
