"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  Users,
  BarChart3,
  Sparkles,
  AlertTriangle,
  Trash2,
  Copy,
  RotateCcw,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useQuestion, useQuestionSubmissions } from "@/hooks/useQuestions";

const difficultyColors: Record<string, string> = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  hard: "bg-red-100 text-red-700",
};

const typeLabels: Record<string, string> = {
  mcq: "Multiple Choice",
  coding: "Coding",
  short_answer: "Short Answer",
  essay: "Essay",
  audio: "Audio",
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function ScoreDistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((sum, v) => sum + v, 0);
  const maxValue = Math.max(...Object.values(distribution), 1);

  const colors: Record<string, string> = {
    "0-20": "bg-red-400",
    "21-40": "bg-orange-400",
    "41-60": "bg-yellow-400",
    "61-80": "bg-green-400",
    "81-100": "bg-emerald-500",
  };

  return (
    <div className="space-y-2">
      {Object.entries(distribution).map(([range, count]) => (
        <div key={range} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-14">{range}%</span>
          <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
            <div
              className={`h-full ${colors[range] || "bg-blue-400"} transition-all`}
              style={{ width: `${total > 0 ? (count / maxValue) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm text-gray-700 w-10 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}

function TimeDistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((sum, v) => sum + v, 0);
  const maxValue = Math.max(...Object.values(distribution), 1);

  const labels: Record<string, string> = {
    "0-60": "<1m",
    "61-120": "1-2m",
    "121-300": "2-5m",
    "301-600": "5-10m",
    "600+": ">10m",
  };

  return (
    <div className="space-y-2">
      {Object.entries(distribution).map(([range, count]) => (
        <div key={range} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-14">{labels[range] || range}</span>
          <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
            <div
              className="h-full bg-blue-400 transition-all"
              style={{ width: `${total > 0 ? (count / maxValue) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm text-gray-700 w-10 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}

function DifficultyCalibration({
  stated,
  calculated,
  accuracy,
}: {
  stated: string | null;
  calculated: string | null;
  accuracy: number;
}) {
  const match = stated === calculated;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">Stated Difficulty</span>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
            difficultyColors[stated || ""] || "bg-gray-100 text-gray-700"
          }`}
        >
          {stated || "N/A"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">Calculated Difficulty</span>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
            difficultyColors[calculated || ""] || "bg-gray-100 text-gray-700"
          }`}
        >
          {calculated || "N/A"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">Accuracy</span>
        <div className="flex items-center gap-2">
          {match ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
          <span className={`font-medium ${match ? "text-green-600" : "text-yellow-600"}`}>
            {(accuracy * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function QuestionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const questionId = params.questionId as string;

  const { user, isLoading: authLoading, logout } = useAuth();
  const { currentWorkspaceId, workspacesLoading } = useWorkspace();

  const [showProblem, setShowProblem] = useState(true);
  const [showSubmissions, setShowSubmissions] = useState(true);
  const [submissionsPage, setSubmissionsPage] = useState(1);
  const [candidateFilter, setCandidateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"evaluated" | "pending" | "">("");

  const {
    question,
    isLoading,
    error,
    deleteQuestion,
    restoreQuestion,
    recalculateAnalytics,
    isDeleting,
    isRestoring,
    isRecalculating,
  } = useQuestion(questionId);

  const {
    submissions,
    total: submissionsTotal,
    totalPages: submissionsTotalPages,
    isLoading: submissionsLoading,
  } = useQuestionSubmissions(questionId, {
    candidate_email: candidateFilter || undefined,
    status: statusFilter || undefined,
    page: submissionsPage,
    per_page: 10,
  });

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this question?")) return;

    try {
      await deleteQuestion({ softDelete: true });
      router.push("/hiring/questions");
    } catch (error: any) {
      if (error?.response?.status === 400) {
        if (confirm("This question has submissions. Delete anyway?")) {
          await deleteQuestion({ force: true, softDelete: true });
          router.push("/hiring/questions");
        }
      }
    }
  };

  const handleRestore = async () => {
    try {
      await restoreQuestion();
    } catch (error) {
      console.error("Failed to restore:", error);
    }
  };

  const handleRecalculate = async () => {
    try {
      await recalculateAnalytics();
    } catch (error) {
      console.error("Failed to recalculate:", error);
    }
  };

  if (authLoading || workspacesLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader user={user} logout={logout} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900">Question not found</h2>
            <Link href="/hiring/questions" className="text-blue-600 hover:text-blue-700 mt-4 inline-block">
              Back to Questions
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const analytics = question.analytics;
  const isDeleted = !!question.deleted_at;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/hiring/questions"
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Questions
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{question.title}</h1>
                {question.is_ai_generated && (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                    <Sparkles className="h-3 w-3" />
                    AI Generated
                  </span>
                )}
                {isDeleted && (
                  <span className="px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">
                    Deleted
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-sm text-gray-500">
                  {typeLabels[question.question_type] || question.question_type}
                </span>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
                    difficultyColors[question.difficulty] || "bg-gray-100 text-gray-700"
                  }`}
                >
                  {question.difficulty}
                </span>
                <span className="text-sm text-gray-500">{question.max_marks} marks</span>
                <span className="text-sm text-gray-500">{question.estimated_time_minutes} min</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                From:{" "}
                <Link
                  href={`/hiring/assessments/${question.assessment_id}/report`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {question.assessment_title}
                </Link>
                {question.topic_name && ` / ${question.topic_name}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRecalculate}
                disabled={isRecalculating}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg border"
              >
                <RefreshCw className={`h-4 w-4 ${isRecalculating ? "animate-spin" : ""}`} />
                Recalculate
              </button>
              {isDeleted ? (
                <button
                  onClick={handleRestore}
                  disabled={isRestoring}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 rounded-lg border border-green-200"
                >
                  <RotateCcw className="h-4 w-4" />
                  {isRestoring ? "Restoring..." : "Restore"}
                </button>
              ) : (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Analytics Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Attempts</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{analytics?.total_attempts || 0}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-full">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Avg Score</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {analytics?.average_score_percent.toFixed(0) || 0}%
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-full">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Avg Time</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatTime(analytics?.average_time_seconds || 0)}
                </p>
              </div>
              <div className="bg-yellow-50 p-3 rounded-full">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Completion Rate</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {analytics?.completion_rate.toFixed(0) || 0}%
                </p>
              </div>
              <div className="bg-purple-50 p-3 rounded-full">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Problem & Submissions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Problem Statement */}
            <div className="bg-white rounded-lg border shadow-sm">
              <button
                onClick={() => setShowProblem(!showProblem)}
                className="w-full flex items-center justify-between px-6 py-4 border-b"
              >
                <h2 className="text-lg font-semibold text-gray-900">Problem Statement</h2>
                {showProblem ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
              {showProblem && (
                <div className="p-6 space-y-4">
                  <div className="prose max-w-none">
                    <p className="text-gray-700 whitespace-pre-wrap">{question.problem_statement}</p>
                  </div>

                  {question.options && question.options.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Options</h4>
                      <ul className="space-y-2">
                        {question.options.map((opt, idx) => (
                          <li
                            key={idx}
                            className={`p-3 rounded-lg border ${
                              opt.is_correct ? "border-green-300 bg-green-50" : "border-gray-200"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="font-mono text-sm text-gray-500">
                                {String.fromCharCode(65 + idx)}.
                              </span>
                              <span className={opt.is_correct ? "text-green-700" : "text-gray-700"}>
                                {opt.text}
                              </span>
                              {opt.is_correct && (
                                <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {question.constraints && question.constraints.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Constraints</h4>
                      <ul className="list-disc list-inside text-sm text-gray-700">
                        {question.constraints.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {question.tags && question.tags.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Tags</h4>
                      <div className="flex flex-wrap gap-2">
                        {question.tags.map((tag, idx) => (
                          <span key={idx} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Submissions */}
            <div className="bg-white rounded-lg border shadow-sm">
              <button
                onClick={() => setShowSubmissions(!showSubmissions)}
                className="w-full flex items-center justify-between px-6 py-4 border-b"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  Submissions ({submissionsTotal})
                </h2>
                {showSubmissions ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
              {showSubmissions && (
                <div>
                  {/* Filters */}
                  <div className="px-6 py-3 border-b flex items-center gap-4">
                    <input
                      type="text"
                      placeholder="Search by email..."
                      value={candidateFilter}
                      onChange={(e) => {
                        setCandidateFilter(e.target.value);
                        setSubmissionsPage(1);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    />
                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value as "evaluated" | "pending" | "");
                        setSubmissionsPage(1);
                      }}
                      className="px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    >
                      <option value="">All Status</option>
                      <option value="evaluated">Evaluated</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  {submissionsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                    </div>
                  ) : submissions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No submissions found</div>
                  ) : (
                    <div>
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Candidate
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Score
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Time
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Submitted
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {submissions.map((sub) => (
                            <tr key={sub.submission_id} className="hover:bg-gray-50">
                              <td className="px-6 py-3">
                                <div>
                                  <p className="font-medium text-gray-900">{sub.candidate_name}</p>
                                  <p className="text-sm text-gray-500">{sub.candidate_email}</p>
                                </div>
                              </td>
                              <td className="px-6 py-3">
                                {sub.score_percent !== null ? (
                                  <span
                                    className={`font-medium ${
                                      sub.score_percent >= 70
                                        ? "text-green-600"
                                        : sub.score_percent >= 40
                                        ? "text-yellow-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {sub.score_percent.toFixed(0)}%
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-3">
                                <span className="text-sm text-gray-700">
                                  {formatTime(sub.time_taken_seconds)}
                                </span>
                              </td>
                              <td className="px-6 py-3">
                                <span
                                  className={`px-2 py-0.5 text-xs rounded-full ${
                                    sub.status === "evaluated"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-yellow-100 text-yellow-700"
                                  }`}
                                >
                                  {sub.status}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-sm text-gray-500">
                                {new Date(sub.submitted_at).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Pagination */}
                      {submissionsTotalPages > 1 && (
                        <div className="px-6 py-3 border-t flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Page {submissionsPage} of {submissionsTotalPages}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSubmissionsPage((p) => Math.max(1, p - 1))}
                              disabled={submissionsPage === 1}
                              className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-50"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setSubmissionsPage((p) => Math.min(submissionsTotalPages, p + 1))}
                              disabled={submissionsPage === submissionsTotalPages}
                              className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-50"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Analytics */}
          <div className="space-y-6">
            {/* Score Distribution */}
            <div className="bg-white rounded-lg border shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Score Distribution</h3>
              {analytics?.score_distribution ? (
                <ScoreDistributionChart distribution={analytics.score_distribution} />
              ) : (
                <p className="text-sm text-gray-500">No data available</p>
              )}
            </div>

            {/* Time Distribution */}
            <div className="bg-white rounded-lg border shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Time Distribution</h3>
              {analytics?.time_distribution ? (
                <TimeDistributionChart distribution={analytics.time_distribution} />
              ) : (
                <p className="text-sm text-gray-500">No data available</p>
              )}
            </div>

            {/* Difficulty Calibration */}
            <div className="bg-white rounded-lg border shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Difficulty Calibration</h3>
              {analytics ? (
                <DifficultyCalibration
                  stated={analytics.stated_difficulty}
                  calculated={analytics.calculated_difficulty}
                  accuracy={analytics.difficulty_accuracy}
                />
              ) : (
                <p className="text-sm text-gray-500">No data available</p>
              )}
            </div>

            {/* Additional Metrics */}
            <div className="bg-white rounded-lg border shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Quality Indicators</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Skip Rate</span>
                  <span className="font-medium text-gray-900">{analytics?.skip_rate.toFixed(1) || 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Partial Credit Rate</span>
                  <span className="font-medium text-gray-900">
                    {analytics?.partial_credit_rate.toFixed(1) || 0}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Median Score</span>
                  <span className="font-medium text-gray-900">
                    {analytics?.median_score_percent.toFixed(0) || 0}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Median Time</span>
                  <span className="font-medium text-gray-900">
                    {formatTime(analytics?.median_time_seconds || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* MCQ Option Distribution */}
            {analytics?.option_selection_distribution && (
              <div className="bg-white rounded-lg border shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Option Selection</h3>
                <div className="space-y-2">
                  {Object.entries(analytics.option_selection_distribution).map(([opt, count]) => (
                    <div key={opt} className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Option {opt}</span>
                      <span className="font-medium text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Test Case Pass Rates */}
            {analytics?.test_case_pass_rates && analytics.test_case_pass_rates.length > 0 && (
              <div className="bg-white rounded-lg border shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Test Case Pass Rates</h3>
                <div className="space-y-2">
                  {analytics.test_case_pass_rates.map((tc) => (
                    <div key={tc.test_id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 w-20">Test {tc.test_id}</span>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${tc.pass_rate >= 0.7 ? "bg-green-500" : "bg-red-400"}`}
                          style={{ width: `${tc.pass_rate * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-700">{(tc.pass_rate * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
