"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { redirect, useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  ClipboardCheck,
  Target,
  Users,
  Plus,
  CheckCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  GitPullRequest,
  GitCommit,
  MessageSquare,
  TrendingUp,
  Eye,
  X,
  Sparkles,
  ExternalLink,
  ChevronDown,
  MoreHorizontal,
  UserCheck,
  Zap,
  Lightbulb,
  Code,
  Award,
  BarChart3,
  Loader2,
  Save,
  Send,
} from "lucide-react";
import { reviewsApi, IndividualReviewDetail, WorkGoal, GoalSuggestion } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ReviewDigestCard } from "@/components/code-insights";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/datetime";
import { getInitials } from "@/lib/strings";
import { GOAL_TYPE_COLORS, GOAL_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";
import { InvitePeerReviewersModal } from "@/components/reviews/InvitePeerReviewersModal";

// Extra statuses specific to the manage view (at_risk, pending not in centralized GOAL_STATUS_COLORS)
const extraGoalStatusColors: Record<string, { bg: string; text: string }> = {
  at_risk: { bg: "bg-red-500/20", text: "text-red-600 dark:text-red-400" },
  pending: { bg: "bg-muted-foreground/20", text: "text-muted-foreground" },
};

// Transform API data to component format
interface MemberData {
  id: string;
  name: string;
  role: string;
  email: string;
  joinedDate: string;
  manager: string;
  team: string;
  reviewStatus: string;
  skills: string[];
  contributions: {
    commits: number;
    prs: number;
    reviews: number;
    linesAdded: number;
    linesRemoved: number;
  };
  goals: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    progress: number;
    dueDate: string;
    keyResults: Array<{ description: string; target: number; current: number; unit: string }>;
  }>;
  suggestions: Array<{
    id: string;
    title: string;
    description: string;
    suggestedGoal: string;
    source: string;
    confidence: number;
    keywords: string[];
  }>;
  feedbackSummary: {
    strengths: string[];
    growthAreas: string[];
    peerCount: number;
  };
}

