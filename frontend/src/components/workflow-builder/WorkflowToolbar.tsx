"use client";

import { useState } from "react";
import {
  Save,
  Play,
  Pause,
  Maximize,
  Loader2,
  Check,
  AlertCircle,
  TestTube,
} from "lucide-react";

interface WorkflowToolbarProps {
  hasChanges: boolean;
  isSaving: boolean;
  isPublished: boolean;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onTest: (recordId?: string) => Promise<void>;
  onFitView: () => void;
}

export function WorkflowToolbar({
  hasChanges,
  isSaving,
  isPublished,
  onSave,
  onPublish,
  onUnpublish,
  onTest,
  onFitView,
}: WorkflowToolbarProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
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
          disabled={isTesting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
        >
          {isTesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TestTube className="h-4 w-4" />
          )}
          Test
        </button>

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
                disabled={isTesting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {isTesting ? (
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
    </>
  );
}
