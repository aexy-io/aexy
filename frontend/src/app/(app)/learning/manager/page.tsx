"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  learningManagementApi,
  ManagerDashboardOverview,
  LearningGoalWithDetails,
  LearningBudgetWithDetails,
  DeveloperLearningProgress,
  LearningGoalCreate,
  LearningGoalStatus,
  LearningGoalType,
} from "@/lib/api";

function formatCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function getStatusColor(status: LearningGoalStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-500/20 text-green-400";
    case "in_progress":
      return "bg-blue-500/20 text-blue-400";
    case "overdue":
      return "bg-red-500/20 text-red-400";
    case "cancelled":
      return "bg-gray-500/20 text-gray-400";
    default:
      return "bg-yellow-500/20 text-yellow-400";
  }
}

function getPriorityLabel(priority: number): string {
  switch (priority) {
    case 4:
      return "Critical";
    case 3:
      return "High";
    case 2:
      return "Medium";
    case 1:
      return "Low";
    default:
      return "None";
  }
}

function getGoalTypeLabel(type: LearningGoalType): string {
  switch (type) {
    case "course_completion":
      return "Course Completion";
    case "hours_spent":
      return "Learning Hours";
    case "skill_acquisition":
      return "Skill Acquisition";
    case "certification":
      return "Certification";
    case "path_completion":
      return "Learning Path";
    default:
      return "Custom";
  }
}

