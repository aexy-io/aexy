"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Filter,
  MoreVertical,
  FileText,
  Clock,
  TrendingUp,
  Trash2,
  Copy,
  Eye,
  BarChart3,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useQuestions } from "@/hooks/useQuestions";
import { useAssessments } from "@/hooks/useAssessments";
import { QuestionListItem } from "@/lib/api";

const difficultyColors: Record<string, string> = {
  easy: "bg-success/20 text-success",
  medium: "bg-warning/20 text-warning",
  hard: "bg-destructive/20 text-destructive",
};

const typeLabels: Record<string, string> = {
  mcq: "Multiple Choice",
  coding: "Coding",
  short_answer: "Short Answer",
  essay: "Essay",
  audio: "Audio",
};

const typeIcons: Record<string, string> = {
  mcq: "A",
  coding: "</>",
  short_answer: "Aa",
  essay: "T",
  audio: "mic",
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function QuestionRow({
  question,
  isSelected,
  onSelect,
  onView,
  onDelete,
  onDuplicate,
  onRestore,
}: {
  question: QuestionListItem;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onView: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRestore: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const isDeleted = !!question.deleted_at;

  return (
    <tr className={`border-b border-border hover:bg-accent/50 ${isDeleted ? "bg-muted/50 opacity-60" : ""}`}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
          className="rounded border-border bg-input"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/20 rounded flex items-center justify-center text-xs font-mono text-primary">
            {typeIcons[question.question_type] || "?"}
          </div>
          <div>
            <p className="font-medium text-foreground line-clamp-1">{question.title}</p>
            <p className="text-sm text-muted-foreground">
              {question.assessment_title}
              {question.topic_name && ` / ${question.topic_name}`}
            </p>
          </div>
          {question.is_ai_generated && (
            <span title="AI Generated">
              <Sparkles className="h-4 w-4 text-purple-400" />
            </span>
          )}
          {isDeleted && (
            <span className="px-2 py-0.5 text-xs bg-destructive/20 text-destructive rounded">Deleted</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-foreground/80">
          {typeLabels[question.question_type] || question.question_type}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
            difficultyColors[question.difficulty] || "bg-muted text-muted-foreground"
          }`}
        >
          {question.difficulty}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm text-foreground/80">{question.total_attempts}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {question.total_attempts > 0 ? (
            <>
              <span className="text-sm font-medium text-foreground">
                {question.average_score_percent.toFixed(0)}%
              </span>
              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    question.average_score_percent >= 70
                      ? "bg-success"
                      : question.average_score_percent >= 40
                      ? "bg-warning"
                      : "bg-destructive"
                  }`}
                  style={{ width: `${question.average_score_percent}%` }}
                />
              </div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {question.total_attempts > 0 ? (
          <span className="text-sm text-foreground/80">{formatTime(question.average_time_seconds)}</span>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-4 py-3">
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
                  onView();
                }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-popover-foreground hover:bg-accent"
              >
                <Eye className="h-4 w-4" />
                View Details
              </button>
              {!isDeleted && (
                <>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDuplicate();
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-popover-foreground hover:bg-accent"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
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
                </>
              )}
              {isDeleted && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onRestore();
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-success hover:bg-success/10"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function QuestionsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout } = useAuth();
  const { currentWorkspaceId, workspacesLoading } = useWorkspace();

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [assessmentFilter, setAssessmentFilter] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Fetch assessments for the filter dropdown
  const { assessments } = useAssessments(currentWorkspaceId);

  const {
    questions,
    total,
    totalPages,
    isLoading,
    deleteQuestion,
    bulkDeleteQuestions,
    restoreQuestion,
    duplicateQuestion,
    isDeleting,
    isBulkDeleting,
  } = useQuestions({
    organization_id: currentWorkspaceId || "",
    assessment_id: assessmentFilter || undefined,
    question_type: typeFilter || undefined,
    difficulty: difficultyFilter || undefined,
    search: searchQuery || undefined,
    include_deleted: showDeleted,
    page,
    per_page: 20,
  });

  const allSelected = questions.length > 0 && selectedIds.size === questions.length;

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedIds(new Set(questions.map((q) => q.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelect = (id: string, selected: boolean) => {
    const newSet = new Set(selectedIds);
    if (selected) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleDelete = async (questionId: string, force = false) => {
    try {
      await deleteQuestion({ questionId, force, softDelete: true });
      setDeleteTarget(null);
      setShowDeleteModal(false);
    } catch (error: any) {
      if (error?.response?.status === 400 && !force) {
        setDeleteTarget(questionId);
        setShowDeleteModal(true);
      } else {
        console.error("Failed to delete question:", error);
      }
    }
  };

  const handleBulkDelete = async (force = false) => {
    try {
      await bulkDeleteQuestions({
        questionIds: Array.from(selectedIds),
        force,
        softDelete: true,
      });
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Failed to bulk delete:", error);
    }
  };

  const handleRestore = async (questionId: string) => {
    try {
      await restoreQuestion(questionId);
    } catch (error) {
      console.error("Failed to restore question:", error);
    }
  };

  const handleDuplicate = async (questionId: string) => {
    try {
      const result = await duplicateQuestion({ questionId });
      router.push(`/hiring/questions/${result.id}`);
    } catch (error) {
      console.error("Failed to duplicate question:", error);
    }
  };

  // Summary metrics
  const metrics = useMemo(() => {
    const withAttempts = questions.filter((q) => q.total_attempts > 0);
    const avgScore = withAttempts.length > 0
      ? withAttempts.reduce((sum, q) => sum + q.average_score_percent, 0) / withAttempts.length
      : 0;
    const avgTime = withAttempts.length > 0
      ? withAttempts.reduce((sum, q) => sum + q.average_time_seconds, 0) / withAttempts.length
      : 0;
    const aiGenerated = questions.filter((q) => q.is_ai_generated).length;

    return {
      total,
      avgScore,
      avgTime,
      aiGenerated,
    };
  }, [questions, total]);

  if (authLoading || workspacesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Question Bank</h1>
            <p className="text-muted-foreground mt-1">
              View and manage all assessment questions across your organization
            </p>
          </div>
          <Link
            href="/hiring/assessments"
            className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
          >
            Back to Assessments
          </Link>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Questions</p>
                <p className="text-2xl font-bold text-foreground mt-1">{metrics.total}</p>
              </div>
              <div className="bg-primary/10 p-3 rounded-full">
                <FileText className="h-5 w-5 text-primary" />
              </div>
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Score</p>
                <p className="text-2xl font-bold text-foreground mt-1">{metrics.avgScore.toFixed(0)}%</p>
              </div>
              <div className="bg-success/10 p-3 rounded-full">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Time</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatTime(Math.round(metrics.avgTime))}</p>
              </div>
              <div className="bg-warning/10 p-3 rounded-full">
                <Clock className="h-5 w-5 text-warning" />
              </div>
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">AI Generated</p>
                <p className="text-2xl font-bold text-foreground mt-1">{metrics.aiGenerated}</p>
              </div>
              <div className="bg-purple-500/10 p-3 rounded-full">
                <Sparkles className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border mb-6">
          <div className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search questions..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <select
              value={assessmentFilter}
              onChange={(e) => {
                setAssessmentFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground"
            >
              <option value="">All Assessments</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground"
            >
              <option value="">All Types</option>
              <option value="mcq">Multiple Choice</option>
              <option value="coding">Coding</option>
              <option value="short_answer">Short Answer</option>
              <option value="essay">Essay</option>
              <option value="audio">Audio</option>
            </select>
            <select
              value={difficultyFilter}
              onChange={(e) => {
                setDifficultyFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground"
            >
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => {
                  setShowDeleted(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-border bg-input"
              />
              Show Deleted
            </label>
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="px-4 py-3 bg-primary/10 border-t border-border flex items-center justify-between">
              <span className="text-sm text-primary">
                {selectedIds.size} question{selectedIds.size > 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1 text-sm text-muted-foreground hover:bg-accent rounded"
                >
                  Clear
                </button>
                <button
                  onClick={() => handleBulkDelete(false)}
                  disabled={isBulkDeleting}
                  className="px-3 py-1 text-sm text-destructive hover:bg-destructive/10 rounded flex items-center gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Questions Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No questions found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || typeFilter || difficultyFilter || assessmentFilter
                  ? "Try adjusting your filters"
                  : "Create an assessment to add questions"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-border bg-input"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Question
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Difficulty
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Attempts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Avg Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Avg Time
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {questions.map((question) => (
                  <QuestionRow
                    key={question.id}
                    question={question}
                    isSelected={selectedIds.has(question.id)}
                    onSelect={(selected) => handleSelect(question.id, selected)}
                    onView={() => router.push(`/hiring/questions/${question.id}`)}
                    onDelete={() => handleDelete(question.id)}
                    onDuplicate={() => handleDuplicate(question.id)}
                    onRestore={() => handleRestore(question.id)}
                  />
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, total)} of {total} questions
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border border-border rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-foreground/80"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-foreground/80">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 border border-border rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-foreground/80"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-xl border border-border w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-warning/10 p-2 rounded-full">
                <AlertTriangle className="h-6 w-6 text-warning" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Question Has Submissions</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              This question has existing submissions from candidates. Deleting it will affect their assessment records.
              Are you sure you want to proceed?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 text-muted-foreground hover:bg-accent rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteTarget && handleDelete(deleteTarget, true)}
                disabled={isDeleting}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
