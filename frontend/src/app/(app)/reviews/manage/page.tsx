"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
  Search,
  Filter,
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
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useManagerReviews, useReviewCycles } from "@/hooks/useReviews";
import { IndividualReview, WorkspaceMember } from "@/lib/api";

// Types for suggestions (to be replaced with real API data when available)
interface GitHubSuggestion {
  id: string;
  memberId: string;
  memberName: string;
  type: string;
  source: string;
  title: string;
  description: string;
  suggestedGoal: string;
  keywords: string[];
  commits: number;
  prs: number;
  confidence: number;
  discarded: boolean;
}

// Types for actionables
interface Actionable {
  id: string;
  type: string;
  title: string;
  description: string;
  member?: string;
  memberId?: string;
  dueDate?: string;
  count?: number;
  priority: string;
}

const reviewStatusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: "Pending", color: "text-muted-foreground", bgColor: "bg-muted-foreground/20" },
  self_review_submitted: { label: "Self Review Done", color: "text-blue-400", bgColor: "bg-blue-500/20" },
  peer_review_in_progress: { label: "Peer Review", color: "text-purple-400", bgColor: "bg-purple-500/20" },
  manager_review_in_progress: { label: "Manager Review", color: "text-amber-400", bgColor: "bg-amber-500/20" },
  completed: { label: "Completed", color: "text-emerald-400", bgColor: "bg-emerald-500/20" },
  acknowledged: { label: "Acknowledged", color: "text-cyan-400", bgColor: "bg-cyan-500/20" },
};

