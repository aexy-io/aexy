"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  History,
  Clock,
  RotateCcw,
  ChevronRight,
  RefreshCw,
  Loader2,
  GitCompare,
  Plus,
  Minus,
  Edit3,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";

interface WorkflowVersion {
  id: string;
  version: number;
  change_summary: string | null;
  node_count: number;
  edge_count: number;
  created_by: string | null;
  created_at: string | null;
}

interface VersionDetail {
  id: string;
  version: number;
  nodes: unknown[];
  edges: unknown[];
  viewport: { x: number; y: number; zoom: number } | null;
  change_summary: string | null;
  node_count: number;
  edge_count: number;
  created_by: string | null;
  created_at: string | null;
}

interface VersionDiff {
  version_a: number;
  version_b: number;
  nodes: {
    added: { id: string; type: string; label: string }[];
    removed: { id: string; type: string; label: string }[];
    modified: { id: string; type: string; label: string; changes: string[] }[];
  };
  edges: {
    added: { source: string; target: string }[];
    removed: { source: string; target: string }[];
  };
  summary: string[];
}

interface VersionHistoryProps {
  workspaceId: string;
  automationId: string;
  currentVersion: number;
  isOpen: boolean;
  onClose: () => void;
  onRestore?: (version: VersionDetail) => void;
  onPreview?: (version: VersionDetail) => void;
}