export default function ManagerLearningPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "goals" | "budgets" | "team">("overview");
  const [showCreateGoalModal, setShowCreateGoalModal] = useState(false);
  const queryClient = useQueryClient();

  // Fetch dashboard overview
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["manager-dashboard"],
    queryFn: () => learningManagementApi.dashboard.getOverview(),
  });

  // Fetch goals
  const { data: goalsData, isLoading: goalsLoading } = useQuery({
    queryKey: ["learning-goals"],
    queryFn: () => learningManagementApi.goals.list({ page_size: 50 }),
  });

  // Fetch budgets
  const { data: budgetsData, isLoading: budgetsLoading } = useQuery({
    queryKey: ["learning-budgets"],
    queryFn: () => learningManagementApi.budgets.list({ is_active: true }),
  });

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "goals", label: "Goals" },
    { id: "budgets", label: "Budgets" },
    { id: "team", label: "Team Progress" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Manager Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Track your team&apos;s learning progress and manage goals
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/learning/manager/approvals"
              className="px-4 py-2 bg-muted hover:bg-accent rounded-lg text-sm transition-colors flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              Approval Queue
              {overview && overview.pending_approval_requests > 0 && (
                <span className="px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                  {overview.pending_approval_requests}
                </span>
              )}
            </Link>
            <button
              onClick={() => setShowCreateGoalModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors"
            >
              + Set Goal
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-background p-1 rounded-lg w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {overviewLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading dashboard...
              </div>
            ) : overview ? (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    title="Team Members"
                    value={overview.total_team_members}
                    icon={
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                        />
                      </svg>
                    }
                  />
                  <StatCard
                    title="Active Goals"
                    value={overview.total_active_goals}
                    subtitle={`${overview.goals_overdue} overdue`}
                    subtitleColor={overview.goals_overdue > 0 ? "text-red-400" : "text-muted-foreground"}
                    icon={
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    }
                  />
                  <StatCard
                    title="Goal Completion"
                    value={`${overview.overall_goal_completion_rate.toFixed(0)}%`}
                    subtitle={`${overview.goals_completed_this_period} completed`}
                    icon={
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                    }
                  />
                  <StatCard
                    title="Budget Utilization"
                    value={`${overview.budget_utilization_percentage.toFixed(0)}%`}
                    subtitle={`${formatCurrency(overview.spent_budget_cents)} spent`}
                    icon={
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    }
                  />
                </div>

                {/* Budget Overview */}
                <div className="bg-background rounded-lg p-6">
                  <h2 className="text-lg font-semibold mb-4">Budget Summary</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                      <p className="text-muted-foreground text-sm">Total Budget</p>
                      <p className="text-2xl font-bold text-foreground">
                        {formatCurrency(overview.total_budget_cents)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-sm">Spent</p>
                      <p className="text-2xl font-bold text-blue-400">
                        {formatCurrency(overview.spent_budget_cents)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-sm">Reserved</p>
                      <p className="text-2xl font-bold text-yellow-400">
                        {formatCurrency(overview.reserved_budget_cents)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                        style={{
                          width: `${Math.min(overview.budget_utilization_percentage, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {overview.pending_approval_requests > 0 && (
                    <Link
                      href="/learning/manager/approvals"
                      className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 hover:bg-orange-500/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/20 rounded-lg">
                          <svg
                            className="w-5 h-5 text-orange-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Pending Approvals</p>
                          <p className="text-sm text-muted-foreground">
                            {overview.pending_approval_requests} requests waiting
                          </p>
                        </div>
                      </div>
                    </Link>
                  )}
                  {overview.goals_overdue > 0 && (
                    <button
                      onClick={() => setActiveTab("goals")}
                      className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 hover:bg-red-500/20 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/20 rounded-lg">
                          <svg
                            className="w-5 h-5 text-red-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Overdue Goals</p>
                          <p className="text-sm text-muted-foreground">
                            {overview.goals_overdue} goals need attention
                          </p>
                        </div>
                      </div>
                    </button>
                  )}
                  {overview.certifications_expiring_soon > 0 && (
                    <Link
                      href="/learning/compliance"
                      className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 hover:bg-yellow-500/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-500/20 rounded-lg">
                          <svg
                            className="w-5 h-5 text-yellow-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Expiring Certifications</p>
                          <p className="text-sm text-muted-foreground">
                            {overview.certifications_expiring_soon} expiring soon
                          </p>
                        </div>
                      </div>
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No data available
              </div>
            )}
          </div>
        )}

        {/* Goals Tab */}
        {activeTab === "goals" && (
          <div className="space-y-4">
            {goalsLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading goals...</div>
            ) : goalsData?.items && goalsData.items.length > 0 ? (
              goalsData.items.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No learning goals yet</p>
                <button
                  onClick={() => setShowCreateGoalModal(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white transition-colors"
                >
                  Create First Goal
                </button>
              </div>
            )}
          </div>
        )}

        {/* Budgets Tab */}
        {activeTab === "budgets" && (
          <div className="space-y-4">
            {budgetsLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading budgets...</div>
            ) : budgetsData?.items && budgetsData.items.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {budgetsData.items.map((budget) => (
                  <BudgetCard key={budget.id} budget={budget} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No learning budgets configured</p>
                <p className="text-sm mt-2">Contact your administrator to set up budgets</p>
              </div>
            )}
          </div>
        )}

        {/* Team Tab */}
        {activeTab === "team" && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Team progress view coming soon</p>
            <p className="text-sm mt-2">View individual developer progress and team metrics</p>
          </div>
        )}
      </div>

      {/* Create Goal Modal */}
      {showCreateGoalModal && (
        <CreateGoalModal onClose={() => setShowCreateGoalModal(false)} />
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  subtitleColor = "text-muted-foreground",
  icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-background rounded-lg p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-muted rounded-lg text-muted-foreground">{icon}</div>
        <span className="text-muted-foreground text-sm">{title}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className={`text-sm mt-1 ${subtitleColor}`}>{subtitle}</p>}
    </div>
  );
}

function GoalCard({ goal }: { goal: LearningGoalWithDetails }) {
  return (
    <div className="bg-background rounded-lg p-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold">{goal.title}</h3>
          <p className="text-sm text-muted-foreground">
            {goal.developer_name} &middot; Set by {goal.set_by_name}
          </p>
        </div>
        <span className={`px-2 py-1 rounded text-xs ${getStatusColor(goal.status)}`}>
          {goal.status.replace("_", " ")}
        </span>
      </div>
      {goal.description && (
        <p className="text-sm text-muted-foreground mb-3">{goal.description}</p>
      )}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          {getGoalTypeLabel(goal.goal_type)}
        </span>
        <span className="text-muted-foreground">
          Priority: {getPriorityLabel(goal.priority)}
        </span>
        {goal.due_date && (
          <span className={goal.is_overdue ? "text-red-400" : "text-muted-foreground"}>
            Due: {new Date(goal.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted-foreground">Progress</span>
          <span className="text-foreground">{goal.progress_percentage}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${goal.progress_percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function BudgetCard({ budget }: { budget: LearningBudgetWithDetails }) {
  return (
    <div className="bg-background rounded-lg p-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold">{budget.name}</h3>
          <p className="text-sm text-muted-foreground">
            {budget.developer_name || budget.team_name || "Workspace"} &middot; FY
            {budget.fiscal_year}
            {budget.fiscal_quarter && ` Q${budget.fiscal_quarter}`}
          </p>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs ${
            budget.is_active ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
          }`}
        >
          {budget.is_active ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 text-sm">
        <div>
          <p className="text-muted-foreground">Total</p>
          <p className="font-semibold">{formatCurrency(budget.budget_cents)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Spent</p>
          <p className="font-semibold text-blue-400">
            {formatCurrency(budget.spent_cents)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Remaining</p>
          <p className="font-semibold text-green-400">
            {formatCurrency(budget.remaining_cents)}
          </p>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            budget.utilization_percentage > 90
              ? "bg-red-500"
              : budget.utilization_percentage > 70
              ? "bg-yellow-500"
              : "bg-blue-500"
          }`}
          style={{ width: `${Math.min(budget.utilization_percentage, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {budget.utilization_percentage.toFixed(0)}% utilized
        {budget.pending_approvals_count > 0 && (
          <> &middot; {budget.pending_approvals_count} pending approvals</>
        )}
      </p>
    </div>
  );
}

function CreateGoalModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<LearningGoalCreate>({
    developer_id: "",
    title: "",
    description: "",
    goal_type: "custom",
    target_value: 0,
    priority: 2,
  });

  const createMutation = useMutation({
    mutationFn: (data: LearningGoalCreate) => learningManagementApi.goals.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-goals"] });
      queryClient.invalidateQueries({ queryKey: ["manager-dashboard"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.developer_id || !formData.title) return;
    createMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Set Learning Goal</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Developer ID</label>
            <input
              type="text"
              value={formData.developer_id}
              onChange={(e) =>
                setFormData({ ...formData, developer_id: e.target.value })
              }
              className="w-full px-3 py-2 bg-muted rounded-lg border border-border focus:border-blue-500 focus:outline-none"
              placeholder="Enter developer ID"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 bg-muted rounded-lg border border-border focus:border-blue-500 focus:outline-none"
              placeholder="e.g., Complete AWS Certification"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Description</label>
            <textarea
              value={formData.description || ""}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-3 py-2 bg-muted rounded-lg border border-border focus:border-blue-500 focus:outline-none"
              rows={3}
              placeholder="Describe the goal..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Goal Type</label>
              <select
                value={formData.goal_type}
                onChange={(e) =>
                  setFormData({ ...formData, goal_type: e.target.value as LearningGoalType })
                }
                className="w-full px-3 py-2 bg-muted rounded-lg border border-border focus:border-blue-500 focus:outline-none"
              >
                <option value="custom">Custom</option>
                <option value="course_completion">Course Completion</option>
                <option value="hours_spent">Learning Hours</option>
                <option value="skill_acquisition">Skill Acquisition</option>
                <option value="certification">Certification</option>
                <option value="path_completion">Learning Path</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 bg-muted rounded-lg border border-border focus:border-blue-500 focus:outline-none"
              >
                <option value="0">None</option>
                <option value="1">Low</option>
                <option value="2">Medium</option>
                <option value="3">High</option>
                <option value="4">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Due Date</label>
            <input
              type="date"
              value={formData.due_date?.split("T")[0] || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  due_date: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                })
              }
              className="w-full px-3 py-2 bg-muted rounded-lg border border-border focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
