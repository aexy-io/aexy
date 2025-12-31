"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect, useParams } from "next/navigation";
import Link from "next/link";
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
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

// Mock member data
const mockMemberData: Record<string, {
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
}> = {
  "1": {
    id: "1",
    name: "Sarah Chen",
    role: "Senior Engineer",
    email: "sarah.chen@company.com",
    joinedDate: "March 2022",
    manager: "You",
    team: "Platform Team",
    reviewStatus: "self_review_submitted",
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Redis", "AWS"],
    contributions: {
      commits: 127,
      prs: 23,
      reviews: 45,
      linesAdded: 15420,
      linesRemoved: 8340,
    },
    goals: [
      {
        id: "g1",
        title: "Improve API response times by 50%",
        type: "performance",
        status: "in_progress",
        progress: 65,
        dueDate: "2025-01-31",
        keyResults: [
          { description: "Reduce p95 latency", target: 400, current: 520, unit: "ms" },
          { description: "Implement caching layer", target: 100, current: 75, unit: "%" },
        ],
      },
      {
        id: "g2",
        title: "Lead frontend architecture modernization",
        type: "project",
        status: "in_progress",
        progress: 40,
        dueDate: "2025-02-28",
        keyResults: [
          { description: "Migrate components", target: 50, current: 20, unit: "components" },
        ],
      },
      {
        id: "g3",
        title: "Complete AWS certification",
        type: "skill_development",
        status: "completed",
        progress: 100,
        dueDate: "2024-12-15",
        keyResults: [
          { description: "Pass certification exam", target: 1, current: 1, unit: "exam" },
        ],
      },
    ],
    suggestions: [
      {
        id: "s1",
        title: "Performance optimization expertise",
        description: "15 commits related to API optimization and caching improvements",
        suggestedGoal: "Lead performance optimization initiative for Q1",
        source: "GitHub Commits",
        confidence: 92,
        keywords: ["performance", "optimization", "caching"],
      },
    ],
    feedbackSummary: {
      strengths: [
        "Excellent technical problem-solving skills",
        "Proactive communication with stakeholders",
        "Strong mentorship of junior developers",
      ],
      growthAreas: [
        "Could improve documentation practices",
        "Sometimes takes on too much work",
      ],
      peerCount: 4,
    },
  },
};

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
  pending: { bg: "bg-slate-500/20", text: "text-slate-400" },
};