function transformReviewToMemberData(review: IndividualReviewDetail, suggestions: GoalSuggestion[]): MemberData {
  const contributionSummary = review.contribution_summary as {
    metrics?: {
      commits?: { total?: number };
      pull_requests?: { total?: number };
      code_reviews?: { total?: number };
      lines?: { added?: number; removed?: number };
      skills_demonstrated?: string[];
    };
  } | null;

  // Extract strengths and growth areas from reviews
  const strengths: string[] = [];
  const growthAreas: string[] = [];

  if (review.self_review?.responses?.strengths) {
    strengths.push(...(Array.isArray(review.self_review.responses.strengths)
      ? review.self_review.responses.strengths
      : [review.self_review.responses.strengths]));
  }
  if (review.manager_review?.responses?.strengths) {
    strengths.push(...(Array.isArray(review.manager_review.responses.strengths)
      ? review.manager_review.responses.strengths
      : [review.manager_review.responses.strengths]));
  }
  if (review.self_review?.responses?.growth_areas) {
    growthAreas.push(...(Array.isArray(review.self_review.responses.growth_areas)
      ? review.self_review.responses.growth_areas
      : [review.self_review.responses.growth_areas]));
  }

  return {
    id: review.id,
    name: review.developer_name || "Team Member",
    role: "Team Member",
    email: review.developer_email || "",
    joinedDate: new Date(review.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    manager: review.manager_name || "Manager",
    team: "Team",
    reviewStatus: review.status,
    skills: contributionSummary?.metrics?.skills_demonstrated || [],
    contributions: {
      commits: contributionSummary?.metrics?.commits?.total || 0,
      prs: contributionSummary?.metrics?.pull_requests?.total || 0,
      reviews: contributionSummary?.metrics?.code_reviews?.total || 0,
      linesAdded: contributionSummary?.metrics?.lines?.added || 0,
      linesRemoved: contributionSummary?.metrics?.lines?.removed || 0,
    },
    goals: (review.goals || []).map((g: WorkGoal) => ({
      id: g.id,
      title: g.title,
      type: g.goal_type,
      status: g.status,
      progress: g.progress_percentage,
      dueDate: g.time_bound || "",
      keyResults: g.key_results.map(kr => ({
        description: kr.description,
        target: kr.target,
        current: kr.current,
        unit: kr.unit,
      })),
    })),
    suggestions: suggestions.map((s, index) => ({
      id: `suggestion-${index}`,
      title: s.title,
      description: s.suggested_measurable || "",
      suggestedGoal: s.title,
      source: s.source,
      confidence: s.confidence,
      keywords: s.suggested_keywords || [],
    })),
    feedbackSummary: {
      strengths: strengths.slice(0, 5),
      growthAreas: growthAreas.slice(0, 5),
      peerCount: review.peer_reviews?.length || 0,
    },
  };
}

export default function MemberDetailPage() {
  const t = useTranslations("reviews.manage.detail");
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const params = useParams();
  const reviewId = params.memberId as string;
  const { currentWorkspace } = useWorkspace();

  const [activeTab, setActiveTab] = useState<"overview" | "goals" | "contributions" | "feedback">("overview");
  const [showAddGoalFromSuggestion, setShowAddGoalFromSuggestion] = useState<string | null>(null);
  const [showInviteReviewers, setShowInviteReviewers] = useState(false);

  const queryClient = useQueryClient();

  // Fetch review details
  const { data: review, isLoading: reviewLoading, error: reviewError } = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => reviewsApi.getReview(reviewId),
    enabled: !!reviewId && isAuthenticated,
  });

  // Pull cycle settings so the peer-reviewer picker can soft-enforce the
  // per-cycle min/max reviewer config instead of hardcoded 1/5 defaults.
  const { data: reviewCycle } = useQuery({
    queryKey: ["reviewCycle", review?.review_cycle_id],
    queryFn: () => reviewsApi.getCycle(review!.review_cycle_id),
    enabled: !!review?.review_cycle_id,
  });

  // Fetch goal suggestions
  const { data: suggestions = [] } = useQuery({
    queryKey: ["goalSuggestions", review?.developer_id],
    queryFn: () => reviewsApi.getGoalSuggestions(review!.developer_id),
    enabled: !!review?.developer_id,
  });

  // Transform data for display
  const member = review ? transformReviewToMemberData(review, suggestions) : null;

  if (authLoading || reviewLoading) {
    return (
      <div className="animate-pulse">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header skeleton */}
          <div className="bg-muted rounded-xl border border-border p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-accent rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-7 w-48 bg-accent rounded" />
                <div className="h-4 w-64 bg-accent rounded" />
                <div className="h-3 w-56 bg-accent rounded" />
              </div>
            </div>
          </div>
          {/* Stat-tile row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-xl border border-border" />
            ))}
          </div>
          {/* Tabs skeleton */}
          <div className="flex gap-2 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-28 bg-muted rounded-lg" />
            ))}
          </div>
          {/* Body skeleton */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-48 bg-muted rounded-xl border border-border" />
              <div className="h-32 bg-muted rounded-xl border border-border" />
            </div>
            <div className="space-y-4">
              <div className="h-32 bg-muted rounded-xl border border-border" />
              <div className="h-32 bg-muted rounded-xl border border-border" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (reviewError || !member) {
    return (
      <div>
<div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-16">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">{t("notFoundTitle")}</h2>
            <p className="text-muted-foreground mb-4">{t("notFoundBody")}</p>
            <Link href="/reviews" className="text-primary-400 hover:text-primary-300">
              {t("backToReviews")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeGoals = member.goals.filter(g => g.status !== "completed");
  const completedGoals = member.goals.filter(g => g.status === "completed");

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Reviews", href: "/reviews" },
            { label: "Team", href: "/reviews/manage" },
            { label: member.name },
          ]}
          className="mb-6"
        />

        {/* Member Header */}
        <div className="bg-muted rounded-xl border border-border p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                {getInitials(member.name)}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{member.name}</h1>
                {/* Previously rendered `${role} • ${team}` here, but
                    the backend doesn't ship those fields — the
                    transform was stubbing both to "Team Member" /
                    "Team" for every member. Render the actual email
                    instead so the header carries a real signal. */}
                {member.email && (
                  <p className="text-muted-foreground text-sm">{member.email}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span>{t("header.managerLabel")}: {member.manager}</span>
                  <span>•</span>
                  <span>{t("header.joinedPrefix")} {member.joinedDate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-muted-foreground text-sm mb-2">{t("header.skills")}</p>
            <div className="flex flex-wrap gap-2">
              {member.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1 bg-accent text-foreground text-sm rounded-lg"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <span className="text-muted-foreground text-sm">{t("stats.activeGoals")}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{activeGoals.length}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-muted-foreground text-sm">{t("stats.completed")}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{completedGoals.length}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <GitCommit className="w-4 h-4 text-purple-400" />
              <span className="text-muted-foreground text-sm">{t("stats.commits")}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{member.contributions.commits}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequest className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground text-sm">{t("stats.prs")}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{member.contributions.prs}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span className="text-muted-foreground text-sm">{t("stats.reviews")}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{member.contributions.reviews}</p>
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label={`Sections for ${member.name}`}
          className="flex gap-2 mb-6 bg-muted p-1 rounded-lg w-fit"
        >
          {[
            { key: "overview", label: t("tabs.overview"), icon: BarChart3 },
            { key: "goals", label: t("tabs.goals"), icon: Target },
            { key: "contributions", label: t("tabs.contributions"), icon: GitPullRequest },
            { key: "feedback", label: t("tabs.feedback"), icon: MessageSquare },
          ].map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              data-testid={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Goals Summary */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-muted rounded-xl border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Target className="h-5 w-5 text-cyan-400" />
                    Active Goals
                  </h3>
                  <Link
                    href={`/reviews/goals/new?member=${member.id}`}
                    className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition"
                  >
                    <Plus className="h-4 w-4" />
                    Assign Goal
                  </Link>
                </div>
                <div className="p-4 space-y-3">
                  {activeGoals.map((goal) => (
                    <div key={goal.id} className="bg-background rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-foreground font-medium">{goal.title}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(GOAL_TYPE_COLORS, goal.type).bg} ${getStatusColor(GOAL_TYPE_COLORS, goal.type).text}`}>
                              {goal.type.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-sm">{t("goals.dueLabel")} {formatDate(goal.dueDate)}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${(extraGoalStatusColors[goal.status] || getStatusColor(GOAL_STATUS_COLORS, goal.status)).bg} ${(extraGoalStatusColors[goal.status] || getStatusColor(GOAL_STATUS_COLORS, goal.status)).text}`}>
                          {goal.progress}%
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`${goal.title} progress`}
                        aria-valuenow={goal.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-2 bg-accent rounded-full overflow-hidden"
                      >
                        <div
                          className={`h-full rounded-full transition-all ${
                            goal.progress >= 75 ? "bg-emerald-500" :
                            goal.progress >= 50 ? "bg-blue-500" :
                            goal.progress >= 25 ? "bg-amber-500" :
                            "bg-red-500"
                          }`}
                          style={{ width: `${goal.progress}%` }}
                        />
                      </div>
                      {goal.keyResults.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {goal.keyResults.map((kr, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{kr.description}</span>
                              <span className="text-foreground">
                                {kr.current}/{kr.target} {kr.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {activeGoals.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No active goals
                    </div>
                  )}
                </div>
              </div>

              {/* GitHub Suggestions */}
              {member.suggestions.length > 0 && (
                <div className="bg-muted rounded-xl border border-border overflow-hidden">
                  <div className="px-6 py-4 border-b border-border">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-amber-400" />
                      Goal Suggestions from GitHub
                    </h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {member.suggestions.map((suggestion) => (
                      <div key={suggestion.id} className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="text-foreground font-medium">{suggestion.title}</h4>
                            <p className="text-muted-foreground text-sm mt-1">{suggestion.description}</p>
                          </div>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                            {suggestion.confidence}% match
                          </span>
                        </div>
                        <div className="bg-background rounded-lg p-3 mb-3">
                          <p className="text-muted-foreground text-xs mb-1">{t("goals.suggestedGoal")}</p>
                          <p className="text-foreground text-sm">{suggestion.suggestedGoal}</p>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex flex-wrap gap-1">
                            {suggestion.keywords.map((kw) => (
                              <span key={kw} className="px-2 py-0.5 bg-accent text-muted-foreground text-xs rounded">
                                {kw}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/reviews/goals/new?member=${member.id}&title=${encodeURIComponent(suggestion.suggestedGoal)}&keywords=${encodeURIComponent(suggestion.keywords.join(","))}`}
                              className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm transition"
                            >
                              <Plus className="h-4 w-4" />
                              Create Goal
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* AI review summary — auto-generated when this cycle was
                  activated; falls back to a "Generate now" button if not. */}
              <ReviewDigestCard
                developerId={review?.developer_id ?? null}
                workspaceId={currentWorkspace?.id ?? null}
                defaultPeriod="monthly"
              />

              {/* Feedback Summary */}
              <div className="bg-muted rounded-xl border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-purple-400" />
                    Feedback Summary
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    Based on {member.feedbackSummary.peerCount} peer reviews
                  </p>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-emerald-400 text-sm font-medium mb-2 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Strengths
                    </p>
                    <ul className="space-y-2">
                      {member.feedbackSummary.strengths.map((strength, idx) => (
                        <li key={idx} className="text-foreground text-sm pl-4 border-l-2 border-emerald-500/30">
                          {strength}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-amber-400 text-sm font-medium mb-2 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Growth Areas
                    </p>
                    <ul className="space-y-2">
                      {member.feedbackSummary.growthAreas.map((area, idx) => (
                        <li key={idx} className="text-foreground text-sm pl-4 border-l-2 border-amber-500/30">
                          {area}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Contribution Stats */}
              <div className="bg-muted rounded-xl border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Code className="h-5 w-5 text-blue-400" />
                    Code Impact
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">{t("contributions.linesAdded")}</span>
                    <span className="text-emerald-400 font-medium">+{member.contributions.linesAdded.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">{t("contributions.linesRemoved")}</span>
                    <span className="text-red-400 font-medium">-{member.contributions.linesRemoved.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-muted-foreground text-sm">{t("contributions.netChange")}</span>
                    <span className={`font-medium ${
                      member.contributions.linesAdded - member.contributions.linesRemoved >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}>
                      {member.contributions.linesAdded - member.contributions.linesRemoved >= 0 ? "+" : ""}
                      {(member.contributions.linesAdded - member.contributions.linesRemoved).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-muted rounded-xl border border-border p-4">
                <h3 className="text-foreground font-medium mb-3">{t("quickActions")}</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setShowInviteReviewers(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition"
                  >
                    <UserCheck className="h-4 w-4" />
                    {t("invitePeerReviewersCta")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "goals" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-foreground">{t("goals.allGoals")}</h2>
              <Link
                href={`/reviews/goals/new?member=${member.id}`}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Assign New Goal
              </Link>
            </div>

            <div className="space-y-4">
              {member.goals.map((goal) => (
                <div key={goal.id} className="bg-muted rounded-xl border border-border p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-foreground font-semibold">{goal.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(GOAL_TYPE_COLORS, goal.type).bg} ${getStatusColor(GOAL_TYPE_COLORS, goal.type).text}`}>
                          {goal.type.replace("_", " ")}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${(extraGoalStatusColors[goal.status] || getStatusColor(GOAL_STATUS_COLORS, goal.status)).bg} ${(extraGoalStatusColors[goal.status] || getStatusColor(GOAL_STATUS_COLORS, goal.status)).text}`}>
                          {goal.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm">{t("goals.dueLabel")} {formatDate(goal.dueDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-foreground">{goal.progress}%</p>
                      <p className="text-muted-foreground text-sm">{t("goals.progressLabel")}</p>
                    </div>
                  </div>

                  <div className="h-2 bg-accent rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full rounded-full transition-all ${
                        goal.status === "completed" ? "bg-emerald-500" :
                        goal.progress >= 75 ? "bg-emerald-500" :
                        goal.progress >= 50 ? "bg-blue-500" :
                        goal.progress >= 25 ? "bg-amber-500" :
                        "bg-red-500"
                      }`}
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>

                  {goal.keyResults.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-muted-foreground text-sm font-medium">{t("goals.keyResults")}</p>
                      {goal.keyResults.map((kr, idx) => (
                        <div key={idx} className="bg-background rounded-lg p-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                            <span className="text-foreground text-sm">{kr.description}</span>
                            <span className="text-muted-foreground text-sm">
                              {kr.current}/{kr.target} {kr.unit}
                            </span>
                          </div>
                          <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full"
                              style={{ width: `${Math.min((kr.current / kr.target) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "contributions" && (
          <div className="space-y-6">
            {/* Contribution Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <GitCommit className="w-4 h-4 text-cyan-400" />
                  <span className="text-muted-foreground text-sm">{t("contributions.commits")}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{member.contributions.commits}</p>
              </div>
              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <GitPullRequest className="w-4 h-4 text-purple-400" />
                  <span className="text-muted-foreground text-sm">{t("contributions.pullRequests")}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{member.contributions.prs}</p>
              </div>
              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  <span className="text-muted-foreground text-sm">{t("contributions.codeReviews")}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{member.contributions.reviews}</p>
              </div>
              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Code className="w-4 h-4 text-emerald-400" />
                  <span className="text-muted-foreground text-sm">{t("contributions.linesChanged")}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  <span className="text-emerald-400">+{member.contributions.linesAdded.toLocaleString()}</span>
                  {" "}
                  <span className="text-red-400">-{member.contributions.linesRemoved.toLocaleString()}</span>
                </p>
              </div>
            </div>

            {/* Skills */}
            {member.skills.length > 0 && (
              <div className="bg-muted rounded-xl border border-border p-5">
                <h3 className="text-foreground font-medium mb-3">{t("contributions.skillsDemonstrated")}</h3>
                <div className="flex flex-wrap gap-2">
                  {member.skills.map((skill) => (
                    <span key={skill} className="px-3 py-1 bg-accent text-foreground text-sm rounded-lg">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {review?.ai_summary && (
              <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  <h3 className="text-purple-400 font-medium">AI Summary</h3>
                </div>
                <p className="text-foreground text-sm">{review.ai_summary}</p>
              </div>
            )}

            {member.contributions.commits === 0 && member.contributions.prs === 0 && (
              <div className="bg-muted rounded-xl border border-border p-8 text-center">
                <GitPullRequest className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  No GitHub contributions found for this review period. Connect GitHub to import activity.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "feedback" && (
          <div className="space-y-6">
            {/* Self Review */}
            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">{t("feedback.selfReview")}</h3>
              </div>
              {review?.self_review?.responses ? (
                <div className="p-6 space-y-4">
                  {review.self_review.responses.context && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("feedback.context")}</p>
                      <p className="text-foreground text-sm">{review.self_review.responses.context}</p>
                    </div>
                  )}
                  {review.self_review.responses.observation && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t("feedback.keyAccomplishments")}</p>
                      <p className="text-foreground text-sm">{review.self_review.responses.observation}</p>
                    </div>
                  )}
                  {review.self_review.responses.strengths && review.self_review.responses.strengths.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{t("feedback.strengths")}</p>
                      <div className="flex flex-wrap gap-2">
                        {(Array.isArray(review.self_review.responses.strengths) ? review.self_review.responses.strengths : []).map((s: string, i: number) => (
                          <span key={i} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-sm rounded-lg">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {review.self_review.responses.growth_areas && review.self_review.responses.growth_areas.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{t("feedback.growthAreas")}</p>
                      <div className="flex flex-wrap gap-2">
                        {(Array.isArray(review.self_review.responses.growth_areas) ? review.self_review.responses.growth_areas : []).map((g: string, i: number) => (
                          <span key={i} className="px-3 py-1 bg-amber-500/10 text-amber-400 text-sm rounded-lg">{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center py-8">
                  <ClipboardCheck className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">{t("feedback.selfNotSubmitted")}</p>
                </div>
              )}
            </div>

            {/* Peer Reviews */}
            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">{t("feedback.peerReviews")}</h3>
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                  {review?.peer_reviews?.length || 0} received
                </span>
              </div>
              {review?.peer_reviews && review.peer_reviews.length > 0 ? (
                <div className="p-6 space-y-4">
                  {review.peer_reviews.map((pr, idx) => (
                    <div key={idx} className="bg-background rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400 text-xs font-medium">
                          {pr.is_anonymous ? "A" : (pr.reviewer_name || "P")[0]}
                        </div>
                        <span className="text-muted-foreground text-sm">
                          {pr.is_anonymous ? "Anonymous peer" : pr.reviewer_name || "Peer reviewer"}
                        </span>
                      </div>
                      {pr.responses?.observation && (
                        <p className="text-foreground text-sm">&ldquo;{pr.responses.observation}&rdquo;</p>
                      )}
                      {pr.responses?.impact && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t("feedback.impact")}</p>
                          <p className="text-foreground text-sm">{pr.responses.impact}</p>
                        </div>
                      )}
                      {pr.responses?.next_steps && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t("feedback.suggestedNextSteps")}</p>
                          <p className="text-foreground text-sm">{pr.responses.next_steps}</p>
                        </div>
                      )}
                      {pr.responses?.strengths && pr.responses.strengths.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {pr.responses.strengths.map((s: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center py-8">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">{t("feedback.noPeerReviews")}</p>
                </div>
              )}
            </div>

            {/* Growth Areas Summary */}
            {member.feedbackSummary.growthAreas.length > 0 && (
              <div className="bg-muted rounded-xl border border-border p-5">
                <h3 className="text-foreground font-medium mb-3">{t("feedback.growthAreas")}</h3>
                <div className="flex flex-wrap gap-2">
                  {member.feedbackSummary.growthAreas.map((area, idx) => (
                    <span key={idx} className="px-3 py-1 bg-amber-500/10 text-amber-400 text-sm rounded-lg">{area}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Manager review composer — only renders during the
                manager_review phase and only if the manager hasn't
                already submitted. After submit/finalize the review
                drops into the read-only Self/Peer/Manager summary
                cards above. */}
            {review && (
              <ManagerReviewComposer
                review={review}
                cycleStatus={reviewCycle?.status ?? null}
                onSubmitted={() =>
                  queryClient.invalidateQueries({ queryKey: ["review", reviewId] })
                }
              />
            )}
          </div>
        )}

        {review && user?.id && (
          <InvitePeerReviewersModal
            open={showInviteReviewers}
            onClose={() => setShowInviteReviewers(false)}
            reviewId={review.id}
            callerDeveloperId={user.id}
            workspaceId={currentWorkspace?.id ?? null}
            revieweeDeveloperId={review.developer_id}
            minReviewers={reviewCycle?.settings?.min_peer_reviewers}
            maxReviewers={reviewCycle?.settings?.max_peer_reviewers}
            mode="manager_assign"
            onAssigned={() => {
              // Refresh the review so the peer-review counter updates
              // immediately. The modal's own existing-invites list
              // re-fetches the next time it's opened.
              queryClient.invalidateQueries({ queryKey: ["review", reviewId] });
            }}
          />
        )}
      </div>
    </div>
  );
}


// ----------------------------------------------------------------------------
// Manager-review composer (UX-RV-MGR-008)
// ----------------------------------------------------------------------------

/**
 * Strengths / growth-areas bullet editor. Same shape as the
 * `BulletEditor` in `my-reviews/[reviewId]/page.tsx`; kept local to
 * this file to avoid a shared-component extraction (the two have
 * slightly different aria-labels + ring colors).
 */
function ManagerBulletEditor({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const handleChange = (idx: number, value: string) => {
    const next = [...values];
    next[idx] = value;
    if (idx === next.length - 1 && value.trim().length > 0) {
      next.push("");
    }
    onChange(next);
  };
  const handleRemove = (idx: number) => {
    const next = values.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : [""]);
  };
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">
        {label}
      </label>
      <div className="space-y-2">
        {values.map((value, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-muted-foreground pt-2">•</span>
            <textarea
              value={value}
              onChange={(e) => handleChange(i, e.target.value)}
              rows={1}
              placeholder={i === 0 ? placeholder : ""}
              className="flex-1 bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 resize-none"
            />
            {values.length > 1 && (
              <button
                onClick={() => handleRemove(i)}
                aria-label={`Remove ${label.toLowerCase()} bullet ${i + 1}`}
                className="text-xs text-muted-foreground hover:text-destructive pt-2"
                type="button"
              >
                remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


type RatingTier = 1 | 2 | 3 | 4 | 5;

const RATING_AXES = ["execution", "collaboration", "communication", "growth"] as const;
type RatingAxis = typeof RATING_AXES[number];

const EMPTY_AXIS_RATINGS: Record<RatingAxis, number | null> = {
  execution: null,
  collaboration: null,
  communication: null,
  growth: null,
};

/**
 * 5-button rating pill — labeled with the human tier description on
 * hover so the meaning of each rating isn't lost behind a bare
 * number.
 */
function RatingPicker({
  value,
  onChange,
  tierLabels,
  ariaLabel,
}: {
  value: number | null;
  onChange: (next: RatingTier) => void;
  tierLabels: string[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            title={tierLabels[n - 1]}
            onClick={() => onChange(n as RatingTier)}
            className={`w-9 h-9 rounded-md text-sm font-medium transition border ${
              selected
                ? "bg-primary-600 text-white border-primary-500"
                : "bg-accent text-foreground border-border hover:bg-muted"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}


function ManagerReviewComposer({
  review,
  cycleStatus,
  onSubmitted,
}: {
  review: IndividualReviewDetail;
  cycleStatus: string | null;
  onSubmitted: () => void;
}) {
  const t = useTranslations("reviews.manage.composer");

  // Lock the composer until the cycle reaches the manager_review
  // phase. Earlier phases mean self / peer aren't done yet — the
  // manager would be synthesizing incomplete data.
  const allowed = cycleStatus === "manager_review";
  const alreadySubmitted = !!review.manager_review;

  // Hooks run unconditionally (rules-of-hooks); the "should we
  // render" gate lives after them.
  const [strengths, setStrengths] = useState<string[]>([""]);
  const [growth, setGrowth] = useState<string[]>([""]);
  const [note, setNote] = useState("");
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [axisRatings, setAxisRatings] =
    useState<Record<RatingAxis, number | null>>(EMPTY_AXIS_RATINGS);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);

  // Draft persistence — mirrors `UX-RV-SELF-004`. Key the hydration
  // guard by draftKey so navigating between members re-runs the
  // hydration for the new id instead of carrying state across.
  const draftKey = review.id ? `managerReviewDraft:${review.id}` : null;
  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!draftKey || hydratedKeyRef.current === draftKey) return;
    hydratedKeyRef.current = draftKey;
    const resetForm = () => {
      setStrengths([""]);
      setGrowth([""]);
      setNote("");
      setOverallRating(null);
      setAxisRatings(EMPTY_AXIS_RATINGS);
    };
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) {
        resetForm();
        return;
      }
      const parsed = JSON.parse(raw) as Partial<{
        strengths: string[];
        growth: string[];
        note: string;
        overallRating: number | null;
        axisRatings: Record<RatingAxis, number | null>;
      }>;
      setStrengths(
        Array.isArray(parsed.strengths) && parsed.strengths.length > 0
          ? parsed.strengths
          : [""],
      );
      setGrowth(
        Array.isArray(parsed.growth) && parsed.growth.length > 0
          ? parsed.growth
          : [""],
      );
      setNote(typeof parsed.note === "string" ? parsed.note : "");
      setOverallRating(
        typeof parsed.overallRating === "number" ? parsed.overallRating : null,
      );
      if (parsed.axisRatings && typeof parsed.axisRatings === "object") {
        setAxisRatings({ ...EMPTY_AXIS_RATINGS, ...parsed.axisRatings });
      } else {
        setAxisRatings(EMPTY_AXIS_RATINGS);
      }
    } catch {
      // Corrupt JSON — start clean.
      resetForm();
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    const hasContent =
      strengths.some((s) => s.trim()) ||
      growth.some((s) => s.trim()) ||
      note.trim() ||
      overallRating !== null ||
      Object.values(axisRatings).some((v) => v !== null);
    if (hasContent) {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ strengths, growth, note, overallRating, axisRatings }),
      );
    } else {
      sessionStorage.removeItem(draftKey);
    }
  }, [draftKey, strengths, growth, note, overallRating, axisRatings]);

  // Early-return AFTER hooks so the rules-of-hooks contract holds.
  if (alreadySubmitted) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
        <h3 className="text-foreground font-medium mb-1">{t("readOnly.heading")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("readOnly.submittedNote")}
        </p>
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="bg-muted/40 border border-border rounded-xl p-5">
        <h3 className="text-foreground font-medium mb-1">{t("locked.heading")}</h3>
        <p className="text-muted-foreground text-sm">{t("locked.note")}</p>
      </div>
    );
  }

  const buildPayload = () => {
    const cleanStrengths = strengths.map((s) => s.trim()).filter(Boolean);
    const cleanGrowth = growth.map((s) => s.trim()).filter(Boolean);
    const questionResponses: Record<string, { comment: string }> = note.trim()
      ? { general: { comment: note.trim() } }
      : {};
    return {
      responses: {
        achievements: [],
        areas_for_growth: [],
        question_responses: questionResponses,
        strengths: cleanStrengths,
        growth_areas: cleanGrowth,
      },
      // Null is valid for the Save Draft path — the backend's
      // ManagerReviewSubmission schema accepts a missing rating and
      // preserves any previously-saved value. The required ge=1
      // check kicks in only at finalize.
      overall_rating: overallRating,
      ratings_breakdown: Object.fromEntries(
        Object.entries(axisRatings).filter(([, v]) => v !== null) as Array<
          [string, number]
        >,
      ),
    };
  };

  const validateContent = (): string | null => {
    const cleanStrengths = strengths.map((s) => s.trim()).filter(Boolean);
    const cleanGrowth = growth.map((s) => s.trim()).filter(Boolean);
    if (cleanStrengths.length === 0 && cleanGrowth.length === 0 && !note.trim()) {
      return t("validation.empty");
    }
    return null;
  };

  const handleSaveDraft = async () => {
    const err = validateContent();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      await reviewsApi.submitManagerReview(review.id, buildPayload());
      toast.success(t("toasts.draftSaved"));
    } catch (e: unknown) {
      const detail = (
        e as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail;
      toast.error(detail ?? t("toasts.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    const err = validateContent();
    if (err) {
      toast.error(err);
      throw new Error(err);
    }
    if (overallRating === null) {
      toast.error(t("validation.ratingRequired"));
      throw new Error("rating required");
    }
    setFinalizing(true);
    try {
      // Two-step: persist the response body, then promote the
      // IndividualReview row to status=completed.
      await reviewsApi.submitManagerReview(review.id, buildPayload());
      await reviewsApi.finalizeReview(review.id, {
        overall_rating: overallRating,
        ratings_breakdown: Object.fromEntries(
          Object.entries(axisRatings).filter(([, v]) => v !== null) as Array<
            [string, number]
          >,
        ),
      });
      toast.success(t("toasts.finalized"));
      if (draftKey) sessionStorage.removeItem(draftKey);
      onSubmitted();
    } catch (e: unknown) {
      const detail = (
        e as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail;
      toast.error(detail ?? t("toasts.finalizeFailed"));
      throw e;
    } finally {
      setFinalizing(false);
    }
  };

  const tierLabels = [
    t("rating.tier1"),
    t("rating.tier2"),
    t("rating.tier3"),
    t("rating.tier4"),
    t("rating.tier5"),
  ];

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-5 space-y-5">
        <div>
          <h3 className="text-foreground font-medium">{t("heading")}</h3>
          <p className="text-muted-foreground text-xs mt-0.5">
            {t("subheading")}
          </p>
        </div>

        <ManagerBulletEditor
          label={t("strengthsLabel")}
          placeholder={t("strengthsPlaceholder")}
          values={strengths}
          onChange={setStrengths}
        />
        <ManagerBulletEditor
          label={t("growthLabel")}
          placeholder={t("growthPlaceholder")}
          values={growth}
          onChange={setGrowth}
        />

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            {t("narrativeLabel")}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t("narrativePlaceholder")}
            className="w-full bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>

        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <label className="text-sm font-medium text-foreground">
              {t("rating.overallLabel")}
            </label>
            <RatingPicker
              value={overallRating}
              onChange={setOverallRating}
              tierLabels={tierLabels}
              ariaLabel={t("rating.overallAriaLabel")}
            />
          </div>
          {RATING_AXES.map((axis) => (
            <div
              key={axis}
              className="flex items-center justify-between gap-4 flex-wrap"
            >
              <label className="text-sm text-muted-foreground">
                {t(`rating.axis.${axis}`)}
              </label>
              <RatingPicker
                value={axisRatings[axis]}
                onChange={(n) => setAxisRatings((prev) => ({ ...prev, [axis]: n }))}
                tierLabels={tierLabels}
                ariaLabel={t(`rating.axis.${axis}`)}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || finalizing}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent text-foreground transition flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("saveDraft")}
          </button>
          <button
            type="button"
            onClick={() => setShowFinalizeConfirm(true)}
            disabled={saving || finalizing}
            className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition flex items-center gap-2 disabled:opacity-50"
          >
            {finalizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("submitFinalize")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showFinalizeConfirm}
        onOpenChange={setShowFinalizeConfirm}
        title={t("confirmFinalize.title")}
        description={t("confirmFinalize.description")}
        confirmLabel={t("submitFinalize")}
        tone="warning"
        onConfirm={handleFinalize}
      />
    </>
  );
}
