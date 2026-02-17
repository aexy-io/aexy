"use client";

import { useState } from "react";
import {
  Link as LinkIcon,
  GitBranch,
  File,
  Folder,
  AlertTriangle,
  CheckCircle,
  Trash2,
  RefreshCw,
  ExternalLink,
  Plus,
  Loader2,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { DocumentCodeLink } from "@/lib/api";

interface CodeLinksDisplayProps {
  workspaceId: string;
  documentId: string;
  codeLinks: DocumentCodeLink[];
  isLoading: boolean;
  onAddLink: () => void;
  onDeleteLink: (linkId: string) => Promise<void>;
  onRegenerate?: (linkId: string) => Promise<void>;
}

export function CodeLinksDisplay({
  workspaceId,
  documentId,
  codeLinks,
  isLoading,
  onAddLink,
  onDeleteLink,
  onRegenerate,
}: CodeLinksDisplayProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const handleDelete = async (linkId: string) => {
    if (!confirm("Are you sure you want to remove this code link?")) return;

    setDeletingId(linkId);
    try {
      await onDeleteLink(linkId);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRegenerate = async (linkId: string) => {
    if (!onRegenerate) return;

    setRegeneratingId(linkId);
    try {
      await onRegenerate(linkId);
    } finally {
      setRegeneratingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-background/50 border-b border-border">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Linked Code</span>
          {codeLinks.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {codeLinks.length}
            </span>
          )}
        </div>
        <button
          onClick={onAddLink}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-primary-400 hover:text-primary-300 hover:bg-primary-900/30 rounded-lg transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Link
        </button>
      </div>

      {/* Links List */}
      {codeLinks.length === 0 ? (
        <div className="p-6 text-center">
          <LinkIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            No code linked to this document
          </p>
          <button
            onClick={onAddLink}
            className="text-sm text-primary-400 hover:text-primary-300"
          >
            Link source code to enable auto-generation
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {codeLinks.map((link) => (
            <div
              key={link.id}
              className="px-4 py-3 hover:bg-muted/30 transition"
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="p-2 bg-muted rounded-lg shrink-0">
                  {link.link_type === "directory" ? (
                    <Folder className="h-4 w-4 text-blue-400" />
                  ) : (
                    <File className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground truncate">
                      {link.path}
                    </span>
                    {link.has_pending_changes && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded">
                        <AlertTriangle className="h-3 w-3" />
                        Changes
                      </span>
                    )}
                    {!link.has_pending_changes && link.last_synced_at && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded">
                        <CheckCircle className="h-3 w-3" />
                        Synced
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {link.repository_name && (
                      <span className="flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        {link.repository_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {link.branch || "main"}
                    </span>
                    {link.last_synced_at && (
                      <span>
                        Synced {formatRelativeTime(link.last_synced_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {onRegenerate && link.has_pending_changes && (
                    <button
                      onClick={() => handleRegenerate(link.id)}
                      disabled={regeneratingId === link.id}
                      className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition disabled:opacity-50"
                      title="Regenerate from updated code"
                    >
                      {regeneratingId === link.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(link.id)}
                    disabled={deletingId === link.id}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                    title="Remove link"
                  >
                    {deletingId === link.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Pending Changes Warning */}
              {link.has_pending_changes && (
                <div className="mt-2 ml-11 p-2 bg-amber-900/10 border border-amber-800/30 rounded-lg">
                  <p className="text-xs text-amber-400">
                    The linked code has changed. Regenerate the documentation to sync.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
