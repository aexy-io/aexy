"use client";

import { useState } from "react";
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
import { AppHeader } from "@/components/layout/AppHeader";
import { useWorkspace } from "@/hooks/useWorkspace";

// Mock data for demonstration
const mockTeamMembers = [
  {
    id: "1",
    name: "Sarah Chen",
    avatar: null,
    role: "Senior Engineer",
    reviewStatus: "self_review_submitted",
    goalsCount: 3,
    completedGoals: 1,
    pendingFeedback: 2,
    lastActivity: "2 hours ago",
  },
  {
    id: "2",
    name: "Marcus Johnson",
    avatar: null,
    role: "Full Stack Developer",
    reviewStatus: "pending",
    goalsCount: 2,
    completedGoals: 0,
    pendingFeedback: 0,
    lastActivity: "1 day ago",
  },
  {
    id: "3",
    name: "Emily Zhang",
    avatar: null,
    role: "Backend Engineer",
    reviewStatus: "peer_review_in_progress",
    goalsCount: 4,
    completedGoals: 2,
    pendingFeedback: 3,
    lastActivity: "5 hours ago",
  },
  {
    id: "4",
    name: "David Kim",
    avatar: null,
    role: "DevOps Engineer",
    reviewStatus: "completed",
    goalsCount: 2,
    completedGoals: 2,
    pendingFeedback: 0,
    lastActivity: "3 days ago",
  },
];

const mockActionables = [
  {
    id: "1",
    type: "overdue_review",
    title: "Self-review overdue",
    description: "Marcus Johnson hasn't submitted self-review",
    member: "Marcus Johnson",
    memberId: "2",
    dueDate: "2 days ago",
    priority: "high",
  },
  {
    id: "2",
    type: "pending_feedback",
    title: "Peer feedback pending",
    description: "3 team members waiting for peer reviews",
    count: 3,
    priority: "medium",
  },
  {
    id: "3",
    type: "goal_at_risk",
    title: "Goal at risk",
    description: "API Performance goal - Sarah Chen (30% complete, 5 days left)",
    member: "Sarah Chen",
    memberId: "1",
    priority: "high",
  },
  {
    id: "4",
    type: "manager_review_needed",
    title: "Manager review needed",
    description: "Emily Zhang ready for manager review",
    member: "Emily Zhang",
    memberId: "3",
    priority: "medium",
  },
];

const mockGitHubSuggestions = [
  {
    id: "1",
    memberId: "1",
    memberName: "Sarah Chen",
    type: "commit_pattern",
    source: "GitHub Commits",
    title: "Performance optimization expertise",
    description: "15 commits related to API optimization and caching improvements over the past month",
    suggestedGoal: "Lead performance optimization initiative for Q1",
    keywords: ["performance", "optimization", "caching", "api"],
    commits: 15,
    prs: 3,
    confidence: 92,
    discarded: false,
  },
  {
    id: "2",
    memberId: "3",
    memberName: "Emily Zhang",
    type: "pr_review",
    source: "Pull Requests",
    title: "Database migration leadership",
    description: "Authored 4 PRs for database schema migrations with comprehensive documentation",
    suggestedGoal: "Own database architecture decisions and documentation",
    keywords: ["database", "migration", "schema", "postgresql"],
    commits: 28,
    prs: 4,
    confidence: 87,
    discarded: false,
  },
  {
    id: "3",
    memberId: "2",
    memberName: "Marcus Johnson",
    type: "code_review",
    source: "Code Reviews",
    title: "Frontend mentorship activity",
    description: "Reviewed 12 PRs from junior developers with detailed feedback",
    suggestedGoal: "Formalize frontend mentorship program",
    keywords: ["react", "frontend", "mentorship", "review"],
    commits: 8,
    prs: 2,
    confidence: 78,
    discarded: false,
  },
  {
    id: "4",
    memberId: "4",
    memberName: "David Kim",
    type: "project_management",
    source: "Linear/Jira",
    title: "CI/CD pipeline improvements",
    description: "Completed 8 tasks related to deployment automation and monitoring",
    suggestedGoal: "Reduce deployment time by 50% through automation",
    keywords: ["ci/cd", "deployment", "automation", "devops"],
    commits: 22,
    prs: 5,
    confidence: 95,
    discarded: false,
  },
];

const reviewStatusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: "Pending", color: "text-slate-400", bgColor: "bg-slate-500/20" },
  self_review_submitted: { label: "Self Review Done", color: "text-blue-400", bgColor: "bg-blue-500/20" },
  peer_review_in_progress: { label: "Peer Review", color: "text-purple-400", bgColor: "bg-purple-500/20" },
  manager_review_in_progress: { label: "Manager Review", color: "text-amber-400", bgColor: "bg-amber-500/20" },
  completed: { label: "Completed", color: "text-emerald-400", bgColor: "bg-emerald-500/20" },
  acknowledged: { label: "Acknowledged", color: "text-cyan-400", bgColor: "bg-cyan-500/20" },
};

