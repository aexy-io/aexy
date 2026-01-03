"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History,
  Clock,
  User,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  X,
  Save,
  Sparkles,
  Eye,
  Check,
  AlertCircle,
} from "lucide-react";
import { documentApi, DocumentVersion } from "@/lib/api";
import { cn } from "@/lib/utils";

interface VersionHistoryPanelProps {
  workspaceId: string;
  documentId: string;
  currentContent: Record<string, unknown>;
  onClose?: () => void;
  onRestore?: (content: Record<string, unknown>) => void;
}

export function VersionHistoryPanel({
  workspaceId,
  documentId,
  currentContent,
  onClose,
  onRestore,
}: VersionHistoryPanelProps) {
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [limit, setLimit] = useState(20);

  // Fetch version history
  const { data: versions, isLoading } = useQuery({
    queryKey: ["versions", workspaceId, documentId, limit],
    queryFn: () => documentApi.getVersions(workspaceId, documentId, { limit }),
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      documentApi.restoreVersion(workspaceId, documentId, versionId),
    onSuccess: (document) => {
      queryClient.invalidateQueries({
        queryKey: ["document", workspaceId, documentId],
      });
      queryClient.invalidateQueries({
        queryKey: ["versions", workspaceId, documentId],
      });
      onRestore?.(document.content);
      setSelectedVersion(null);
    },
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Group versions by date
  const groupedVersions = versions?.reduce((groups, version) => {
    const date = new Date(version.created_at).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(version);
    return groups;
  }, {} as Record<string, DocumentVersion[]>);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col h-full max-h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-slate-400" />
          <span className="font-medium text-white">Version History</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
          </div>
        )}

        {!isLoading && !versions?.length && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-3">
              <History className="h-6 w-6 text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm">No version history yet</p>
            <p className="text-slate-500 text-xs mt-1">
              Versions are created when you save the document
            </p>
          </div>
        )}

        {!isLoading && versions && versions.length > 0 && (
          <div className="divide-y divide-slate-800">
            {Object.entries(groupedVersions || {}).map(([date, dateVersions]) => (
              <div key={date}>
                {/* Date Header */}
                <div className="sticky top-0 px-4 py-2 bg-slate-900/95 backdrop-blur text-xs text-slate-500 font-medium">
                  {new Date(date).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </div>

                {/* Versions for this date */}
                {dateVersions.map((version) => (
                  <VersionItem
                    key={version.id}
                    version={version}
                    isSelected={selectedVersion?.id === version.id}
                    formatDate={formatDate}
                    formatFullDate={formatFullDate}
                    onClick={() => setSelectedVersion(version)}
                    onRestore={() => restoreMutation.mutate(version.id)}
                    onPreview={() => {
                      setSelectedVersion(version);
                      setShowPreview(true);
                    }}
                    isRestoring={restoreMutation.isPending}
                  />
                ))}
              </div>
            ))}

            {/* Load More */}
            {versions.length >= limit && (
              <div className="p-4">
                <button
                  onClick={() => setLimit((prev) => prev + 20)}
                  className="w-full py-2 text-sm text-slate-400 hover:text-white border border-dashed border-slate-700 hover:border-slate-600 rounded-lg transition"
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && selectedVersion && (
        <VersionPreview
          version={selectedVersion}
          currentContent={currentContent}
          onClose={() => setShowPreview(false)}
          onRestore={() => {
            restoreMutation.mutate(selectedVersion.id);
            setShowPreview(false);
          }}
          isRestoring={restoreMutation.isPending}
        />
      )}
    </div>
  );
}

// Version Item Component
function VersionItem({
  version,
  isSelected,
  formatDate,
  formatFullDate,
  onClick,
  onRestore,
  onPreview,
  isRestoring,
}: {
  version: DocumentVersion;
  isSelected: boolean;
  formatDate: (date: string) => string;
  formatFullDate: (date: string) => string;
  onClick: () => void;
  onRestore: () => void;
  onPreview: () => void;
  isRestoring: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={cn(
        "px-4 py-3 hover:bg-slate-800/50 cursor-pointer transition",
        isSelected && "bg-slate-800/50"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            version.is_auto_save
              ? "bg-blue-900/30 text-blue-400"
              : version.is_auto_generated
              ? "bg-purple-900/30 text-purple-400"
              : "bg-slate-800 text-slate-400"
          )}
        >
          {version.is_auto_save ? (
            <Save className="h-4 w-4" />
          ) : version.is_auto_generated ? (
            <Sparkles className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">
              Version {version.version_number}
            </span>
            {version.is_auto_save && (
              <span className="px-1.5 py-0.5 text-[10px] bg-blue-900/30 text-blue-400 rounded">
                Auto-save
              </span>
            )}
            {version.is_auto_generated && (
              <span className="px-1.5 py-0.5 text-[10px] bg-purple-900/30 text-purple-400 rounded">
                AI Generated
              </span>
            )}
          </div>

          {version.change_summary && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {version.change_summary}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span title={formatFullDate(version.created_at)}>
              <Clock className="h-3 w-3 inline mr-1" />
              {formatDate(version.created_at)}
            </span>
            {version.created_by_name && (
              <span>
                <User className="h-3 w-3 inline mr-1" />
                {version.created_by_name}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition"
            title="Preview"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            disabled={isRestoring}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition disabled:opacity-50"
            title="Restore"
          >
            {isRestoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Version Preview Modal
function VersionPreview({
  version,
  currentContent,
  onClose,
  onRestore,
  isRestoring,
}: {
  version: DocumentVersion;
  currentContent: Record<string, unknown>;
  onClose: () => void;
  onRestore: () => void;
  isRestoring: boolean;
}) {
  const [viewMode, setViewMode] = useState<"preview" | "diff">("preview");

  // Simple text extraction for diff comparison
  const extractText = (content: Record<string, unknown>): string => {
    const extractFromNode = (node: Record<string, unknown>): string => {
      if (node.type === "text") {
        return (node.text as string) || "";
      }
      if (Array.isArray(node.content)) {
        return node.content.map((child) => extractFromNode(child as Record<string, unknown>)).join("");
      }
      return "";
    };

    if (content && typeof content === "object") {
      return extractFromNode(content);
    }
    return "";
  };

  const versionText = extractText(version.content);
  const currentText = extractText(currentContent);

  // Simple diff - split into lines and compare
  const computeDiff = (oldText: string, newText: string) => {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");
    const maxLength = Math.max(oldLines.length, newLines.length);
    const diff: Array<{ type: "same" | "added" | "removed" | "changed"; old?: string; new?: string }> = [];

    for (let i = 0; i < maxLength; i++) {
      const oldLine = oldLines[i] || "";
      const newLine = newLines[i] || "";

      if (oldLine === newLine) {
        diff.push({ type: "same", old: oldLine });
      } else if (!oldLines[i]) {
        diff.push({ type: "added", new: newLine });
      } else if (!newLines[i]) {
        diff.push({ type: "removed", old: oldLine });
      } else {
        diff.push({ type: "changed", old: oldLine, new: newLine });
      }
    }

    return diff;
  };

  const diff = viewMode === "diff" ? computeDiff(versionText, currentText) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-3">
            <span className="font-medium text-white">
              Version {version.version_number}
            </span>
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("preview")}
                className={cn(
                  "px-3 py-1 text-xs rounded-md transition",
                  viewMode === "preview"
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                Preview
              </button>
              <button
                onClick={() => setViewMode("diff")}
                className={cn(
                  "px-3 py-1 text-xs rounded-md transition",
                  viewMode === "diff"
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                Diff
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRestore}
              disabled={isRestoring}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg transition disabled:opacity-50"
            >
              {isRestoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Restore
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {viewMode === "preview" && (
            <div className="prose prose-invert prose-slate max-w-none">
              {/* Render content preview */}
              <ContentPreview content={version.content} />
            </div>
          )}

          {viewMode === "diff" && (
            <div className="font-mono text-sm space-y-0.5">
              <div className="flex items-center gap-4 mb-4 text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-red-900/50 rounded" />
                  <span>Removed (version {version.version_number})</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-900/50 rounded" />
                  <span>Added (current)</span>
                </div>
              </div>
              {diff.map((line, i) => (
                <div key={i}>
                  {line.type === "same" && (
                    <div className="px-2 py-0.5 text-slate-400">{line.old || "\u00A0"}</div>
                  )}
                  {line.type === "removed" && (
                    <div className="px-2 py-0.5 bg-red-900/30 text-red-300 border-l-2 border-red-500">
                      - {line.old}
                    </div>
                  )}
                  {line.type === "added" && (
                    <div className="px-2 py-0.5 bg-green-900/30 text-green-300 border-l-2 border-green-500">
                      + {line.new}
                    </div>
                  )}
                  {line.type === "changed" && (
                    <>
                      <div className="px-2 py-0.5 bg-red-900/30 text-red-300 border-l-2 border-red-500">
                        - {line.old}
                      </div>
                      <div className="px-2 py-0.5 bg-green-900/30 text-green-300 border-l-2 border-green-500">
                        + {line.new}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {diff.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <Check className="h-8 w-8 mx-auto mb-2 text-green-400" />
                  <p>No differences found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Simple Content Preview Component
function ContentPreview({ content }: { content: Record<string, unknown> }) {
  const renderNode = (node: Record<string, unknown>, index: number): React.ReactNode => {
    const type = node.type as string;

    switch (type) {
      case "doc":
        return (
          <div key={index}>
            {Array.isArray(node.content) &&
              node.content.map((child, i) => renderNode(child as Record<string, unknown>, i))}
          </div>
        );

      case "paragraph":
        return (
          <p key={index}>
            {Array.isArray(node.content)
              ? node.content.map((child, i) => renderNode(child as Record<string, unknown>, i))
              : null}
          </p>
        );

      case "heading": {
        const level = (node.attrs as Record<string, unknown>)?.level || 1;
        const Tag = `h${level}` as keyof JSX.IntrinsicElements;
        return (
          <Tag key={index}>
            {Array.isArray(node.content)
              ? node.content.map((child, i) => renderNode(child as Record<string, unknown>, i))
              : null}
          </Tag>
        );
      }

      case "bulletList":
        return (
          <ul key={index}>
            {Array.isArray(node.content) &&
              node.content.map((child, i) => renderNode(child as Record<string, unknown>, i))}
          </ul>
        );

      case "orderedList":
        return (
          <ol key={index}>
            {Array.isArray(node.content) &&
              node.content.map((child, i) => renderNode(child as Record<string, unknown>, i))}
          </ol>
        );

      case "listItem":
        return (
          <li key={index}>
            {Array.isArray(node.content) &&
              node.content.map((child, i) => renderNode(child as Record<string, unknown>, i))}
          </li>
        );

      case "codeBlock":
        return (
          <pre key={index} className="bg-slate-800 p-4 rounded-lg overflow-x-auto">
            <code>
              {Array.isArray(node.content)
                ? node.content.map((child, i) => renderNode(child as Record<string, unknown>, i))
                : null}
            </code>
          </pre>
        );

      case "blockquote":
        return (
          <blockquote key={index}>
            {Array.isArray(node.content) &&
              node.content.map((child, i) => renderNode(child as Record<string, unknown>, i))}
          </blockquote>
        );

      case "text":
        let text = node.text as string;
        const marks = node.marks as Array<Record<string, unknown>> | undefined;

        if (marks) {
          marks.forEach((mark) => {
            const markType = mark.type as string;
            if (markType === "bold") {
              text = `**${text}**`;
            } else if (markType === "italic") {
              text = `*${text}*`;
            } else if (markType === "code") {
              text = `\`${text}\``;
            }
          });
        }

        return <span key={index}>{text}</span>;

      default:
        return null;
    }
  };

  if (!content || typeof content !== "object") {
    return <p className="text-slate-400">No content</p>;
  }

  return <>{renderNode(content, 0)}</>;
}
