"use client";

import { useState, useCallback } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useQuestionnaires, useQuestionnaire } from "@/hooks/useQuestionnaires";
import { useReminderSuggestions } from "@/hooks/useReminders";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Check,
  X,
  Trash2,
  RotateCcw,
  ClipboardList,
  BarChart3,
  FileSearch,
  ExternalLink,
} from "lucide-react";
import {
  QuestionnaireResponse,
  QuestionnaireQuestion,
  ReminderSuggestion,
} from "@/lib/api";

type View = "list" | "detail";

export default function ComplianceCenterPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    questionnaires,
    isLoading,
    deleteQuestionnaire,
    isDeleting,
  } = useQuestionnaires(workspaceId);

  const handleSelectQuestionnaire = useCallback((id: string) => {
    setSelectedId(id);
    setView("detail");
  }, []);

  const handleBack = useCallback(() => {
    setView("list");
    setSelectedId(null);
  }, []);

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {view === "list" ? (
        <QuestionnaireListView
          questionnaires={questionnaires}
          isLoading={isLoading}
          onSelect={handleSelectQuestionnaire}
          onDelete={deleteQuestionnaire}
          isDeleting={isDeleting}
        />
      ) : (
        <QuestionnaireDetailView
          workspaceId={workspaceId}
          questionnaireId={selectedId!}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

// ============ List View ============

function QuestionnaireListView({
  questionnaires,
  isLoading,
  onSelect,
  onDelete,
  isDeleting,
}: {
  questionnaires: QuestionnaireResponse[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Compute stats
  const totalQuestionnaires = questionnaires.length;
  const totalQuestions = questionnaires.reduce((sum, q) => sum + q.total_questions, 0);
  const totalSuggestions = questionnaires.reduce((sum, q) => sum + q.total_suggestions_generated, 0);
  const analyzedCount = questionnaires.filter((q) => q.status === "analyzed" || q.status === "reviewed").length;

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this questionnaire? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  const statusBadge = (status: QuestionnaireResponse["status"]) => {
    const styles = {
      uploaded: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      analyzed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      reviewed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Compliance Center
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage imported questionnaires, track questions, and review suggestions
          </p>
        </div>
        <Link
          href="/compliance/reminders/import"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          Import Questionnaire
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <FileSpreadsheet className="h-4 w-4" />
            <span>Questionnaires</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {totalQuestionnaires}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <ClipboardList className="h-4 w-4" />
            <span>Total Questions</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {totalQuestions}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Sparkles className="h-4 w-4" />
            <span>Suggestions Generated</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {totalSuggestions}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <BarChart3 className="h-4 w-4" />
            <span>Analyzed</span>
          </div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {analyzedCount} / {totalQuestionnaires}
          </div>
        </div>
      </div>

      {/* Questionnaire List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      ) : questionnaires.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <FileSearch className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No questionnaires imported yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Import a compliance questionnaire to get started with automated tracking
          </p>
          <Link
            href="/compliance/reminders/import"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Upload className="h-4 w-4" />
            Import Your First Questionnaire
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {questionnaires.map((q) => (
              <button
                key={q.id}
                onClick={() => onSelect(q.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {q.title}
                    </h3>
                    {statusBadge(q.status)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    {q.partner_name && <span>Partner: {q.partner_name}</span>}
                    {q.assessment_year && <span>Year: {q.assessment_year}</span>}
                    <span>{q.total_questions} questions</span>
                    <span>{q.total_suggestions_generated} suggestions</span>
                    <span>{q.source_filename}</span>
                    <span>{new Date(q.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <button
                    onClick={(e) => handleDelete(e, q.id)}
                    disabled={isDeleting && deletingId === q.id}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                    title="Delete questionnaire"
                  >
                    {isDeleting && deletingId === q.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                  <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ============ Detail View ============

function QuestionnaireDetailView({
  workspaceId,
  questionnaireId,
  onBack,
}: {
  workspaceId: string;
  questionnaireId: string;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"questions" | "suggestions">("questions");

  const {
    questionnaire,
    questions,
    isLoading,
    questionsLoading,
    analyzeQuestionnaire,
    isAnalyzing,
  } = useQuestionnaire(workspaceId, questionnaireId);

  const {
    suggestions,
    pendingSuggestions,
    isLoading: suggestionsLoading,
    acceptSuggestion,
    rejectSuggestion,
    isAccepting,
    isRejecting,
  } = useReminderSuggestions(workspaceId, questionnaireId);

  const handleReAnalyze = useCallback(async () => {
    try {
      await analyzeQuestionnaire();
    } catch {
      // Error handled by hook
    }
  }, [analyzeQuestionnaire]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!questionnaire) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 dark:text-gray-400">Questionnaire not found.</p>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:text-blue-700 text-sm">
          Back to list
        </button>
      </div>
    );
  }

  const statusBadge = (status: QuestionnaireResponse["status"]) => {
    const styles = {
      uploaded: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      analyzed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      reviewed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    };
    return (
      <span className={`px-2.5 py-1 rounded text-xs font-medium ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const acceptedCount = suggestions.filter((s) => s.status === "accepted").length;
  const rejectedCount = suggestions.filter((s) => s.status === "rejected").length;

  return (
    <>
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Compliance Center
      </button>

      {/* Questionnaire Header Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {questionnaire.title}
              </h1>
              {statusBadge(questionnaire.status)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
              {questionnaire.partner_name && (
                <span>Partner: <strong>{questionnaire.partner_name}</strong></span>
              )}
              {questionnaire.assessment_year && (
                <span>Year: <strong>{questionnaire.assessment_year}</strong></span>
              )}
              <span>File: {questionnaire.source_filename}</span>
              <span>Imported: {new Date(questionnaire.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex gap-4 mt-3 text-sm">
              <span className="text-gray-600 dark:text-gray-300">
                <strong>{questionnaire.total_questions}</strong> questions
              </span>
              <span className="text-gray-600 dark:text-gray-300">
                <strong>{questionnaire.total_suggestions_generated}</strong> suggestions
              </span>
              {acceptedCount > 0 && (
                <span className="text-green-600 dark:text-green-400">
                  <strong>{acceptedCount}</strong> accepted
                </span>
              )}
              {rejectedCount > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  <strong>{rejectedCount}</strong> rejected
                </span>
              )}
              {pendingSuggestions.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  <strong>{pendingSuggestions.length}</strong> pending
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleReAnalyze}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Re-analyze
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("questions")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "questions"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Questions ({questions.filter((q) => !q.is_section_header).length})
          </button>
          <button
            onClick={() => setActiveTab("suggestions")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "suggestions"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Suggestions ({suggestions.length})
            {pendingSuggestions.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {pendingSuggestions.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "questions" && (
        questionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No questions found for this questionnaire.
          </div>
        ) : (
          <QuestionsGrouped questions={questions} />
        )
      )}

      {activeTab === "suggestions" && (
        suggestionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No suggestions yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Run analysis to generate compliance tracking suggestions
            </p>
            <button
              onClick={handleReAnalyze}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate Suggestions
            </button>
          </div>
        ) : (
          <SuggestionsList
            suggestions={suggestions}
            pendingSuggestions={pendingSuggestions}
            onAccept={async (id) => {
              await acceptSuggestion({ suggestionId: id });
            }}
            onReject={async (id) => {
              await rejectSuggestion(id);
            }}
            isAccepting={isAccepting}
            isRejecting={isRejecting}
          />
        )
      )}
    </>
  );
}

// ============ Questions Grouped by Domain ============

function QuestionsGrouped({ questions }: { questions: QuestionnaireQuestion[] }) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());

  const grouped: Record<string, QuestionnaireQuestion[]> = {};
  for (const q of questions) {
    if (q.is_section_header) continue;
    const domain = q.domain || "Uncategorized";
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(q);
  }

  const toggleDomain = (domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const responseTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      yes_no: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      frequency: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
      multi_choice: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      text: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type] || colors.text}`}>
        {type.replace("_", "/")}
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {Object.entries(grouped).map(([domain, domainQuestions]) => (
          <div key={domain}>
            <button
              onClick={() => toggleDomain(domain)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
            >
              <div className="flex items-center gap-2">
                {expandedDomains.has(domain) ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {domain}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({domainQuestions.length})
                </span>
              </div>
            </button>
            {expandedDomains.has(domain) && (
              <div className="pb-2">
                {domainQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="px-6 py-2 flex items-start gap-3 text-sm"
                  >
                    <span className="text-gray-400 dark:text-gray-500 w-8 flex-shrink-0 text-right">
                      {q.serial_number || "—"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 dark:text-gray-300 leading-snug">
                        {q.question_text}
                      </p>
                      {q.response_text && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Response: <span className="font-medium">{q.response_text}</span>
                        </p>
                      )}
                    </div>
                    {responseTypeBadge(q.response_type)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ Suggestions List ============

function SuggestionsList({
  suggestions,
  pendingSuggestions,
  onAccept,
  onReject,
  isAccepting,
  isRejecting,
}: {
  suggestions: ReminderSuggestion[];
  pendingSuggestions: ReminderSuggestion[];
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  isAccepting: boolean;
  isRejecting: boolean;
}) {
  const accepted = suggestions.filter((s) => s.status === "accepted");
  const rejected = suggestions.filter((s) => s.status === "rejected");

  const frequencyLabel: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "Bi-weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
  };

  const confidenceColor = (score: number) =>
    score >= 0.8
      ? "text-green-600"
      : score >= 0.6
      ? "text-amber-600"
      : "text-gray-500";

  return (
    <div className="space-y-6">
      {/* Pending */}
      {pendingSuggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Pending Review ({pendingSuggestions.length})
          </h3>
          <div className="space-y-3">
            {pendingSuggestions.map((s) => (
              <div
                key={s.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white leading-snug">
                      {s.suggested_title}
                    </h4>
                    {s.suggested_description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {s.suggested_description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {frequencyLabel[s.suggested_frequency] || s.suggested_frequency}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {s.suggested_category}
                      </span>
                      <span className={`text-xs font-medium ${confidenceColor(s.confidence_score)}`}>
                        {Math.round(s.confidence_score * 100)}% confidence
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => onReject(s.id)}
                      disabled={isRejecting}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="Reject"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onAccept(s.id)}
                      disabled={isAccepting}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="Accept"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted */}
      {accepted.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Accepted ({accepted.length})
          </h3>
          <div className="space-y-2">
            {accepted.map((s) => (
              <div
                key={s.id}
                className="bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800 p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {s.suggested_title}
                    </p>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {frequencyLabel[s.suggested_frequency] || s.suggested_frequency}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {s.suggested_category}
                      </span>
                    </div>
                  </div>
                </div>
                {s.reminder_id && (
                  <Link
                    href={`/compliance/reminders/${s.reminder_id}`}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 flex-shrink-0 ml-3"
                  >
                    View Reminder
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rejected */}
      {rejected.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Rejected ({rejected.length})
          </h3>
          <div className="space-y-2">
            {rejected.map((s) => (
              <div
                key={s.id}
                className="bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3 opacity-60"
              >
                <XCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {s.suggested_title}
                  </p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {s.suggested_category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
