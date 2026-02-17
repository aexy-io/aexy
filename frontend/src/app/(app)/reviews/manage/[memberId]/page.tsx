"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect, useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Target,
  Users,
  Calendar,
  Plus,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  GitPullRequest,
  GitCommit,
  MessageSquare,
  TrendingUp,
  ArrowLeft,
  Eye,
  X,
  Sparkles,
  ExternalLink,
  ChevronDown,
  MoreHorizontal,
  UserCheck,
  FileText,
  Zap,
  Lightbulb,
  Code,
  Award,
  BarChart3,
  Edit3,
  Send,
  Loader2,
} from "lucide-react";
import { reviewsApi, IndividualReviewDetail, WorkGoal, GoalSuggestion } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";

const goalTypeColors: Record<string, { bg: string; text: string }> = {
  performance: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
  skill_development: { bg: "bg-purple-500/20", text: "text-purple-400" },
  project: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  leadership: { bg: "bg-amber-500/20", text: "text-amber-400" },
  team_contribution: { bg: "bg-blue-500/20", text: "text-blue-400" },
};

const goalStatusColors: Record<string, { bg: string; text: string }> = {
  in_progress: { bg: "bg-blue-500/20", text: "text-blue-400" },
  completed: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  at_risk: { bg: "bg-red-500/20", text: "text-red-400" },
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
    joinedDate: new Date(review.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
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
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const params = useParams();
  const reviewId = params.memberId as string;
  const { currentWorkspace } = useWorkspace();

  const [activeTab, setActiveTab] = useState<"overview" | "goals" | "contributions" | "feedback">("overview");
  const [showAddGoalFromSuggestion, setShowAddGoalFromSuggestion] = useState<string | null>(null);

  // Fetch review details
  const { data: review, isLoading: reviewLoading, error: reviewError } = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => reviewsApi.getReview(reviewId),
    enabled: !!reviewId && isAuthenticated,
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (reviewError || !member) {
    return (
      <div className="min-h-screen bg-background">
<div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-16">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Review not found</h2>
            <p className="text-muted-foreground mb-4">The review you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.</p>
            <Link href="/reviews" className="text-primary-400 hover:text-primary-300">
              Back to Reviews
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeGoals = member.goals.filter(g => g.status !== "completed");
  const completedGoals = member.goals.filter(g => g.status === "completed");

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-muted-foreground hover:text-foreground transition">
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Link href="/reviews/manage" className="text-muted-foreground hover:text-foreground transition">
            Management
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-foreground">{member.name}</span>
        </div>

        {/* Member Header */}
        <div className="bg-muted rounded-xl border border-border p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                {member.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{member.name}</h1>
                <p className="text-muted-foreground">{member.role} • {member.team}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span>Manager: {member.manager}</span>
                  <span>•</span>
                  <span>Joined {member.joinedDate}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg transition text-sm">
                <Send className="h-4 w-4" />
                Send Feedback
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium">
                <Edit3 className="h-4 w-4" />
                Write Review
              </button>
            </div>
          </div>

          {/* Skills */}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-muted-foreground text-sm mb-2">Skills</p>
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
              <span className="text-muted-foreground text-sm">Active Goals</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{activeGoals.length}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-muted-foreground text-sm">Completed</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{completedGoals.length}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <GitCommit className="w-4 h-4 text-purple-400" />
              <span className="text-muted-foreground text-sm">Commits</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{member.contributions.commits}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequest className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground text-sm">PRs</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{member.contributions.prs}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span className="text-muted-foreground text-sm">Reviews</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{member.contributions.reviews}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-muted p-1 rounded-lg w-fit">
          {[
            { key: "overview", label: "Overview", icon: BarChart3 },
            { key: "goals", label: "Goals", icon: Target },
            { key: "contributions", label: "Contributions", icon: GitPullRequest },
            { key: "feedback", label: "Feedback", icon: MessageSquare },
          ].map((tab) => (
            <button
              key={tab.key}
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
                            <span className={`px-2 py-0.5 rounded-full text-xs ${goalTypeColors[goal.type]?.bg} ${goalTypeColors[goal.type]?.text}`}>
                              {goal.type.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-sm">Due: {new Date(goal.dueDate).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${goalStatusColors[goal.status]?.bg} ${goalStatusColors[goal.status]?.text}`}>
                          {goal.progress}%
                        </span>
                      </div>
                      <div className="h-2 bg-accent rounded-full overflow-hidden">
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
                          <p className="text-muted-foreground text-xs mb-1">Suggested Goal:</p>
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
                            <button className="text-muted-foreground hover:text-red-400 text-sm transition">
                              Discard
                            </button>
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
                    <span className="text-muted-foreground text-sm">Lines Added</span>
                    <span className="text-emerald-400 font-medium">+{member.contributions.linesAdded.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">Lines Removed</span>
                    <span className="text-red-400 font-medium">-{member.contributions.linesRemoved.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-muted-foreground text-sm">Net Change</span>
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
                <h3 className="text-foreground font-medium mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button className="w-full flex items-center gap-2 px-3 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition">
                    <UserCheck className="h-4 w-4" />
                    Request Peer Review
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition">
                    <Calendar className="h-4 w-4" />
                    Schedule 1:1
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition">
                    <FileText className="h-4 w-4" />
                    Export Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "goals" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-foreground">All Goals</h2>
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
                        <span className={`px-2 py-0.5 rounded-full text-xs ${goalTypeColors[goal.type]?.bg} ${goalTypeColors[goal.type]?.text}`}>
                          {goal.type.replace("_", " ")}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${goalStatusColors[goal.status]?.bg} ${goalStatusColors[goal.status]?.text}`}>
                          {goal.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm">Due: {new Date(goal.dueDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-foreground">{goal.progress}%</p>
                      <p className="text-muted-foreground text-sm">Progress</p>
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
                      <p className="text-muted-foreground text-sm font-medium">Key Results</p>
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
          <div className="bg-muted rounded-xl border border-border p-6">
            <div className="text-center py-12">
              <GitPullRequest className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium text-foreground mb-2">Contribution History</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Detailed contribution history will be loaded from GitHub
              </p>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium mx-auto">
                <Sparkles className="h-4 w-4" />
                Generate Contribution Summary
              </button>
            </div>
          </div>
        )}

        {activeTab === "feedback" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">Self Review</h3>
              </div>
              <div className="p-6 text-center py-12">
                <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Self review submitted</p>
                <button className="mt-4 text-primary-400 hover:text-primary-300 text-sm transition">
                  View submission
                </button>
              </div>
            </div>

            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-foreground">Peer Reviews</h3>
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                  {member.feedbackSummary.peerCount} received
                </span>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {member.feedbackSummary.strengths.slice(0, 2).map((item, idx) => (
                    <div key={idx} className="bg-background rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center text-muted-foreground text-xs">
                          A
                        </div>
                        <span className="text-muted-foreground text-sm">Anonymous peer</span>
                      </div>
                      <p className="text-foreground text-sm">&ldquo;{item}&rdquo;</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