export default function ReviewsManagePage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { currentWorkspaceId, hasWorkspaces } = useWorkspace();

  const [activeTab, setActiveTab] = useState<"overview" | "actionables" | "suggestions">("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [suggestions, setSuggestions] = useState(mockGitHubSuggestions);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const filteredMembers = mockTeamMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         member.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || member.reviewStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-900">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-slate-400 hover:text-white transition flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white">Management</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Review Management</h1>
            <p className="text-slate-400 mt-1">
              Monitor team reviews, track deliverables, and manage goals
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/reviews/cycles"
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
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
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-slate-400 text-sm">Team Members</span>
            </div>
            <p className="text-2xl font-bold text-white">{mockTeamMembers.length}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-slate-400 text-sm">Completed</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {mockTeamMembers.filter(m => m.reviewStatus === "completed").length}
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-slate-400 text-sm">In Progress</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {mockTeamMembers.filter(m => ["self_review_submitted", "peer_review_in_progress", "manager_review_in_progress"].includes(m.reviewStatus)).length}
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <span className="text-slate-400 text-sm">Action Needed</span>
            </div>
            <p className="text-2xl font-bold text-white">{mockActionables.length}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Lightbulb className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-slate-400 text-sm">Suggestions</span>
            </div>
            <p className="text-2xl font-bold text-white">{activeSuggestions.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-slate-800 p-1 rounded-lg w-fit">
          {[
            { key: "overview", label: "Team Overview", icon: Users },
            { key: "actionables", label: "Actionables", icon: AlertCircle, count: mockActionables.length },
            { key: "suggestions", label: "GitHub Suggestions", icon: Lightbulb, count: activeSuggestions.length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key ? "bg-slate-600" : "bg-slate-700"
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search team members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500 text-sm"
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
                    className="bg-slate-800 rounded-xl border border-slate-700 p-5 hover:border-slate-600 transition"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                          {member.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <h3 className="text-white font-medium">{member.name}</h3>
                          <p className="text-slate-400 text-sm">{member.role}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center">
                        <p className="text-white font-semibold">{member.goalsCount}</p>
                        <p className="text-slate-500 text-xs">Goals</p>
                      </div>
                      <div className="text-center">
                        <p className="text-emerald-400 font-semibold">{member.completedGoals}</p>
                        <p className="text-slate-500 text-xs">Completed</p>
                      </div>
                      <div className="text-center">
                        <p className={`font-semibold ${member.pendingFeedback > 0 ? "text-amber-400" : "text-slate-400"}`}>
                          {member.pendingFeedback}
                        </p>
                        <p className="text-slate-500 text-xs">Pending</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                      <span className="text-slate-500 text-xs">Active {member.lastActivity}</span>
                      <div className="flex items-center gap-2">
                        <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition">
                          <Eye className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/reviews/manage/${member.id}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
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
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <div>
                  <h3 className="text-amber-400 font-medium">Action Required</h3>
                  <p className="text-amber-400/70 text-sm">
                    {mockActionables.length} items need your attention to keep the review cycle on track
                  </p>
                </div>
              </div>
            </div>

            {mockActionables.map((action) => (
              <div
                key={action.id}
                className={`bg-slate-800 rounded-xl border p-5 ${
                  action.priority === "high" ? "border-red-500/30" : "border-slate-700"
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
                        <h3 className="text-white font-medium">{action.title}</h3>
                        {action.priority === "high" && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                            High Priority
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-sm">{action.description}</p>
                      {action.dueDate && (
                        <p className="text-red-400 text-xs mt-1">Due: {action.dueDate}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {action.memberId && (
                      <Link
                        href={`/reviews/manage/${action.memberId}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
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

            {/* Active Suggestions */}
            <div>
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-400" />
                Active Suggestions ({activeSuggestions.length})
              </h3>

              <div className="space-y-4">
                {activeSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
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
                              <h3 className="text-white font-medium">{suggestion.title}</h3>
                              <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded-full">
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
                            <p className="text-slate-400 text-sm mb-2">{suggestion.memberName}</p>
                            <p className="text-slate-300 text-sm">{suggestion.description}</p>

                            {/* Activity Stats */}
                            <div className="flex items-center gap-4 mt-3">
                              <span className="flex items-center gap-1 text-slate-500 text-xs">
                                <GitCommit className="h-3.5 w-3.5" />
                                {suggestion.commits} commits
                              </span>
                              <span className="flex items-center gap-1 text-slate-500 text-xs">
                                <GitPullRequest className="h-3.5 w-3.5" />
                                {suggestion.prs} PRs
                              </span>
                            </div>
                          </div>
                        </div>
                        <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${
                          expandedSuggestion === suggestion.id ? "rotate-180" : ""
                        }`} />
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {expandedSuggestion === suggestion.id && (
                      <div className="px-5 pb-5 border-t border-slate-700 pt-4">
                        {/* Suggested Goal */}
                        <div className="bg-slate-900 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4 text-cyan-400" />
                            <span className="text-cyan-400 text-sm font-medium">Suggested Goal</span>
                          </div>
                          <p className="text-white">{suggestion.suggestedGoal}</p>
                        </div>

                        {/* Keywords */}
                        <div className="mb-4">
                          <p className="text-slate-400 text-sm mb-2">Tracking Keywords:</p>
                          <div className="flex flex-wrap gap-2">
                            {suggestion.keywords.map((keyword) => (
                              <span
                                key={keyword}
                                className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded-lg"
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
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
                          >
                            <Eye className="h-4 w-4" />
                            View Member
                          </Link>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDiscardSuggestion(suggestion.id);
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg text-sm transition"
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
            </div>

            {/* Discarded Suggestions */}
            {discardedSuggestions.length > 0 && (
              <div>
                <h3 className="text-slate-400 font-medium mb-4 flex items-center gap-2">
                  <X className="h-4 w-4" />
                  Discarded ({discardedSuggestions.length})
                </h3>

                <div className="space-y-2">
                  {discardedSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-slate-500 text-xs font-bold">
                          {suggestion.memberName.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm">{suggestion.title}</p>
                          <p className="text-slate-500 text-xs">{suggestion.memberName}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestoreSuggestion(suggestion.id)}
                        className="text-slate-500 hover:text-white text-sm transition"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
