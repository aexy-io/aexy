"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { usePeerRequests } from "@/hooks/useReviews";
import { ReviewRequest } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { ErrorPanel } from "@/components/ui/error-panel";

// Status pill visual config — colors + icon stay in the page since
// they're presentational. The localized label is resolved at render
// time from `reviews.peerRequests.status.*` so en/hi stay in sync.
const statusVisual: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  pending: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", icon: Clock },
  accepted: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", icon: CheckCircle },
  declined: { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: XCircle },
  completed: { color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", icon: CheckCircle },
};

type PeerRequestsT = ReturnType<typeof useTranslations<"reviews.peerRequests">>;

function statusLabel(t: PeerRequestsT, status: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const has = (t as any).has?.(`status.${status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return has ? (t as any)(`status.${status}`) : status;
}

function sourceLabel(t: PeerRequestsT, source: string | null | undefined): string {
  if (!source) return "—";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const has = (t as any).has?.(`source.${source}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (has) return (t as any)(`source.${source}`);
  return source.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function RequestCard({ request }: { request: ReviewRequest }) {
  const t = useTranslations("reviews.peerRequests");
  const visual = statusVisual[request.status] || statusVisual.pending;
  const StatusIcon = visual.icon;

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
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${visual.color} ${visual.bg}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {statusLabel(t, request.status)}
        </span>
      </div>

      {request.message && (
        <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
          &ldquo;{request.message}&rdquo;
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(request.created_at)}
          </span>
          <span>{sourceLabel(t, request.request_source)}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground transition" />
      </div>
    </Link>
  );
}

export default function PeerRequestsPage() {
  const t = useTranslations("reviews.peerRequests");
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const developerId = user?.id;

  const { requests, isLoading, error, refetch } = usePeerRequests(developerId);

  const pendingRequests = requests.filter((r) => r.status === "pending" || r.status === "accepted");
  const completedRequests = requests.filter((r) => r.status === "completed" || r.status === "declined");

  if (authLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
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
    <div>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Reviews", href: "/reviews" },
            { label: "Peer Requests" },
          ]}
          className="mb-6"
        />

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl">
            <MessageSquare className="h-7 w-7 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("description")}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-background/50 rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold text-foreground">{requests.length}</p>
            <p className="text-sm text-muted-foreground">{t("totalRequests")}</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold text-amber-400">
              {requests.filter((r) => r.status === "pending").length}
            </p>
            <p className="text-sm text-muted-foreground">{t("pending")}</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold text-blue-400">
              {requests.filter((r) => r.status === "accepted").length}
            </p>
            <p className="text-sm text-muted-foreground">{t("inProgress")}</p>
          </div>
          <div className="bg-background/50 rounded-xl p-4 border border-border">
            <p className="text-2xl font-bold text-green-400">
              {requests.filter((r) => r.status === "completed").length}
            </p>
            <p className="text-sm text-muted-foreground">{t("completed")}</p>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500/20 border-t-primary-500"></div>
          </div>
        ) : error ? (
          <ErrorPanel
            error={error}
            title={t("errors.failedToLoad")}
            onRetry={refetch}
          />
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium text-foreground mb-2">{t("noPeerRequests")}</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              {t("noPeerRequestsDescription")}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-400" />
                  {t("sections.pendingHeader", { count: pendingRequests.length })}
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
                  {t("sections.completedHeader", { count: completedRequests.length })}
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
          <h3 className="text-foreground font-medium mb-3">{t("aboutTitle")}</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {t("aboutDescription")}
          </p>
          <div className="grid md:grid-cols-4 gap-4 text-sm">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-cyan-400 font-medium mb-1">{t("coin.context")}</p>
              <p className="text-muted-foreground text-xs">{t("coin.contextDesc")}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-blue-400 font-medium mb-1">{t("coin.observation")}</p>
              <p className="text-muted-foreground text-xs">{t("coin.observationDesc")}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-purple-400 font-medium mb-1">{t("coin.impact")}</p>
              <p className="text-muted-foreground text-xs">{t("coin.impactDesc")}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-green-400 font-medium mb-1">{t("coin.nextSteps")}</p>
              <p className="text-muted-foreground text-xs">{t("coin.nextStepsDesc")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