export default function ReviewsManagePage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading, hasWorkspaces } = useWorkspace();

  // Fetch real data
  const { members, isLoading: membersLoading } = useWorkspaceMembers(currentWorkspaceId);
  const managerId = user?.id;
  const { reviews, isLoading: reviewsLoading } = useManagerReviews(managerId);
  const { cycles, isLoading: cyclesLoading } = useReviewCycles(currentWorkspaceId);

  const [activeTab, setActiveTab] = useState<"overview" | "actionables" | "suggestions">("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [suggestions, setSuggestions] = useState<GitHubSuggestion[]>([]);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  // Build team member data from workspace members and reviews
  const teamMembers = useMemo(() => {
    return members.map(member => {
      const memberReview = reviews.find(r => r.developer_id === member.developer_id);
      return {
        id: member.developer_id || member.id,
        name: member.developer_name || member.developer_email?.split("@")[0] || "Unknown",
        avatar: member.developer_avatar_url,
        role: member.role || "Team Member",
        reviewStatus: memberReview?.status || "pending",
        goalsCount: 0, // Would need separate API call
        completedGoals: 0,
        pendingFeedback: 0,
        lastActivity: member.joined_at
          ? new Date(member.joined_at).toLocaleDateString()
          : "Unknown",
      };
    });
  }, [members, reviews]);

  // Build actionables from reviews data
  const actionables = useMemo(() => {
    const items: Actionable[] = [];

    // Find reviews that need manager attention
    reviews.forEach(review => {
      const member = members.find(m => m.developer_id === review.developer_id);
      const memberName = member?.developer_name || "Team member";

      if (review.status === "peer_review_in_progress" || review.status === "manager_review_in_progress") {
        items.push({
          id: `review-${review.id}`,
          type: "manager_review_needed",
          title: "Manager review needed",
          description: `${memberName} is ready for manager review`,
          member: memberName,
          memberId: review.developer_id,
          priority: "medium",
        });
      }

      if (review.status === "pending") {
        items.push({
          id: `pending-${review.id}`,
          type: "overdue_review",
          title: "Self-review pending",
          description: `${memberName} hasn't submitted self-review yet`,
          member: memberName,
          memberId: review.developer_id,
          priority: "high",
        });
      }
    });

    return items;
  }, [reviews, members]);

  const handleDiscardSuggestion = (id: string) => {
    setSuggestions(suggestions.map(s =>
      s.id === id ? { ...s, discarded: true } : s
    ));
  };

  const handleRestoreSuggestion = (id: string) => {
    setSuggestions(suggestions.map(s =>
      s.id === id ? { ...s, discarded: false } : s
    ));
  };

  const activeSuggestions = suggestions.filter(s => !s.discarded);
  const discardedSuggestions = suggestions.filter(s => s.discarded);

  const isLoading = authLoading || currentWorkspaceLoading || membersLoading || reviewsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading management data...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const filteredMembers = teamMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         member.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || member.reviewStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-muted-foreground hover:text-foreground transition flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-foreground">Management</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Review Management</h1>
            <p className="text-muted-foreground mt-1">
              Monitor team reviews, track deliverables, and manage goals
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/reviews/cycles"
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg transition text-sm"
            >
              <Calendar className="h-4 w-4" />
              Review Cycles
            </Link>
            <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition text-sm font-medium">
              <FileText className="h-4 w-4" />
              Export Report
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-muted-foreground text-sm">Team Members</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{teamMembers.length}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-muted-foreground text-sm">Completed</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {teamMembers.filter(m => m.reviewStatus === "completed").length}
            </p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-muted-foreground text-sm">In Progress</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {teamMembers.filter(m => ["self_review_submitted", "peer_review_in_progress", "manager_review_in_progress"].includes(m.reviewStatus)).length}
            </p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <span className="text-muted-foreground text-sm">Action Needed</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{actionables.length}</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Lightbulb className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-muted-foreground text-sm">Suggestions</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{activeSuggestions.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-muted p-1 rounded-lg w-fit">
          {[
            { key: "overview", label: "Team Overview", icon: Users },
            { key: "actionables", label: "Actionables", icon: AlertCircle, count: actionables.length },
            { key: "suggestions", label: "GitHub Suggestions", icon: Lightbulb, count: activeSuggestions.length },
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
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key ? "bg-muted" : "bg-accent"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search team members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg pl-10 pr-4 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-muted border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary-500 text-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="self_review_submitted">Self Review Done</option>
                <option value="peer_review_in_progress">Peer Review</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {/* Team Members Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {filteredMembers.map((member) => {
                const status = reviewStatusConfig[member.reviewStatus];
                return (
                  <div
                    key={member.id}
                    className="bg-muted rounded-xl border border-border p-5 hover:border-border transition"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                          {member.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <h3 className="text-foreground font-medium">{member.name}</h3>
                          <p className="text-muted-foreground text-sm">{member.role}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div className="text-center">
                        <p className="text-foreground font-semibold">{member.goalsCount}</p>
                        <p className="text-muted-foreground text-xs">Goals</p>
                      </div>
                      <div className="text-center">
                        <p className="text-emerald-400 font-semibold">{member.completedGoals}</p>
                        <p className="text-muted-foreground text-xs">Completed</p>
                      </div>
                      <div className="text-center">
                        <p className={`font-semibold ${member.pendingFeedback > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                          {member.pendingFeedback}
                        </p>
                        <p className="text-muted-foreground text-xs">Pending</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border">
                      <span className="text-muted-foreground text-xs">Active {member.lastActivity}</span>
                      <div className="flex items-center gap-2">
                        <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition">
                          <Eye className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/reviews/manage/${member.id}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition"
                        >
                          View Details
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "actionables" && (
          <div className="space-y-4">
            {actionables.length > 0 ? (
              <>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                    <div>
                      <h3 className="text-amber-400 font-medium">Action Required</h3>
                      <p className="text-amber-400/70 text-sm">
                        {actionables.length} items need your attention to keep the review cycle on track
                      </p>
                    </div>
                  </div>
                </div>

                {actionables.map((action) => (
              <div
                key={action.id}
                className={`bg-muted rounded-xl border p-5 ${
                  action.priority === "high" ? "border-red-500/30" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      action.type === "overdue_review" ? "bg-red-500/10" :
                      action.type === "pending_feedback" ? "bg-purple-500/10" :
                      action.type === "goal_at_risk" ? "bg-amber-500/10" :
                      "bg-blue-500/10"
                    }`}>
                      {action.type === "overdue_review" && <AlertCircle className="h-5 w-5 text-red-400" />}
                      {action.type === "pending_feedback" && <MessageSquare className="h-5 w-5 text-purple-400" />}
                      {action.type === "goal_at_risk" && <Target className="h-5 w-5 text-amber-400" />}
                      {action.type === "manager_review_needed" && <UserCheck className="h-5 w-5 text-blue-400" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-foreground font-medium">{action.title}</h3>
                        {action.priority === "high" && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                            High Priority
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-sm">{action.description}</p>
                      {action.dueDate && (
                        <p className="text-red-400 text-xs mt-1">Due: {action.dueDate}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {action.memberId && (
                      <Link
                        href={`/reviews/manage/${action.memberId}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition"
                      >
                        View
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    )}
                    {action.type === "manager_review_needed" && (
                      <button className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm transition">
                        Start Review
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
              </>
            ) : (
              <div className="bg-muted rounded-xl border border-border p-12 text-center">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">All caught up!</h3>
                <p className="text-muted-foreground text-sm">
                  No pending actions at the moment. Check back later or view team overview.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "suggestions" && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-purple-400" />
                <div>
                  <h3 className="text-purple-400 font-medium">AI-Powered Goal Suggestions</h3>
                  <p className="text-purple-400/70 text-sm">
                    Based on GitHub activity, PR patterns, and project management data. Convert to goals or discard.
                  </p>
                </div>
              </div>
            </div>

            {activeSuggestions.length === 0 && discardedSuggestions.length === 0 ? (
              <div className="bg-muted rounded-xl border border-border p-12 text-center">
                <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lightbulb className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No suggestions yet</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Goal suggestions will appear here as we analyze GitHub activity and project management data from your team.
                </p>
              </div>
            ) : (
              <>
                {/* Active Suggestions */}
                <div>
                  <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-amber-400" />
                    Active Suggestions ({activeSuggestions.length})
                  </h3>

                  {activeSuggestions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No active suggestions</p>
                  ) : (
                    <div className="space-y-4">
                      {activeSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="bg-muted rounded-xl border border-border overflow-hidden"
                  >
                    <div
                      className="p-5 cursor-pointer"
                      onClick={() => setExpandedSuggestion(
                        expandedSuggestion === suggestion.id ? null : suggestion.id
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                            {suggestion.memberName.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-foreground font-medium">{suggestion.title}</h3>
                              <span className="px-2 py-0.5 bg-accent text-muted-foreground text-xs rounded-full">
                                {suggestion.source}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-xs ${
                                suggestion.confidence >= 90 ? "bg-emerald-500/20 text-emerald-400" :
                                suggestion.confidence >= 80 ? "bg-blue-500/20 text-blue-400" :
                                "bg-amber-500/20 text-amber-400"
                              }`}>
                                {suggestion.confidence}% confidence
                              </span>
                            </div>
                            <p className="text-muted-foreground text-sm mb-2">{suggestion.memberName}</p>
                            <p className="text-foreground text-sm">{suggestion.description}</p>

                            {/* Activity Stats */}
                            <div className="flex items-center gap-4 mt-3">
                              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                                <GitCommit className="h-3.5 w-3.5" />
                                {suggestion.commits} commits
                              </span>
                              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                                <GitPullRequest className="h-3.5 w-3.5" />
                                {suggestion.prs} PRs
                              </span>
                            </div>
                          </div>
                        </div>
                        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${
                          expandedSuggestion === suggestion.id ? "rotate-180" : ""
                        }`} />
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {expandedSuggestion === suggestion.id && (
                      <div className="px-5 pb-5 border-t border-border pt-4">
                        {/* Suggested Goal */}
                        <div className="bg-background rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4 text-cyan-400" />
                            <span className="text-cyan-400 text-sm font-medium">Suggested Goal</span>
                          </div>
                          <p className="text-foreground">{suggestion.suggestedGoal}</p>
                        </div>

                        {/* Keywords */}
                        <div className="mb-4">
                          <p className="text-muted-foreground text-sm mb-2">Tracking Keywords:</p>
                          <div className="flex flex-wrap gap-2">
                            {suggestion.keywords.map((keyword) => (
                              <span
                                key={keyword}
                                className="px-2 py-1 bg-accent text-foreground text-xs rounded-lg"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/reviews/goals/new?suggestion=${suggestion.id}&member=${suggestion.memberId}&title=${encodeURIComponent(suggestion.suggestedGoal)}&keywords=${encodeURIComponent(suggestion.keywords.join(","))}`}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition"
                          >
                            <Plus className="h-4 w-4" />
                            Convert to Goal
                          </Link>
                          <Link
                            href={`/reviews/manage/${suggestion.memberId}`}
                            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition"
                          >
                            <Eye className="h-4 w-4" />
                            View Member
                          </Link>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDiscardSuggestion(suggestion.id);
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg text-sm transition"
                          >
                            <X className="h-4 w-4" />
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
