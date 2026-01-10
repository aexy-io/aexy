"use client";

import { useState, useRef } from "react";
import {
  Save,
  Play,
  Pause,
  Maximize,
  Loader2,
  Check,
  AlertCircle,
  TestTube,
  History,
  Download,
  Upload,
  GitBranch,
} from "lucide-react";

interface WorkflowToolbarProps {
  hasChanges: boolean;
  isSaving: boolean;
  isPublished: boolean;
  isTestRunning?: boolean;
  validationErrors?: number;
  validationWarnings?: number;
  currentVersion?: number;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onTest: (recordId?: string) => Promise<void>;
  onFitView: () => void;
  onHistoryOpen?: () => void;
  onVersionHistoryOpen?: () => void;
  onTestResultsOpen?: () => void;
  onExport?: () => Promise<void>;
  onImport?: (data: unknown) => Promise<void>;
}

export function WorkflowToolbar({
  hasChanges,
  isSaving,
  isPublished,
  isTestRunning = false,
  validationErrors = 0,
  validationWarnings = 0,
  currentVersion,
  onSave,
  onPublish,
  onUnpublish,
  onTest,
  onFitView,
  onHistoryOpen,
  onVersionHistoryOpen,
  onTestResultsOpen,
  onExport,
  onImport,
}: WorkflowToolbarProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use external test running state if provided
  const testInProgress = isTestRunning || isTesting;
  const [showTestModal, setShowTestModal] = useState(false);
  const [testRecordId, setTestRecordId] = useState("");

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      if (isPublished) {
        await onUnpublish();
      } else {
        await onPublish();
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await onTest(testRecordId || undefined);
    } finally {
      setIsTesting(false);
      setShowTestModal(false);
    }
  };

  const handleExport = async () => {
    if (!onExport) return;
    setIsExporting(true);
    try {
      await onExport();
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImport) return;

    setImportError(null);
    setIsImporting(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await onImport(data);
      setShowImportModal(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import workflow");
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-xl px-4 py-2 shadow-lg">
        {/* Save button */}
        <button
          onClick={onSave}
          disabled={!hasChanges || isSaving}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${hasChanges
              ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              : "bg-slate-700 text-slate-500 cursor-not-allowed"
            }
          `}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasChanges ? (
            <Save className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {isSaving ? "Saving..." : hasChanges ? "Save" : "Saved"}
        </button>

        <div className="w-px h-6 bg-slate-700" />

        {/* Test button */}
        <button
          onClick={() => setShowTestModal(true)}
          disabled={testInProgress}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
        >
          {testInProgress ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TestTube className="h-4 w-4" />
          )}
          Test
        </button>

        {/* Test Results button */}
        {onTestResultsOpen && (
          <button
            onClick={onTestResultsOpen}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Test results"
          >
            <TestTube className="h-4 w-4" />
          </button>
        )}

        {/* Publish/Unpublish button */}
        <button
          onClick={handlePublish}
          disabled={isPublishing || hasChanges}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${isPublished
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            }
            ${hasChanges ? "opacity-50 cursor-not-allowed" : ""}
          `}
          title={hasChanges ? "Save changes before publishing" : ""}
        >
          {isPublishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPublished ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isPublished ? "Unpublish" : "Publish"}
        </button>

        <div className="w-px h-6 bg-slate-700" />

        {/* Fit view button */}
        <button
          onClick={onFitView}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          title="Fit view"
        >
          <Maximize className="h-4 w-4" />
        </button>

        {/* History button */}
        {onHistoryOpen && (
          <button
            onClick={onHistoryOpen}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Execution history"
          >
            <History className="h-4 w-4" />
          </button>
        )}

        {/* Version History button */}
        {onVersionHistoryOpen && (
          <button
            onClick={onVersionHistoryOpen}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title={`Version history${currentVersion ? ` (v${currentVersion})` : ""}`}
          >
            <GitBranch className="h-4 w-4" />
          </button>
        )}

        {/* Import/Export buttons */}
        {(onExport || onImport) && (
          <>
            <div className="w-px h-6 bg-slate-700" />
            {onExport && (
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
                title="Export workflow"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </button>
            )}
            {onImport && (
              <button
                onClick={() => setShowImportModal(true)}
                disabled={isImporting}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
                title="Import workflow"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </button>
            )}
          </>
        )}

        {/* Validation indicator */}
        {(validationErrors > 0 || validationWarnings > 0) && (
          <>
            <div className="w-px h-6 bg-slate-700" />
            <div className="flex items-center gap-1.5">
              {validationErrors > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/20 text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{validationErrors}</span>
                </div>
              )}
              {validationWarnings > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{validationWarnings}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 ml-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isPublished ? "bg-green-400" : "bg-slate-500"
            }`}
          />
          <span className="text-xs text-slate-400">
            {isPublished ? "Live" : "Draft"}
          </span>
        </div>
      </div>

      {/* Test Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Test Workflow</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Record ID (optional)
                </label>
                <input
                  type="text"
                  value={testRecordId}
                  onChange={(e) => setTestRecordId(e.target.value)}
                  placeholder="Enter a record ID to test with..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Leave empty for a dry run without a specific record
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    This will execute the workflow in test mode. Actions will be simulated but not actually performed.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowTestModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTest}
                disabled={testInProgress}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {testInProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Import Workflow</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Select a workflow JSON file
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  className="w-full text-sm text-slate-400
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-medium
                    file:bg-blue-500/20 file:text-blue-400
                    hover:file:bg-blue-500/30
                    file:cursor-pointer
                  "
                />
              </div>

              {importError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5" />
                    <p className="text-xs text-red-300">{importError}</p>
                  </div>
                </div>
              )}

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    Importing will replace the current workflow. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportError(null);
                }}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