export default function MemberDetailPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const params = useParams();
  const memberId = params.memberId as string;

  const [activeTab, setActiveTab] = useState<"overview" | "goals" | "contributions" | "feedback">("overview");
  const [showAddGoalFromSuggestion, setShowAddGoalFromSuggestion] = useState<string | null>(null);

  const member = mockMemberData[memberId] || mockMemberData["1"];

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

  const activeGoals = member.goals.filter(g => g.status !== "completed");
  const completedGoals = member.goals.filter(g => g.status === "completed");

  return (
    <div className="min-h-screen bg-slate-900">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-slate-400 hover:text-white transition">
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <Link href="/reviews/manage" className="text-slate-400 hover:text-white transition">
            Management
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white">{member.name}</span>
        </div>

        {/* Member Header */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                {member.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{member.name}</h1>
                <p className="text-slate-400">{member.role} • {member.team}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                  <span>Manager: {member.manager}</span>
                  <span>•</span>
                  <span>Joined {member.joinedDate}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm">
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
          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-slate-400 text-sm mb-2">Skills</p>
            <div className="flex flex-wrap gap-2">
              {member.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded-lg"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-400 text-sm">Active Goals</span>
            </div>
            <p className="text-2xl font-bold text-white">{activeGoals.length}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 text-sm">Completed</span>
            </div>
            <p className="text-2xl font-bold text-white">{completedGoals.length}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <GitCommit className="w-4 h-4 text-purple-400" />
              <span className="text-slate-400 text-sm">Commits</span>
            </div>
            <p className="text-2xl font-bold text-white">{member.contributions.commits}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequest className="w-4 h-4 text-blue-400" />
              <span className="text-slate-400 text-sm">PRs</span>
            </div>
            <p className="text-2xl font-bold text-white">{member.contributions.prs}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span className="text-slate-400 text-sm">Reviews</span>
            </div>
            <p className="text-2xl font-bold text-white">{member.contributions.reviews}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-slate-800 p-1 rounded-lg w-fit">
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
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-white"
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
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Target className="h-5 w-5 text-cyan-400" />
                    Active Goals
                  </h3>
                  <Link
                    href={`/reviews/goals/new?member=${member.id}`}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
                  >
                    <Plus className="h-4 w-4" />
                    Assign Goal
                  </Link>
                </div>
                <div className="p-4 space-y-3">
                  {activeGoals.map((goal) => (
                    <div key={goal.id} className="bg-slate-900 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-white font-medium">{goal.title}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${goalTypeColors[goal.type]?.bg} ${goalTypeColors[goal.type]?.text}`}>
                              {goal.type.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-slate-500 text-sm">Due: {new Date(goal.dueDate).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${goalStatusColors[goal.status]?.bg} ${goalStatusColors[goal.status]?.text}`}>
                          {goal.progress}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
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
                              <span className="text-slate-400">{kr.description}</span>
                              <span className="text-slate-300">
                                {kr.current}/{kr.target} {kr.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {activeGoals.length === 0 && (
                    <div className="text-center py-8 text-slate-400">
                      No active goals
                    </div>
                  )}
                </div>
              </div>

              {/* GitHub Suggestions */}
              {member.suggestions.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-700">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-amber-400" />
                      Goal Suggestions from GitHub
                    </h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {member.suggestions.map((suggestion) => (
                      <div key={suggestion.id} className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="text-white font-medium">{suggestion.title}</h4>
                            <p className="text-slate-400 text-sm mt-1">{suggestion.description}</p>
                          </div>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                            {suggestion.confidence}% match
                          </span>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-3 mb-3">
                          <p className="text-slate-400 text-xs mb-1">Suggested Goal:</p>
                          <p className="text-white text-sm">{suggestion.suggestedGoal}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1">
                            {suggestion.keywords.map((kw) => (
                              <span key={kw} className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">
                                {kw}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="text-slate-400 hover:text-red-400 text-sm transition">
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
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-purple-400" />
                    Feedback Summary
                  </h3>
                  <p className="text-slate-500 text-sm mt-1">
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
                        <li key={idx} className="text-slate-300 text-sm pl-4 border-l-2 border-emerald-500/30">
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
                        <li key={idx} className="text-slate-300 text-sm pl-4 border-l-2 border-amber-500/30">
                          {area}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Contribution Stats */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Code className="h-5 w-5 text-blue-400" />
                    Code Impact
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Lines Added</span>
                    <span className="text-emerald-400 font-medium">+{member.contributions.linesAdded.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Lines Removed</span>
                    <span className="text-red-400 font-medium">-{member.contributions.linesRemoved.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                    <span className="text-slate-400 text-sm">Net Change</span>
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
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <h3 className="text-white font-medium mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                    <UserCheck className="h-4 w-4" />
                    Request Peer Review
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                    <Calendar className="h-4 w-4" />
                    Schedule 1:1
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
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
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">All Goals</h2>
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
                <div key={goal.id} className="bg-slate-800 rounded-xl border border-slate-700 p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-semibold">{goal.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${goalTypeColors[goal.type]?.bg} ${goalTypeColors[goal.type]?.text}`}>
                          {goal.type.replace("_", " ")}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${goalStatusColors[goal.status]?.bg} ${goalStatusColors[goal.status]?.text}`}>
                          {goal.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-slate-500 text-sm">Due: {new Date(goal.dueDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">{goal.progress}%</p>
                      <p className="text-slate-500 text-sm">Progress</p>
                    </div>
                  </div>

                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-4">
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
                      <p className="text-slate-400 text-sm font-medium">Key Results</p>
                      {goal.keyResults.map((kr, idx) => (
                        <div key={idx} className="bg-slate-900 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-white text-sm">{kr.description}</span>
                            <span className="text-slate-400 text-sm">
                              {kr.current}/{kr.target} {kr.unit}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
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
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="text-center py-12">
              <GitPullRequest className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-white mb-2">Contribution History</h3>
              <p className="text-slate-400 text-sm mb-6">
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
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">Self Review</h3>
              </div>
              <div className="p-6 text-center py-12">
                <ClipboardCheck className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Self review submitted</p>
                <button className="mt-4 text-primary-400 hover:text-primary-300 text-sm transition">
                  View submission
                </button>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Peer Reviews</h3>
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                  {member.feedbackSummary.peerCount} received
                </span>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {member.feedbackSummary.strengths.slice(0, 2).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-slate-400 text-xs">
                          A
                        </div>
                        <span className="text-slate-500 text-sm">Anonymous peer</span>
                      </div>
                      <p className="text-slate-300 text-sm">&ldquo;{item}&rdquo;</p>
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