export function VersionHistory({
  workspaceId,
  automationId,
  currentVersion,
  isOpen,
  onClose,
  onRestore,
  onPreview,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionDetail | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState<number | null>(null);
  const [compareVersionB, setCompareVersionB] = useState<number | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    if (!workspaceId || !automationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/versions`
      );
      setVersions(response.data.versions || []);
    } catch (err) {
      console.error("Failed to load versions:", err);
      setError("Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, automationId]);

  const loadVersionDetail = useCallback(
    async (version: number) => {
      if (!workspaceId || !automationId) return;

      setIsLoadingDetail(true);

      try {
        const response = await api.get(
          `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/versions/${version}`
        );
        setSelectedVersion(response.data);
        if (onPreview) {
          onPreview(response.data);
        }
      } catch (err) {
        console.error("Failed to load version detail:", err);
        setError("Failed to load version details");
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [workspaceId, automationId, onPreview]
  );

  const loadDiff = useCallback(async () => {
    if (!workspaceId || !automationId || !compareVersionA || !compareVersionB) return;

    setIsLoadingDetail(true);
    setError(null);

    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/versions/compare`,
        { params: { version_a: compareVersionA, version_b: compareVersionB } }
      );
      setDiff(response.data);
    } catch (err) {
      console.error("Failed to load diff:", err);
      setError("Failed to compare versions");
    } finally {
      setIsLoadingDetail(false);
    }
  }, [workspaceId, automationId, compareVersionA, compareVersionB]);

  const handleRestore = useCallback(async () => {
    if (!selectedVersion || !workspaceId || !automationId) return;

    setIsRestoring(true);
    setError(null);

    try {
      await api.post(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/versions/${selectedVersion.version}/restore`
      );
      if (onRestore) {
        onRestore(selectedVersion);
      }
      onClose();
    } catch (err) {
      console.error("Failed to restore version:", err);
      setError("Failed to restore version");
    } finally {
      setIsRestoring(false);
    }
  }, [selectedVersion, workspaceId, automationId, onRestore, onClose]);

  useEffect(() => {
    // Skip API call for new automations (automationId is "new" before creation)
    if (isOpen && automationId !== "new") {
      loadVersions();
    }
  }, [isOpen, loadVersions, automationId]);

  useEffect(() => {
    if (compareMode && compareVersionA && compareVersionB) {
      loadDiff();
    }
  }, [compareMode, compareVersionA, compareVersionB, loadDiff]);

  if (!isOpen) return null;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[450px] bg-muted border-l border-border shadow-xl z-[100] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-foreground font-semibold">Version History</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCompareMode(!compareMode);
              setDiff(null);
              setCompareVersionA(null);
              setCompareVersionB(null);
            }}
            className={`p-1.5 rounded transition-colors ${
              compareMode
                ? "bg-blue-500/20 text-blue-400"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Compare versions"
          >
            <GitCompare className="h-4 w-4" />
          </button>
          <button
            onClick={loadVersions}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Current Version Banner */}
      <div className="px-4 py-2 bg-accent/50 border-b border-border">
        <div className="text-xs text-muted-foreground">
          Current version: <span className="text-foreground font-medium">v{currentVersion}</span>
        </div>
      </div>

      {/* Compare Mode Header */}
      {compareMode && (
        <div className="px-4 py-3 bg-blue-500/10 border-b border-border">
          <div className="text-sm text-blue-300 mb-2">Select two versions to compare</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Version A:</span>
            <span className="text-foreground">{compareVersionA ?? "Select..."}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Version B:</span>
            <span className="text-foreground">{compareVersionB ?? "Select..."}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          </div>
        ) : compareMode && diff ? (
          // Diff View
          <div className="p-4 space-y-4">
            <div className="bg-accent/50 rounded-lg p-3">
              <h3 className="text-foreground font-medium mb-2">Changes Summary</h3>
              <ul className="space-y-1">
                {diff.summary.map((item, i) => (
                  <li key={i} className="text-sm text-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Added Nodes */}
            {diff.nodes.added.length > 0 && (
              <div>
                <h4 className="text-green-400 text-sm font-medium mb-2 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Added Nodes
                </h4>
                <div className="space-y-1">
                  {diff.nodes.added.map((node) => (
                    <div
                      key={node.id}
                      className="bg-green-500/10 border border-green-500/30 rounded px-3 py-2 text-sm"
                    >
                      <span className="text-foreground">{node.label || node.id}</span>
                      <span className="text-green-400 ml-2">({node.type})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Removed Nodes */}
            {diff.nodes.removed.length > 0 && (
              <div>
                <h4 className="text-red-400 text-sm font-medium mb-2 flex items-center gap-1">
                  <Minus className="h-3 w-3" /> Removed Nodes
                </h4>
                <div className="space-y-1">
                  {diff.nodes.removed.map((node) => (
                    <div
                      key={node.id}
                      className="bg-red-500/10 border border-red-500/30 rounded px-3 py-2 text-sm"
                    >
                      <span className="text-foreground">{node.label || node.id}</span>
                      <span className="text-red-400 ml-2">({node.type})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modified Nodes */}
            {diff.nodes.modified.length > 0 && (
              <div>
                <h4 className="text-amber-400 text-sm font-medium mb-2 flex items-center gap-1">
                  <Edit3 className="h-3 w-3" /> Modified Nodes
                </h4>
                <div className="space-y-1">
                  {diff.nodes.modified.map((node) => (
                    <div
                      key={node.id}
                      className="bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 text-sm"
                    >
                      <span className="text-foreground">{node.label || node.id}</span>
                      <span className="text-amber-400 ml-2">({node.changes.join(", ")})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Edge Changes */}
            {(diff.edges.added.length > 0 || diff.edges.removed.length > 0) && (
              <div>
                <h4 className="text-foreground text-sm font-medium mb-2">Connection Changes</h4>
                {diff.edges.added.length > 0 && (
                  <div className="text-sm text-green-400 mb-1">
                    + {diff.edges.added.length} connection(s) added
                  </div>
                )}
                {diff.edges.removed.length > 0 && (
                  <div className="text-sm text-red-400">
                    - {diff.edges.removed.length} connection(s) removed
                  </div>
                )}
              </div>
            )}
          </div>
        ) : versions.length === 0 ? (
          <div className="p-4 text-center">
            <History className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No version history yet</p>
            <p className="text-muted-foreground text-xs mt-1">
              Versions are created automatically when you save changes
            </p>
          </div>
        ) : (
          // Version List
          <div className="divide-y divide-border">
            {versions.map((version) => (
              <button
                key={version.id}
                onClick={() => {
                  if (compareMode) {
                    if (!compareVersionA) {
                      setCompareVersionA(version.version);
                    } else if (!compareVersionB && version.version !== compareVersionA) {
                      setCompareVersionB(version.version);
                    } else {
                      // Reset selection
                      setCompareVersionA(version.version);
                      setCompareVersionB(null);
                      setDiff(null);
                    }
                  } else {
                    loadVersionDetail(version.version);
                  }
                }}
                className={`w-full text-left p-4 hover:bg-accent/50 transition-colors ${
                  selectedVersion?.version === version.version && !compareMode
                    ? "bg-accent/50"
                    : ""
                } ${
                  compareMode &&
                  (compareVersionA === version.version || compareVersionB === version.version)
                    ? "bg-blue-500/10 border-l-2 border-blue-500"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-medium">v{version.version}</span>
                      {version.version === currentVersion && (
                        <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                      {compareMode && compareVersionA === version.version && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                          A
                        </span>
                      )}
                      {compareMode && compareVersionB === version.version && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                          B
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {version.change_summary || "No description"}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{version.node_count} nodes</span>
                      <span>{version.edge_count} edges</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(version.created_at)}
                    </div>
                    {!compareMode && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer with actions */}
      {selectedVersion && !compareMode && (
        <div className="p-4 border-t border-border bg-muted/90">
          <div className="bg-accent/50 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-foreground font-medium">Version {selectedVersion.version}</span>
              <span className="text-xs text-muted-foreground">{formatDate(selectedVersion.created_at)}</span>
            </div>
            <p className="text-sm text-muted-foreground">{selectedVersion.change_summary || "No description"}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>{selectedVersion.node_count} nodes</span>
              <span>{selectedVersion.edge_count} edges</span>
            </div>
          </div>

          {selectedVersion.version !== currentVersion && (
            <button
              onClick={handleRestore}
              disabled={isRestoring}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isRestoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Restore This Version
            </button>
          )}

          {selectedVersion.version === currentVersion && (
            <div className="text-center text-sm text-muted-foreground">
              This is the current version
            </div>
          )}
        </div>
      )}
    </div>
  );
}
