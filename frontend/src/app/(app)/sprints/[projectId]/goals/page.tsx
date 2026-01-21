"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Calendar,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useOKRGoals, useOKRGoal, useOKRKeyResults, useOKRDashboard } from "@/hooks/useOKRGoals";
import { GoalCard } from "@/components/goals/GoalCard";
import { KeyResultProgress } from "@/components/goals/KeyResultProgress";
import { EntityTimeline } from "@/components/timeline/EntityTimeline";
import {
  OKRGoal,
  OKRGoalType,
  OKRGoalStatus,
  OKRPeriodType,
  OKRGoalCreate,
  OKRGoalUpdate,
} from "@/lib/api";

const STATUS_OPTIONS: { value: OKRGoalStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "not_started", label: "Not Started" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "on_track", label: "On Track" },
  { value: "at_risk", label: "At Risk" },
  { value: "behind", label: "Behind" },
  { value: "achieved", label: "Achieved" },
  { value: "missed", label: "Missed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTIONS: { value: OKRGoalType | "all"; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "objective", label: "Objectives" },
  { value: "key_result", label: "Key Results" },
  { value: "initiative", label: "Initiatives" },
];

const PERIOD_OPTIONS: { value: OKRPeriodType | "all"; label: string }[] = [
  { value: "all", label: "All Periods" },
  { value: "quarter", label: "Quarterly" },
  { value: "year", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

interface GoalFormData {
  title: string;
  description: string;
  goal_type: OKRGoalType;
  period_type: OKRPeriodType;
  start_date: string;
  end_date: string;
  target_value: number;
  unit: string;
  parent_goal_id?: string;
  comment?: string;  // Optional comment for activity timeline when editing
}

// Helper to calculate period dates
function getQuarterDates(): { start: string; end: string } {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const year = now.getFullYear();
  const startMonth = quarter * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function getYearDates(): { start: string; end: string } {
  const year = new Date().getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

export default function GoalsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<OKRGoal | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<OKRGoal | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OKRGoalStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<OKRGoalType | "all">("objective");
  const [periodFilter, setPeriodFilter] = useState<OKRPeriodType | "all">("all");

  const [formData, setFormData] = useState<GoalFormData>(() => {
    const dates = getQuarterDates();
    return {
      title: "",
      description: "",
      goal_type: "objective",
      period_type: "quarter",
      start_date: dates.start,
      end_date: dates.end,
      target_value: 100,
      unit: "%",
      parent_goal_id: undefined,
    };
  });
  const [formError, setFormError] = useState<string | null>(null);

  const {
    goals,
    total,
    isLoading,
    createGoal,
    updateGoal,
    deleteGoal,
    isCreating,
    isUpdating,
  } = useOKRGoals(workspaceId, {
    goal_type: typeFilter === "all" ? undefined : typeFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    period_type: periodFilter === "all" ? undefined : periodFilter,
  });

  const { summary, objectives } = useOKRDashboard(workspaceId);

  // Filter by search on client side
  const filteredGoals = goals.filter((goal) => {
    const matchesSearch =
      searchQuery === "" ||
      goal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      goal.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (goal.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesSearch;
  });

  const handleGoalClick = (goal: OKRGoal) => {
    setSelectedGoal(goal);
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (confirm("Are you sure you want to delete this goal?")) {
      await deleteGoal(goalId);
    }
  };

  const handleEditGoal = (goal: OKRGoal) => {
    setEditingGoal(goal);
    setFormData({
      title: goal.title,
      description: goal.description || "",
      goal_type: goal.goal_type,
      period_type: goal.period_type || "quarter",
      start_date: goal.start_date || goal.period_start || "",
      end_date: goal.end_date || goal.period_end || "",
      target_value: goal.target_value || 100,
      unit: goal.unit || "%",
      parent_goal_id: goal.parent_goal_id || undefined,
      comment: "",
    });
    setShowCreateModal(true);
  };

  const handleSubmitGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate required fields
    if (!formData.start_date || !formData.end_date) {
      setFormError("Start date and end date are required");
      return;
    }

    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      setFormError("Start date must be before end date");
      return;
    }

    try {
      if (editingGoal) {
        // Update existing goal
        const data: OKRGoalUpdate = {
          title: formData.title,
          description: formData.description || undefined,
          period_type: formData.period_type,
          start_date: formData.start_date,
          end_date: formData.end_date,
          target_value: formData.target_value,
          unit: formData.unit || undefined,
          comment: formData.comment || undefined,  // Include comment for activity timeline
        };
        await updateGoal({ goalId: editingGoal.id, data });
      } else {
        // Create new goal
        const data: OKRGoalCreate = {
          title: formData.title,
          description: formData.description || undefined,
          goal_type: formData.goal_type,
          period_type: formData.period_type,
          start_date: formData.start_date,
          end_date: formData.end_date,
          target_value: formData.target_value,
          unit: formData.unit || undefined,
          parent_goal_id: formData.parent_goal_id,
        };
        await createGoal(data);
      }
      handleCloseModal();
    } catch (err: any) {
      // Handle API validation errors
      if (err?.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          const messages = detail.map((d: any) => `${d.loc?.slice(-1)?.[0] || "Field"}: ${d.msg}`).join(", ");
          setFormError(messages);
        } else if (typeof detail === "string") {
          setFormError(detail);
        } else {
          setFormError(`Failed to ${editingGoal ? "update" : "create"} goal. Please check all fields.`);
        }
      } else {
        setFormError(err?.message || `Failed to ${editingGoal ? "update" : "create"} goal. Please try again.`);
      }
    }
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setEditingGoal(null);
    setFormError(null);
    const dates = getQuarterDates();
    setFormData({
      title: "",
      description: "",
      goal_type: "objective",
      period_type: "quarter",
      start_date: dates.start,
      end_date: dates.end,
      target_value: 100,
      unit: "%",
      parent_goal_id: undefined,
      comment: "",
    });
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Please log in to view goals.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="h-6 w-6 text-purple-400" />
            Goals & OKRs
          </h1>
          <p className="text-slate-400 mt-1">
            {total} {total === 1 ? "goal" : "goals"} in workspace
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Goal
        </button>
      </div>

      {/* Dashboard Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{summary.total_objectives}</div>
          <div className="text-sm text-slate-400">Objectives</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">{summary.on_track}</div>
          <div className="text-sm text-slate-400">On Track</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-400">{summary.at_risk}</div>
          <div className="text-sm text-slate-400">At Risk</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{summary.behind}</div>
          <div className="text-sm text-slate-400">Behind</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-400">{summary.average_progress.toFixed(0)}%</div>
          <div className="text-sm text-slate-400">Avg Progress</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search goals..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as OKRGoalType | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OKRGoalStatus | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Period Filter */}
        <select
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value as OKRPeriodType | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Goals Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
        </div>
      ) : filteredGoals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Target className="h-12 w-12 text-slate-600 mb-4" />
          <p className="text-slate-400 mb-2">No goals found</p>
          <p className="text-slate-500 text-sm">
            {searchQuery || statusFilter !== "all" || typeFilter !== "all"
              ? "Try adjusting your filters"
              : "Create your first objective to get started"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGoals.map((goal) => {
            const keyResults = goals.filter(
              (g) => g.parent_goal_id === goal.id && g.goal_type === "key_result"
            );
            return (
              <GoalCard
                key={goal.id}
                goal={goal}
                onClick={handleGoalClick}
                onEdit={handleEditGoal}
                onDelete={handleDeleteGoal}
                showKeyResults={goal.goal_type === "objective"}
                keyResults={keyResults}
              />
            );
          })}
        </div>
      )}

      {/* Create/Edit Goal Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">
                {editingGoal ? "Edit Goal" : "Create Goal"}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitGoal} className="p-4 space-y-4">
              {/* Error Message */}
              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{formError}</p>
                </div>
              )}

              {!editingGoal && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Goal Type *
                  </label>
                  <select
                    value={formData.goal_type}
                    onChange={(e) => setFormData({ ...formData, goal_type: e.target.value as OKRGoalType })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  >
                    <option value="objective">Objective</option>
                    <option value="key_result">Key Result</option>
                    <option value="initiative">Initiative</option>
                  </select>
                </div>
              )}

              {!editingGoal && formData.goal_type === "key_result" && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Parent Objective
                  </label>
                  <select
                    value={formData.parent_goal_id || ""}
                    onChange={(e) => setFormData({ ...formData, parent_goal_id: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  >
                    <option value="">Select an objective...</option>
                    {objectives.map((obj) => (
                      <option key={obj.id} value={obj.id}>
                        {obj.key} - {obj.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={formData.goal_type === "objective" ? "e.g., Increase customer retention" : "e.g., Achieve 90% NPS score"}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this goal..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Target Value
                  </label>
                  <input
                    type="number"
                    value={formData.target_value}
                    onChange={(e) => setFormData({ ...formData, target_value: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="%, $, users, etc."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Period *
                </label>
                <select
                  value={formData.period_type}
                  onChange={(e) => {
                    const newPeriod = e.target.value as OKRPeriodType;
                    let dates = { start: formData.start_date, end: formData.end_date };
                    if (newPeriod === "quarter") {
                      dates = getQuarterDates();
                    } else if (newPeriod === "year") {
                      dates = getYearDates();
                    }
                    setFormData({
                      ...formData,
                      period_type: newPeriod,
                      start_date: dates.start,
                      end_date: dates.end,
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  <option value="quarter">Quarterly</option>
                  <option value="year">Yearly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    required
                  />
                </div>
              </div>

              {/* Comment field - only show when editing */}
              {editingGoal && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Comment (optional)
                  </label>
                  <textarea
                    value={formData.comment || ""}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    placeholder="Add a note about this change..."
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    This comment will be added to the goal&apos;s timeline
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={(isCreating || isUpdating) || !formData.title || !formData.start_date || !formData.end_date}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating || isUpdating
                    ? (editingGoal ? "Saving..." : "Creating...")
                    : (editingGoal ? "Save Changes" : "Create Goal")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Goal Detail Modal */}
      {selectedGoal && (
        <GoalDetailModal
          goal={selectedGoal}
          workspaceId={workspaceId}
          onClose={() => setSelectedGoal(null)}
        />
      )}
    </div>
  );
}

interface GoalDetailModalProps {
  goal: OKRGoal;
  workspaceId: string | null;
  onClose: () => void;
}

function GoalDetailModal({ goal, workspaceId, onClose }: GoalDetailModalProps) {
  const {
    goal: goalDetails,
    isLoading,
    updateProgress,
    isUpdatingProgress,
  } = useOKRGoal(workspaceId, goal.id);

  const { keyResults } = useOKRKeyResults(workspaceId, goal.id);

  const [newProgress, setNewProgress] = useState<number>(goal.current_value);
  const [showProgressForm, setShowProgressForm] = useState(false);

  const currentGoal = goalDetails || goal;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Not set";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleUpdateProgress = async () => {
    await updateProgress({ current_value: newProgress });
    setShowProgressForm(false);
  };

  const getStatusColor = (status: OKRGoalStatus) => {
    switch (status) {
      case "on_track": return "text-green-400";
      case "at_risk": return "text-amber-400";
      case "behind": return "text-red-400";
      case "achieved": return "text-green-400";
      default: return "text-slate-400";
    }
  };

  const getTrendIcon = () => {
    if (currentGoal.progress_percentage >= 70) return <TrendingUp className="h-5 w-5 text-green-400" />;
    if (currentGoal.progress_percentage <= 30) return <TrendingDown className="h-5 w-5 text-red-400" />;
    return <Minus className="h-5 w-5 text-slate-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-mono text-slate-400">{currentGoal.key}</span>
              <span className={`text-xs px-2 py-0.5 rounded capitalize ${getStatusColor(currentGoal.status)}`}>
                {currentGoal.status.replace("_", " ")}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-white">{currentGoal.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Progress Section */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Progress</span>
              <div className="flex items-center gap-2">
                {getTrendIcon()}
                <span className="text-xl font-bold text-white">
                  {currentGoal.progress_percentage.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full transition-all duration-300 ${
                  currentGoal.progress_percentage >= 100
                    ? "bg-green-500"
                    : currentGoal.progress_percentage >= 70
                    ? "bg-blue-500"
                    : currentGoal.progress_percentage >= 30
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${Math.min(currentGoal.progress_percentage, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">
                Current: {currentGoal.current_value} {currentGoal.unit || ""}
              </span>
              <span className="text-slate-400">
                Target: {currentGoal.target_value} {currentGoal.unit || ""}
              </span>
            </div>

            {/* Update Progress */}
            {!showProgressForm ? (
              <button
                onClick={() => setShowProgressForm(true)}
                className="mt-3 text-sm text-blue-400 hover:text-blue-300"
              >
                Update progress
              </button>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  value={newProgress}
                  onChange={(e) => setNewProgress(parseFloat(e.target.value) || 0)}
                  className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <button
                  onClick={handleUpdateProgress}
                  disabled={isUpdatingProgress}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 disabled:opacity-50"
                >
                  {isUpdatingProgress ? "..." : "Save"}
                </button>
                <button
                  onClick={() => setShowProgressForm(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          {currentGoal.description && (
            <div>
              <h4 className="text-sm font-medium text-white mb-2">Description</h4>
              <p className="text-slate-400 text-sm">{currentGoal.description}</p>
            </div>
          )}

          {/* Key Results */}
          {currentGoal.goal_type === "objective" && keyResults.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-white mb-3">
                Key Results ({keyResults.length})
              </h4>
              <div className="space-y-3">
                {keyResults.map((kr) => (
                  <KeyResultProgress
                    key={kr.id}
                    keyResult={kr}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Period and Dates */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-500 uppercase mb-1">Period</div>
              <p className="text-white capitalize">{currentGoal.period_type || "Not set"}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-500 uppercase mb-1">Start</div>
              <p className="text-white text-sm">{formatDate(currentGoal.period_start)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-500 uppercase mb-1">End</div>
              <p className="text-white text-sm">{formatDate(currentGoal.period_end)}</p>
            </div>
          </div>

          {/* Confidence */}
          {currentGoal.confidence_level > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">Confidence Level</span>
                <span className="text-white font-bold">{currentGoal.confidence_level}/10</span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded ${
                      i < currentGoal.confidence_level
                        ? currentGoal.confidence_level >= 7
                          ? "bg-green-500"
                          : currentGoal.confidence_level >= 4
                          ? "bg-amber-500"
                          : "bg-red-500"
                        : "bg-slate-700"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
            <div>
              <span className="text-xs text-slate-500">Created</span>
              <p className="text-sm text-white">{formatDate(currentGoal.created_at)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Last Updated</span>
              <p className="text-sm text-white">{formatDate(currentGoal.updated_at)}</p>
            </div>
          </div>

          {/* Timeline / Activity */}
          {workspaceId && (
            <div className="pt-4 border-t border-slate-700">
              <h4 className="text-sm font-medium text-white mb-4">Activity Timeline</h4>
              <EntityTimeline
                workspaceId={workspaceId}
                entityType="goal"
                entityId={currentGoal.id}
                showCommentInput={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
