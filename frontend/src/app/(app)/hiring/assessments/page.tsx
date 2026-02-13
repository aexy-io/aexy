"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Users,
  FileText,
  Clock,
  TrendingUp,
  Edit,
  Trash2,
  Copy,
  Eye,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAssessments, useOrganizationAssessmentMetrics } from "@/hooks/useAssessments";
import { AssessmentStatus, AssessmentSummary } from "@/lib/api";

const statusColors: Record<AssessmentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/20 text-success",
  completed: "bg-info/20 text-info",
  archived: "bg-muted text-muted-foreground/60",
};

const statusLabels: Record<AssessmentStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: { value: number; isPositive: boolean };
}) {
  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          {trend && (
            <p
              className={`text-sm mt-1 ${
                trend.isPositive ? "text-success" : "text-destructive"
              }`}
            >
              {trend.isPositive ? "+" : "-"}
              {Math.abs(trend.value)}% from last month
            </p>
          )}
        </div>
        <div className="bg-primary/10 p-3 rounded-full">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </div>
  );
}

function AssessmentCard({
  assessment,
  onEdit,
  onDelete,
  onViewReport,
  onClone,
}: {
  assessment: AssessmentSummary;
  onEdit: () => void;
  onDelete: () => void;
  onViewReport: () => void;
  onClone: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="bg-card rounded-lg border border-border hover:border-border-strong transition-colors">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">
                {assessment.title}
              </h3>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  statusColors[assessment.status]
                }`}
              >
                {statusLabels[assessment.status]}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {assessment.job_designation}
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-accent rounded"
            >
              <MoreVertical className="h-5 w-5 text-muted-foreground" />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-popover rounded-md shadow-lg border border-border py-1 z-10">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onEdit();
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-popover-foreground hover:bg-accent"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onViewReport();
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-popover-foreground hover:bg-accent"
                >
                  <BarChart3 className="h-4 w-4" />
                  View Report
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onClone();
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-popover-foreground hover:bg-accent"
                >
                  <Copy className="h-4 w-4" />
                  Clone
                </button>
                {assessment.status === "draft" && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete();
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div>
            <p className="text-xs text-muted-foreground">Questions</p>
            <p className="text-lg font-semibold text-foreground">
              {assessment.total_questions}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-lg font-semibold text-foreground">
              {assessment.total_duration_minutes} min
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Candidates</p>
            <p className="text-lg font-semibold text-foreground">
              {assessment.completed_candidates}/{assessment.total_candidates}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Score</p>
            <p className="text-lg font-semibold text-foreground">
              {assessment.average_score !== null
                ? `${assessment.average_score}%`
                : "-"}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Created {new Date(assessment.created_at).toLocaleDateString()}
          </p>
          {assessment.status === "draft" ? (
            <Link
              href={`/hiring/assessments/${assessment.id}/edit`}
              className="text-sm font-medium text-primary hover:text-primary/80"
            >
              Continue Editing
            </Link>
          ) : (
            <Link
              href={`/hiring/assessments/${assessment.id}/report`}
              className="text-sm font-medium text-primary hover:text-primary/80"
            >
              View Details
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AssessmentsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();
  const { currentWorkspaceId, workspacesLoading } = useWorkspace();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssessmentStatus | "">("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAssessmentTitle, setNewAssessmentTitle] = useState("");

  const {
    assessments,
    total,
    isLoading,
    createAssessment,
    deleteAssessment,
    cloneAssessment,
    isCreating,
    isDeleting,
    isCloning,
  } = useAssessments(currentWorkspaceId, {
    status: statusFilter || undefined,
    search: searchQuery || undefined,
  });

  const { metrics } = useOrganizationAssessmentMetrics(currentWorkspaceId);

  const handleCreateAssessment = async () => {
    if (!newAssessmentTitle.trim()) return;

    try {
      const assessment = await createAssessment({
        title: newAssessmentTitle.trim(),
      });
      setShowCreateModal(false);
      setNewAssessmentTitle("");
      router.push(`/hiring/assessments/${assessment.id}/edit`);
    } catch (error) {
      console.error("Failed to create assessment:", error);
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    if (!confirm("Are you sure you want to delete this assessment?")) return;

    try {
      await deleteAssessment(assessmentId);
    } catch (error) {
      console.error("Failed to delete assessment:", error);
    }
  };

  const handleCloneAssessment = async (assessmentId: string) => {
    try {
      const cloned = await cloneAssessment({ assessmentId });
      router.push(`/hiring/assessments/${cloned.id}/edit`);
    } catch (error) {
      console.error("Failed to clone assessment:", error);
    }
  };

  if (authLoading || workspacesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Assessments</h1>
            <p className="text-muted-foreground mt-1">
              Create and manage technical assessments for candidates
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Create Assessment
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Total Candidates"
            value={metrics?.total_candidates || 0}
            icon={Users}
          />
          <MetricCard
            title="Total Tests"
            value={metrics?.total_tests || 0}
            icon={FileText}
          />
          <MetricCard
            title="Unique Attempts"
            value={metrics?.unique_attempts || 0}
            icon={Clock}
          />
          <MetricCard
            title="Attempt Rate"
            value={`${metrics?.attempt_rate || 0}%`}
            icon={TrendingUp}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search assessments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AssessmentStatus | "")}
              className="appearance-none pl-4 pr-10 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground"
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
            <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Assessment List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : assessments.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-lg border border-border">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No assessments yet
            </h3>
            <p className="text-muted-foreground mb-4">
              Create your first assessment to start evaluating candidates
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              <Plus className="h-5 w-5" />
              Create Assessment
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {assessments.map((assessment) => (
              <AssessmentCard
                key={assessment.id}
                assessment={assessment}
                onEdit={() => router.push(`/hiring/assessments/${assessment.id}/edit`)}
                onDelete={() => handleDeleteAssessment(assessment.id)}
                onViewReport={() => router.push(`/hiring/assessments/${assessment.id}/report`)}
                onClone={() => handleCloneAssessment(assessment.id)}
              />
            ))}
          </div>
        )}

        {/* Pagination info */}
        {total > 0 && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Showing {assessments.length} of {total} assessments
          </div>
        )}
      </main>

      {/* Create Assessment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-xl border border-border w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              Create New Assessment
            </h2>
            <div className="mb-4">
              <label
                htmlFor="title"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                Assessment Title
              </label>
              <input
                id="title"
                type="text"
                placeholder="e.g., Senior Software Engineer Assessment"
                value={newAssessmentTitle}
                onChange={(e) => setNewAssessmentTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateAssessment();
                }}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewAssessmentTitle("");
                }}
                className="px-4 py-2 text-muted-foreground hover:bg-accent rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAssessment}
                disabled={!newAssessmentTitle.trim() || isCreating}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
