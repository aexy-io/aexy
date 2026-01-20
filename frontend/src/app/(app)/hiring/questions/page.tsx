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
  easy: "bg-green-900/30 text-green-400",
  medium: "bg-yellow-900/30 text-yellow-400",
  hard: "bg-red-900/30 text-red-400",
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
    <tr className={`border-b border-slate-700 hover:bg-slate-700/50 ${isDeleted ? "bg-slate-800/50 opacity-60" : ""}`}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
          className="rounded border-slate-600 bg-slate-700"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-900/30 rounded flex items-center justify-center text-xs font-mono text-blue-400">
            {typeIcons[question.question_type] || "?"}
          </div>
          <div>
            <p className="font-medium text-white line-clamp-1">{question.title}</p>
            <p className="text-sm text-slate-400">
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
            <span className="px-2 py-0.5 text-xs bg-red-900/30 text-red-400 rounded">Deleted</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-slate-300">
          {typeLabels[question.question_type] || question.question_type}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
            difficultyColors[question.difficulty] || "bg-slate-700 text-slate-300"
          }`}
        >
          {question.difficulty}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm text-slate-300">{question.total_attempts}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {question.total_attempts > 0 ? (
            <>
              <span className="text-sm font-medium text-white">
                {question.average_score_percent.toFixed(0)}%
              </span>
              <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    question.average_score_percent >= 70
                      ? "bg-green-500"
                      : question.average_score_percent >= 40
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${question.average_score_percent}%` }}
                />
              </div>
            </>
          ) : (
            <span className="text-sm text-slate-500">-</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {question.total_attempts > 0 ? (
          <span className="text-sm text-slate-300">{formatTime(question.average_time_seconds)}</span>
        ) : (
          <span className="text-sm text-slate-500">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-slate-700 rounded"
          >
            <MoreVertical className="h-5 w-5 text-slate-400" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-slate-800 rounded-md shadow-lg border border-slate-700 py-1 z-10">
              <button
                onClick={() => {
                  setShowMenu(false);
                  onView();
                }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
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
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete();
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-400 hover:bg-red-900/20"
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
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-green-400 hover:bg-green-900/20"
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Question Bank</h1>
            <p className="text-slate-400 mt-1">
              View and manage all assessment questions across your organization
            </p>
          </div>
          <Link
            href="/hiring/assessments"
            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            Back to Assessments
          </Link>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Total Questions</p>
                <p className="text-2xl font-bold text-white mt-1">{metrics.total}</p>
              </div>
              <div className="bg-blue-900/30 p-3 rounded-full">
                <FileText className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Avg Score</p>
                <p className="text-2xl font-bold text-white mt-1">{metrics.avgScore.toFixed(0)}%</p>
              </div>
              <div className="bg-green-900/30 p-3 rounded-full">
                <TrendingUp className="h-5 w-5 text-green-400" />
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Avg Time</p>
                <p className="text-2xl font-bold text-white mt-1">{formatTime(Math.round(metrics.avgTime))}</p>
              </div>
              <div className="bg-yellow-900/30 p-3 rounded-full">
                <Clock className="h-5 w-5 text-yellow-400" />
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">AI Generated</p>
                <p className="text-2xl font-bold text-white mt-1">{metrics.aiGenerated}</p>
              </div>
              <div className="bg-purple-900/30 p-3 rounded-full">
                <Sparkles className="h-5 w-5 text-purple-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 mb-6">
          <div className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search questions..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-700 text-white placeholder-slate-400"
              />
            </div>
            <select
              value={assessmentFilter}
              onChange={(e) => {
                setAssessmentFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-700 text-white"
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
              className="px-4 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-700 text-white"
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
              className="px-4 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-700 text-white"
            >
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => {
                  setShowDeleted(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-600 bg-slate-700"
              />
              Show Deleted
            </label>
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="px-4 py-3 bg-blue-900/20 border-t border-slate-700 flex items-center justify-between">
              <span className="text-sm text-blue-400">
                {selectedIds.size} question{selectedIds.size > 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1 text-sm text-slate-400 hover:bg-slate-700 rounded"
                >
                  Clear
                </button>
                <button
                  onClick={() => handleBulkDelete(false)}
                  disabled={isBulkDeleting}
                  className="px-3 py-1 text-sm text-red-400 hover:bg-red-900/20 rounded flex items-center gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Questions Table */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No questions found</h3>
              <p className="text-slate-400 mb-4">
                {searchQuery || typeFilter || difficultyFilter || assessmentFilter
                  ? "Try adjusting your filters"
                  : "Create an assessment to add questions"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-900/50 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-700"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Question
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Difficulty
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Attempts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Avg Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Avg Time
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
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
            <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
              <span className="text-sm text-slate-400">
                Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, total)} of {total} questions
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border border-slate-600 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-slate-300">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 border border-slate-600 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300"
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
          <div className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-yellow-900/30 p-2 rounded-full">
                <AlertTriangle className="h-6 w-6 text-yellow-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Question Has Submissions</h2>
            </div>
            <p className="text-slate-400 mb-6">
              This question has existing submissions from candidates. Deleting it will affect their assessment records.
              Are you sure you want to proceed?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 text-slate-400 hover:bg-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteTarget && handleDelete(deleteTarget, true)}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
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
