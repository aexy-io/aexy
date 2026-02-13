"use client";

import { useState, useCallback } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useQuestionnaires, useQuestionnaire } from "@/hooks/useQuestionnaires";
import { useReminderSuggestions } from "@/hooks/useReminders";
import Link from "next/link";
import {
  Upload,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Sparkles,
  Check,
  X,
} from "lucide-react";
import {
  QuestionnaireImportResult,
  QuestionnaireQuestion,
  ReminderSuggestion,
  SkippedDuplicate,
} from "@/lib/api";

type Step = "upload" | "preview" | "analyze";

export default function ImportQuestionnairePage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [step, setStep] = useState<Step>("upload");
  const [importResult, setImportResult] = useState<QuestionnaireImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { questionnaires, uploadQuestionnaire, isUploading } = useQuestionnaires(workspaceId);

  const questionnaireId = importResult?.questionnaire.id || null;

  const {
    questionnaire,
    questions,
    questionsLoading,
    analyzeQuestionnaire,
    isAnalyzing,
    analyzeResult,
  } = useQuestionnaire(workspaceId, questionnaireId);

  const {
    suggestions,
    pendingSuggestions,
    isLoading: suggestionsLoading,
    acceptSuggestion,
    rejectSuggestion,
    isAccepting,
    isRejecting,
  } = useReminderSuggestions(workspaceId, questionnaireId || undefined);

  const handleFile = useCallback(
    async (file: File) => {
      if (!workspaceId) return;

      setUploadError(null);

      // Validate extension
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["xlsx", "xls"].includes(ext)) {
        setUploadError("Please upload an Excel file (.xlsx or .xls)");
        return;
      }

      // Validate size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setUploadError("File is too large. Maximum size is 10MB.");
        return;
      }

      try {
        const result = await uploadQuestionnaire(file);
        setImportResult(result);
        setStep("preview");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setUploadError(message);
      }
    },
    [workspaceId, uploadQuestionnaire]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!questionnaireId) return;
    try {
      await analyzeQuestionnaire();
      setStep("analyze");
    } catch {
      // Error is handled by the hook
    }
  }, [questionnaireId, analyzeQuestionnaire]);

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/compliance/reminders"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reminders
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Import Questionnaire
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Upload a compliance questionnaire to auto-generate tracking reminders
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(["upload", "preview", "analyze"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && (
              <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
            )}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                step === s
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : (["upload", "preview", "analyze"].indexOf(step) > i)
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-current/10 flex items-center justify-center text-xs">
                {["upload", "preview", "analyze"].indexOf(step) > i ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </span>
              {s === "upload" ? "Upload" : s === "preview" ? "Preview" : "Generate"}
            </div>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            dragActive
              ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
          }`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                Parsing questionnaire...
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Extracting questions and metadata from your file
              </p>
            </div>
          ) : (
            <>
              <FileSpreadsheet className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Drop your questionnaire here
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                or click to browse. Supports .xlsx and .xls files (max 10MB)
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer">
                <Upload className="h-4 w-4" />
                Choose File
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>
            </>
          )}

          {uploadError && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {uploadError}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && importResult && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {importResult.questionnaire.title}
                </h2>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {importResult.questionnaire.partner_name && (
                    <span>Partner: {importResult.questionnaire.partner_name}</span>
                  )}
                  {importResult.questionnaire.assessment_year && (
                    <span>Year: {importResult.questionnaire.assessment_year}</span>
                  )}
                  <span>{importResult.questions_count} questions</span>
                  <span>{importResult.domains.length} domains</span>
                </div>
              </div>
              <FileSpreadsheet className="h-8 w-8 text-green-500" />
            </div>
          </div>

          {/* Domain Breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Questions by Domain
              </h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {importResult.domains.map((domain) => (
                  <div
                    key={domain}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {domain}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white ml-2">
                      {importResult.domain_counts[domain]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Question List (Expandable by Domain) */}
          {!questionsLoading && questions.length > 0 && (
            <QuestionsList questions={questions} />
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
            <button
              onClick={() => {
                setStep("upload");
                setImportResult(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Upload Different File
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Tracking Points
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Analyze & Review */}
      {step === "analyze" && (
        <div className="space-y-6">
          {/* Analysis Summary */}
          {analyzeResult && (
            <>
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <h3 className="font-medium text-green-800 dark:text-green-300">
                    Analysis Complete
                  </h3>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="text-green-700 dark:text-green-400 font-medium">
                    {analyzeResult.suggestions_generated} new suggestions
                  </span>
                  {analyzeResult.skip_summary && (
                    <>
                      {analyzeResult.skip_summary.duplicates > 0 && (
                        <span className="text-amber-700 dark:text-amber-400">
                          {analyzeResult.skip_summary.duplicates} duplicates (already tracked)
                        </span>
                      )}
                      {analyzeResult.skip_summary.negatives > 0 && (
                        <span className="text-gray-600 dark:text-gray-400">
                          {analyzeResult.skip_summary.negatives} negative responses
                        </span>
                      )}
                      {analyzeResult.skip_summary.blanks > 0 && (
                        <span className="text-gray-600 dark:text-gray-400">
                          {analyzeResult.skip_summary.blanks} blanks
                        </span>
                      )}
                      {analyzeResult.skip_summary.headers > 0 && (
                        <span className="text-gray-600 dark:text-gray-400">
                          {analyzeResult.skip_summary.headers} headers
                        </span>
                      )}
                    </>
                  )}
                </div>
                {analyzeResult.domains_covered.length > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-2">
                    Across {analyzeResult.domains_covered.length} domains: {analyzeResult.domains_covered.join(", ")}
                  </p>
                )}
              </div>

              {/* Duplicates Section */}
              {analyzeResult.skipped_duplicates && analyzeResult.skipped_duplicates.length > 0 && (
                <DuplicatesSection duplicates={analyzeResult.skipped_duplicates} />
              )}
            </>
          )}

          {/* Suggestions List */}
          {suggestionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          ) : pendingSuggestions.length === 0 && suggestions.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                All suggestions reviewed!
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {suggestions.filter((s) => s.status === "accepted").length} accepted,{" "}
                {suggestions.filter((s) => s.status === "rejected").length} rejected
              </p>
              <Link
                href="/compliance/reminders"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                View Reminders
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  Pending Suggestions ({pendingSuggestions.length})
                </h3>
              </div>
              {pendingSuggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onAccept={async () => {
                    await acceptSuggestion({ suggestionId: suggestion.id });
                  }}
                  onReject={async () => {
                    await rejectSuggestion(suggestion.id);
                  }}
                  isAccepting={isAccepting}
                  isRejecting={isRejecting}
                />
              ))}
            </div>
          )}

          {/* Back link */}
          <div className="pt-4">
            <Link
              href="/compliance/reminders"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              &larr; Back to Reminders
            </Link>
          </div>
        </div>
      )}
      {/* Link to Compliance Center */}
      {questionnaires.length > 0 && (
        <div className="mt-8 text-center">
          <Link
            href="/compliance/reminders/compliance"
            className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
          >
            <FileSpreadsheet className="h-4 w-4" />
            View all imports in Compliance Center
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ============ Sub-components ============

function QuestionsList({ questions }: { questions: QuestionnaireQuestion[] }) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());

  // Group questions by domain
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
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Parsed Questions ({questions.filter((q) => !q.is_section_header).length})
        </h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {Object.entries(grouped).map(([domain, domainQuestions]) => (
          <div key={domain}>
            <button
              onClick={() => toggleDomain(domain)}
              className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
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

function DuplicatesSection({ duplicates }: { duplicates: SkippedDuplicate[] }) {
  const [expanded, setExpanded] = useState(false);

  // Group by domain
  const grouped: Record<string, SkippedDuplicate[]> = {};
  for (const d of duplicates) {
    const domain = d.domain || "Uncategorized";
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(d);
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {duplicates.length} duplicate questions already tracked
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-amber-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-amber-500" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {Object.entries(grouped).map(([domain, items]) => (
            <div key={domain}>
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1.5">
                {domain} ({items.length})
              </h4>
              <div className="space-y-1.5">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-3 px-3 py-2 bg-white dark:bg-gray-800 rounded border border-amber-100 dark:border-amber-900/30 text-sm"
                  >
                    <p className="text-gray-700 dark:text-gray-300 flex-1 min-w-0 leading-snug">
                      {item.question_text}
                    </p>
                    <div className="flex-shrink-0">
                      {item.duplicate_of_type === "reminder" && item.duplicate_of_id ? (
                        <Link
                          href={`/compliance/reminders/${item.duplicate_of_id}`}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                        >
                          View Reminder
                        </Link>
                      ) : item.duplicate_of_type === "suggestion" ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          Existing suggestion
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          In another questionnaire
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  isAccepting,
  isRejecting,
}: {
  suggestion: ReminderSuggestion;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  isAccepting: boolean;
  isRejecting: boolean;
}) {
  const confidenceColor =
    suggestion.confidence_score >= 0.8
      ? "text-green-600"
      : suggestion.confidence_score >= 0.6
      ? "text-amber-600"
      : "text-gray-500";

  const frequencyLabel: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "Bi-weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white leading-snug">
            {suggestion.suggested_title}
          </h4>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {frequencyLabel[suggestion.suggested_frequency] || suggestion.suggested_frequency}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {suggestion.suggested_category}
            </span>
            <span className={`text-xs font-medium ${confidenceColor}`}>
              {Math.round(suggestion.confidence_score * 100)}% confidence
            </span>
          </div>
          {suggestion.answer_text && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Answer: {suggestion.answer_text}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onReject}
            disabled={isRejecting}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
            title="Reject"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={onAccept}
            disabled={isAccepting}
            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
            title="Accept"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
