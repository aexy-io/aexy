"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useEffect, useState, useRef } from "react";
import {
  Save,
  Play,
  PlayCircle,
  Pause,
  Maximize,
  LayoutGrid,
  Loader2,
  Check,
  AlertCircle,
  TestTube,
  History,
  Download,
  Upload,
  GitBranch,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { crmApi, type CRMRecord } from "@/lib/api";

/** Each row in the validation popover. Toolbar doesn't need the full
 *  ValidationError shape — just enough to render and to wire a
 *  "reveal" jump. Defined here so callers don't have to import the
 *  hook's types into the toolbar. */
export interface ToolbarValidationItem {
  nodeId: string;
  nodeLabel?: string;
  message: string;
  severity: "error" | "warning";
}

interface WorkflowToolbarProps {
  workspaceId: string;
  hasChanges: boolean;
  isSaving: boolean;
  isPublished: boolean;
  isTestRunning?: boolean;
  validationErrors?: number;
  validationWarnings?: number;
  /** When provided, the error/warning chip becomes a popover that
   *  lists every issue. Each row has a "Reveal" button that calls
   *  onRevealError to jump the viewport to the offending node. */
  validationItems?: ToolbarValidationItem[];
  onRevealNode?: (nodeId: string) => void;
  currentVersion?: number;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onTest: (recordId?: string) => Promise<void>;
  /** Run the automation for real against one record. Optional: where it is
   *  not wired the button is simply absent, rather than present and inert. */
  onRun?: (recordId: string) => Promise<void>;
  onFitView: () => void;
  /** Optional. When wired, renders an Auto-layout button between
   *  Fit-view and History. */
  onAutoLayout?: () => void;
  onHistoryOpen?: () => void;
  onVersionHistoryOpen?: () => void;
  onTestResultsOpen?: () => void;
  onExport?: () => Promise<void>;
  onImport?: (data: unknown) => Promise<void>;
}

export function WorkflowToolbar({
  workspaceId,
  hasChanges,
  isSaving,
  isPublished,
  isTestRunning = false,
  validationErrors = 0,
  validationWarnings = 0,
  validationItems,
  onRevealNode,
  currentVersion,
  onSave,
  onPublish,
  onUnpublish,
  onTest,
  onRun,
  onFitView,
  onAutoLayout,
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
  const [showValidationPopover, setShowValidationPopover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use external test running state if provided
  const testInProgress = isTestRunning || isTesting;
  const [showRunModal, setShowRunModal] = useState(false);
  const [runRecordId, setRunRecordId] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testRecordId, setTestRecordId] = useState("");
  const [testRecords, setTestRecords] = useState<CRMRecord[]>([]);
  const [isLoadingTestRecords, setIsLoadingTestRecords] = useState(false);

  useEffect(() => {
    if ((!showTestModal && !showRunModal) || testRecords.length > 0) return;

    let cancelled = false;
    const loadPeople = async () => {
      setIsLoadingTestRecords(true);
      try {
        const objects = await crmApi.objects.list(workspaceId);
        const people = objects.find((object) => object.object_type === "person");
        if (!people) return;
        const response = await crmApi.records.list(workspaceId, people.id, { limit: 50 });
        if (!cancelled) setTestRecords(response.records);
      } catch {
        // The manual record-ID field remains available if records cannot load.
      } finally {
        if (!cancelled) setIsLoadingTestRecords(false);
      }
    };

    void loadPeople();
    return () => {
      cancelled = true;
    };
  }, [showTestModal, showRunModal, testRecords.length, workspaceId]);

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      if (isPublished) {
        await onUnpublish();
        toast.success("Automation unpublished", {
          description: "It will no longer run when a CRM record is created.",
        });
      } else {
        await onPublish();
        toast.success("Automation published", {
          description: "The automation is now published. To test a recipient taken from a record, enter the ID of a real CRM record with an email address.",
        });
      }
    } catch (error) {
      toast.error(isPublished ? "Couldn't unpublish the automation" : "Couldn't publish the automation", {
        description: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRun = async () => {
    if (!onRun || !runRecordId) return;
    setIsRunning(true);
    setRunError(null);
    try {
      await onRun(runRecordId);
      setShowRunModal(false);
      setRunRecordId("");
    } catch (error) {
      // The pre-flight refuses a paused automation, an exhausted allowance or
      // a record of the wrong type. Those reasons belong in front of the
      // person who pressed the button, not in a console.
      setRunError(getApiErrorMessage(error, "Could not start the automation"));
    } finally {
      setIsRunning(false);
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
      setImportError(getApiErrorMessage(err, "Failed to import workflow"));
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
      <div className="flex items-center gap-2 bg-muted/90 backdrop-blur border border-border rounded-xl px-4 py-2 shadow-lg">
        {/* Save button */}
        <button
          onClick={onSave}
          disabled={!hasChanges || isSaving}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${hasChanges
              ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              : "bg-accent text-muted-foreground cursor-not-allowed"
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

        <div className="w-px h-6 bg-accent" />

        {/* Test button */}
        <button
          onClick={() => setShowTestModal(true)}
          disabled={testInProgress}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent text-foreground hover:bg-muted transition-colors"
        >
          {testInProgress ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TestTube className="h-4 w-4" />
          )}
          Test
        </button>

        {/* Run button — only when wired, and only once published: running an
            unpublished draft would execute whatever actions were last saved. */}
        {onRun && isPublished && (
          <button
            onClick={() => setShowRunModal(true)}
            disabled={isRunning}
            title="Run this automation now for one record"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent text-foreground hover:bg-muted transition-colors"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Run now
          </button>
        )}

        {/* Test Results button */}
        {onTestResultsOpen && (
          <button
            onClick={onTestResultsOpen}
            aria-label="Test results"
            title="Test results"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <TestTube className="h-4 w-4" />
          </button>
        )}

        {/* Publish/Unpublish button */}
        <button
          onClick={handlePublish}
          disabled={isPublishing || (!isPublished && (hasChanges || validationErrors > 0))}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${isPublished
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            }
            ${!isPublished && (hasChanges || validationErrors > 0) ? "opacity-50 cursor-not-allowed" : ""}
          `}
          title={
            !isPublished && hasChanges
              ? "Save changes before publishing"
              : !isPublished && validationErrors > 0
                ? "Fix validation errors before publishing"
                : ""
          }
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

        <div className="w-px h-6 bg-accent" />

        {/* Fit view button */}
        <button
          onClick={onFitView}
          aria-label="Fit view"
          title="Fit view"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Maximize className="h-4 w-4" aria-hidden />
        </button>

        {/* UX-DEF-002: Auto-layout. Re-runs a topological left-to-right
            layout so users who dragged nodes around have a one-click
            "tidy up". Implemented as a heuristic BFS over edges (no
            dagre dep yet) — gets messy automations into a readable
            shape in one click. */}
        {onAutoLayout && (
          <button
            onClick={onAutoLayout}
            aria-label="Auto-layout"
            title="Auto-layout (tidy)"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </button>
        )}

        {/* History button */}
        {onHistoryOpen && (
          <button
            onClick={onHistoryOpen}
            aria-label="Execution history"
            title="Execution history"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <History className="h-4 w-4" />
          </button>
        )}

        {/* Version History button */}
        {onVersionHistoryOpen && (
          <button
            onClick={onVersionHistoryOpen}
            aria-label={`Version history${currentVersion ? ` (v${currentVersion})` : ""}`}
            title={`Version history${currentVersion ? ` (v${currentVersion})` : ""}`}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <GitBranch className="h-4 w-4" />
          </button>
        )}

        {/* Import/Export buttons */}
        {(onExport || onImport) && (
          <>
            <div className="w-px h-6 bg-accent" />
            {onExport && (
              <button
                onClick={handleExport}
                disabled={isExporting}
                aria-label="Export workflow"
                title="Export workflow"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
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
                aria-label="Import workflow"
                title="Import workflow"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
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

        {/* Validation indicator — now a clickable pill that opens a
            popover listing every issue. Clicking a row jumps the
            viewport to the offending node via onRevealNode. UX-WFL-005. */}
        {(validationErrors > 0 || validationWarnings > 0) && (
          <>
            <div className="w-px h-6 bg-accent" />
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  validationItems && validationItems.length > 0
                    ? setShowValidationPopover((v) => !v)
                    : undefined
                }
                aria-haspopup={validationItems ? "dialog" : undefined}
                aria-expanded={showValidationPopover}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors",
                  validationItems && validationItems.length > 0
                    ? "cursor-pointer hover:bg-accent"
                    : "cursor-default",
                )}
              >
                {validationErrors > 0 && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{validationErrors}</span>
                  </span>
                )}
                {validationWarnings > 0 && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{validationWarnings}</span>
                  </span>
                )}
              </button>

              {showValidationPopover && validationItems && validationItems.length > 0 ? (
                <>
                  {/* Click-out backdrop */}
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowValidationPopover(false)}
                    aria-hidden
                  />
                  <div
                    role="dialog"
                    aria-label="Validation issues"
                    className="absolute top-full mt-2 right-0 z-40 w-80 max-h-96 overflow-y-auto bg-popover border border-border rounded-xl shadow-xl"
                  >
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Issues
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {validationItems.length === 1
                          ? "1 to fix"
                          : `${validationItems.length} to fix`}
                      </span>
                    </div>
                    <ul className="divide-y divide-border">
                      {validationItems.map((item, idx) => (
                        <li key={`${item.nodeId}-${idx}`}>
                          <button
                            type="button"
                            onClick={() => {
                              onRevealNode?.(item.nodeId);
                              setShowValidationPopover(false);
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-start gap-2.5"
                          >
                            <AlertCircle
                              className={cn(
                                "h-4 w-4 mt-0.5 shrink-0",
                                item.severity === "error"
                                  ? "text-red-500 dark:text-red-400"
                                  : "text-amber-500 dark:text-amber-400",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-foreground truncate">
                                {item.nodeLabel || item.nodeId}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {item.message}
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground/70 shrink-0 mt-0.5">
                              Reveal
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>
          </>
        )}

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 ml-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isPublished ? "bg-green-400" : "bg-muted-foreground"
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {isPublished ? "Live" : "Draft"}
          </span>
        </div>
      </div>

      {/* Run modal. Test is a dry run; this one really sends, so the wording
          and the colour have to make that unmistakable rather than leaving the
          two buttons looking interchangeable. */}
      <Dialog
        open={showRunModal}
        onOpenChange={isRunning ? undefined : (open) => !open && setShowRunModal(false)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run this automation now</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This performs every step for real — emails are sent, webhooks
                  are called, records are changed. Use <strong>Test</strong> for
                  a dry run.
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="run-record-id"
                className="block text-sm text-muted-foreground mb-1"
              >
                Record to run against
              </label>
              {testRecords.length > 0 ? (
                <select
                  id="run-record-id"
                  value={runRecordId}
                  onChange={(e) => setRunRecordId(e.target.value)}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">Choose a record</option>
                  {testRecords.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.display_name || "Unnamed"}
                      {record.values.email ? ` — ${String(record.values.email)}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="run-record-id"
                  type="text"
                  value={runRecordId}
                  onChange={(e) => setRunRecordId(e.target.value)}
                  placeholder={isLoadingTestRecords ? "Loading records..." : "Paste a record ID..."}
                  disabled={isLoadingTestRecords}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
                />
              )}
            </div>

            {runError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {runError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRunModal(false)}
                disabled={isRunning}
                className="px-3 py-1.5 rounded-lg text-sm bg-accent text-foreground hover:bg-muted transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleRun}
                // A record is required: every CRM action reads from one, and
                // the backend refuses without it anyway.
                disabled={isRunning || !runRecordId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-60"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Run for real
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Modal — Radix Dialog gives us focus trap, Esc-to-close,
          scroll lock, and proper aria-modal that the prior raw portal
          implementation lacked. */}
      <Dialog
        open={showTestModal}
        onOpenChange={testInProgress ? undefined : (open) => !open && setShowTestModal(false)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Test Workflow</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="test-record-id"
                className="block text-sm text-muted-foreground mb-1"
              >
                Person to test with
              </label>
              {testRecords.length > 0 ? (
                <select
                  id="test-record-id"
                  value={testRecordId}
                  onChange={(e) => setTestRecordId(e.target.value)}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">Choose a person</option>
                  {testRecords.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.display_name || "Unnamed person"}{record.values.email ? ` — ${String(record.values.email)}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="test-record-id"
                  type="text"
                  value={testRecordId}
                  onChange={(e) => setTestRecordId(e.target.value)}
                  placeholder={isLoadingTestRecords ? "Loading people..." : "Paste a record ID to test with..."}
                  disabled={isLoadingTestRecords}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
                />
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Choose the person the workflow should use. A sequence needs a real person with an email address.
              </p>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This will execute the workflow in test mode. Actions will be simulated but not actually performed.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setShowTestModal(false)}
              disabled={testInProgress}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testInProgress}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {testInProgress ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run Test
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog
        open={showImportModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowImportModal(false);
            setImportError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Workflow</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="import-workflow-file"
                className="block text-sm text-muted-foreground mb-2"
              >
                Select a workflow JSON file
              </label>
              <input
                id="import-workflow-file"
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="w-full text-sm text-muted-foreground
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-medium
                  file:bg-blue-500/20 file:text-blue-600 dark:file:text-blue-400
                  hover:file:bg-blue-500/30
                  file:cursor-pointer
                "
              />
            </div>

            {importError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-300">{importError}</p>
                </div>
              </div>
            )}

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Importing will replace the current workflow. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => {
                setShowImportModal(false);
                setImportError(null);
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
