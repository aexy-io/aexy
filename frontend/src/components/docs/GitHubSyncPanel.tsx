"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Github,
  Upload,
  Download,
  RefreshCw,
  Trash2,
  Plus,
  Check,
  AlertCircle,
  Clock,
  GitBranch,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  X,
} from "lucide-react";
import { documentApi, GitHubSyncConfig, repositoriesApi, Repository } from "@/lib/api";
import { cn } from "@/lib/utils";

interface GitHubSyncPanelProps {
  workspaceId: string;
  documentId: string;
  documentTitle: string;
  onClose?: () => void;
}

type SyncDirection = "export_only" | "import_only" | "bidirectional";

const syncDirectionConfig: Record<
  SyncDirection,
  { icon: typeof ArrowUp; label: string; description: string }
> = {
  export_only: {
    icon: ArrowUp,
    label: "Export Only",
    description: "Push document changes to GitHub",
  },
  import_only: {
    icon: ArrowDown,
    label: "Import Only",
    description: "Pull changes from GitHub",
  },
  bidirectional: {
    icon: ArrowUpDown,
    label: "Bidirectional",
    description: "Sync both ways",
  },
};

export function GitHubSyncPanel({
  workspaceId,
  documentId,
  documentTitle,
  onClose,
}: GitHubSyncPanelProps) {
  const queryClient = useQueryClient();
  const [isAddingSync, setIsAddingSync] = useState(false);
  const [newSync, setNewSync] = useState({
    repository_id: "",
    file_path: "",
    branch: "main",
    sync_direction: "bidirectional" as SyncDirection,
    auto_export: false,
    auto_import: false,
  });
  const [commitMessage, setCommitMessage] = useState("");

  // Fetch existing sync configs
  const { data: syncConfigs, isLoading: loadingConfigs } = useQuery({
    queryKey: ["github-sync", workspaceId, documentId],
    queryFn: () => documentApi.getGitHubSyncConfigs(workspaceId, documentId),
  });

  // Fetch repositories for selection
  const { data: repositories } = useQuery({
    queryKey: ["repositories"],
    queryFn: () => repositoriesApi.listRepositories(),
  });

  // Setup sync mutation
  const setupSyncMutation = useMutation({
    mutationFn: (options: typeof newSync) =>
      documentApi.setupGitHubSync(workspaceId, documentId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["github-sync", workspaceId, documentId],
      });
      setIsAddingSync(false);
      setNewSync({
        repository_id: "",
        file_path: "",
        branch: "main",
        sync_direction: "bidirectional",
        auto_export: false,
        auto_import: false,
      });
    },
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: ({ syncId, message }: { syncId: string; message?: string }) =>
      documentApi.exportToGitHub(workspaceId, documentId, syncId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["github-sync", workspaceId, documentId],
      });
      setCommitMessage("");
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (syncId: string) =>
      documentApi.importFromGitHub(workspaceId, documentId, syncId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["github-sync", workspaceId, documentId],
      });
      queryClient.invalidateQueries({
        queryKey: ["document", workspaceId, documentId],
      });
    },
  });

  // Delete sync mutation
  const deleteSyncMutation = useMutation({
    mutationFn: (syncId: string) =>
      documentApi.deleteGitHubSync(workspaceId, documentId, syncId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["github-sync", workspaceId, documentId],
      });
    },
  });

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Suggest file path based on document title
  const suggestFilePath = () => {
    const slug = documentTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `docs/${slug}.md`;
  };

  return (
    <div className="bg-background border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <Github className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium text-foreground">GitHub Sync</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Loading */}
        {loadingConfigs && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
          </div>
        )}

        {/* Existing Sync Configs */}
        {!loadingConfigs && syncConfigs && syncConfigs.length > 0 && (
          <div className="space-y-3">
            {syncConfigs.map((config) => (
              <SyncConfigCard
                key={config.id}
                config={config}
                formatLastSync={formatLastSync}
                commitMessage={commitMessage}
                onCommitMessageChange={setCommitMessage}
                onExport={(syncId, message) =>
                  exportMutation.mutate({ syncId, message })
                }
                onImport={(syncId) => importMutation.mutate(syncId)}
                onDelete={(syncId) => deleteSyncMutation.mutate(syncId)}
                isExporting={exportMutation.isPending}
                isImporting={importMutation.isPending}
                isDeleting={deleteSyncMutation.isPending}
                exportResult={exportMutation.data}
                importResult={importMutation.data}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loadingConfigs && syncConfigs?.length === 0 && !isAddingSync && (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <Github className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              No GitHub sync configured
            </p>
            <button
              onClick={() => {
                setNewSync((prev) => ({
                  ...prev,
                  file_path: suggestFilePath(),
                }));
                setIsAddingSync(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition"
            >
              <Plus className="h-4 w-4" />
              Add GitHub Sync
            </button>
          </div>
        )}

        {/* Add Sync Form */}
        {isAddingSync && (
          <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-medium text-foreground">
              Configure GitHub Sync
            </h4>

            {/* Repository Select */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Repository
              </label>
              <select
                value={newSync.repository_id}
                onChange={(e) =>
                  setNewSync((prev) => ({
                    ...prev,
                    repository_id: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500"
              >
                <option value="">Select a repository</option>
                {repositories?.map((repo: Repository) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* File Path */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                File Path
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={newSync.file_path}
                  onChange={(e) =>
                    setNewSync((prev) => ({
                      ...prev,
                      file_path: e.target.value,
                    }))
                  }
                  placeholder="docs/README.md"
                  className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            {/* Branch */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Branch
              </label>
              <div className="relative">
                <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={newSync.branch}
                  onChange={(e) =>
                    setNewSync((prev) => ({ ...prev, branch: e.target.value }))
                  }
                  placeholder="main"
                  className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            {/* Sync Direction */}
            <div>
              <label className="block text-xs text-muted-foreground mb-2">
                Sync Direction
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(syncDirectionConfig) as SyncDirection[]).map(
                  (direction) => {
                    const config = syncDirectionConfig[direction];
                    const Icon = config.icon;
                    return (
                      <button
                        key={direction}
                        onClick={() =>
                          setNewSync((prev) => ({
                            ...prev,
                            sync_direction: direction,
                          }))
                        }
                        className={cn(
                          "flex flex-col items-center gap-1 p-2 rounded-lg border transition",
                          newSync.sync_direction === direction
                            ? "border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
                            : "border-border text-muted-foreground hover:border-border"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-xs">{config.label}</span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Auto Sync Options */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newSync.auto_export}
                  onChange={(e) =>
                    setNewSync((prev) => ({
                      ...prev,
                      auto_export: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded border-border bg-muted text-primary-500 focus:ring-primary-500"
                />
                <span className="text-xs text-muted-foreground">Auto-export</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newSync.auto_import}
                  onChange={(e) =>
                    setNewSync((prev) => ({
                      ...prev,
                      auto_import: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded border-border bg-muted text-primary-500 focus:ring-primary-500"
                />
                <span className="text-xs text-muted-foreground">Auto-import</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setIsAddingSync(false)}
                className="flex-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={() => setupSyncMutation.mutate(newSync)}
                disabled={
                  !newSync.repository_id ||
                  !newSync.file_path ||
                  setupSyncMutation.isPending
                }
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {setupSyncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Configure
              </button>
            </div>
          </div>
        )}

        {/* Add Another Button */}
        {!loadingConfigs &&
          syncConfigs &&
          syncConfigs.length > 0 &&
          !isAddingSync && (
            <button
              onClick={() => {
                setNewSync((prev) => ({
                  ...prev,
                  file_path: suggestFilePath(),
                }));
                setIsAddingSync(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-border rounded-lg transition"
            >
              <Plus className="h-4 w-4" />
              Add Another Sync
            </button>
          )}
      </div>
    </div>
  );
}

// Sync Config Card Component
function SyncConfigCard({
  config,
  formatLastSync,
  commitMessage,
  onCommitMessageChange,
  onExport,
  onImport,
  onDelete,
  isExporting,
  isImporting,
  isDeleting,
  exportResult,
  importResult,
}: {
  config: GitHubSyncConfig;
  formatLastSync: (date: string | null) => string;
  commitMessage: string;
  onCommitMessageChange: (msg: string) => void;
  onExport: (syncId: string, message?: string) => void;
  onImport: (syncId: string) => void;
  onDelete: (syncId: string) => void;
  isExporting: boolean;
  isImporting: boolean;
  isDeleting: boolean;
  exportResult?: { status: string; commit_sha?: string; message?: string };
  importResult?: { status: string; message?: string };
}) {
  const [showCommitInput, setShowCommitInput] = useState(false);
  const DirectionIcon = syncDirectionConfig[config.sync_direction].icon;

  return (
    <div className="bg-muted/50 border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Github className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">
              {config.repository_name || "Unknown Repo"}
            </span>
          </div>
          <button
            onClick={() => onDelete(config.id)}
            disabled={isDeleting}
            className="p-1 text-muted-foreground hover:text-red-400 transition"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span className="truncate max-w-[150px]">{config.file_path}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            <span>{config.branch}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <DirectionIcon className="h-3.5 w-3.5" />
            <span>{syncDirectionConfig[config.sync_direction].label}</span>
          </div>
        </div>

        {/* Last Sync Times */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {config.sync_direction !== "import_only" && (
            <div className="flex items-center gap-1">
              <Upload className="h-3 w-3" />
              <span>Exported: {formatLastSync(config.last_exported_at)}</span>
            </div>
          )}
          {config.sync_direction !== "export_only" && (
            <div className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              <span>Imported: {formatLastSync(config.last_imported_at)}</span>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {exportResult?.status === "success" && (
          <div className="flex items-center gap-1 text-xs text-green-400">
            <Check className="h-3 w-3" />
            <span>Exported successfully</span>
          </div>
        )}
        {exportResult?.status === "no_changes" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            <span>No changes to export</span>
          </div>
        )}
        {importResult?.status === "success" && (
          <div className="flex items-center gap-1 text-xs text-green-400">
            <Check className="h-3 w-3" />
            <span>Imported successfully</span>
          </div>
        )}

        {/* Commit Message Input */}
        {showCommitInput && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => onCommitMessageChange(e.target.value)}
              placeholder="Commit message (optional)"
              className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:border-primary-500"
            />
            <button
              onClick={() => {
                onExport(config.id, commitMessage || undefined);
                setShowCommitInput(false);
              }}
              disabled={isExporting}
              className="px-2 py-1 bg-primary-600 hover:bg-primary-500 text-white text-xs rounded disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Export"
              )}
            </button>
            <button
              onClick={() => setShowCommitInput(false)}
              className="px-2 py-1 text-muted-foreground hover:text-foreground text-xs"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Action Buttons */}
        {!showCommitInput && (
          <div className="flex items-center gap-2 pt-1">
            {config.sync_direction !== "import_only" && (
              <button
                onClick={() => setShowCommitInput(true)}
                disabled={isExporting}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-accent hover:bg-muted text-foreground text-xs rounded transition disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Export
              </button>
            )}
            {config.sync_direction !== "export_only" && (
              <button
                onClick={() => onImport(config.id)}
                disabled={isImporting}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-accent hover:bg-muted text-foreground text-xs rounded transition disabled:opacity-50"
              >
                {isImporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Import
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
