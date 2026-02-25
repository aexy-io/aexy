"use client";

import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDocuments } from "@/hooks/useDocuments";
import { DocumentTreeItem } from "@/lib/api";

function flattenTree(items: DocumentTreeItem[]): DocumentTreeItem[] {
  const result: DocumentTreeItem[] = [];
  for (const item of items) {
    result.push(item);
    if (item.children && item.children.length > 0) {
      result.push(...flattenTree(item.children));
    }
  }
  return result;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

export function RecentDocsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { documentTree, isLoadingTree } = useDocuments(
    currentWorkspace?.id || null
  );

  if (isLoadingTree) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const allDocs = documentTree ? flattenTree(documentTree) : [];
  const recentDocs = [...allDocs]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 5);

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <FileText className="h-5 w-5 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Recent Docs
          </h3>
        </div>
        <Link
          href="/docs"
          className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-4 space-y-2">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view documents.
            </p>
          </div>
        ) : recentDocs.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No documents yet
          </p>
        ) : (
          recentDocs.map((doc) => (
            <Link
              key={doc.id}
              href={`/docs/${doc.id}`}
              className="flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                {doc.icon ? (
                  <span className="text-base flex-shrink-0">{doc.icon}</span>
                ) : (
                  <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />
                )}
                <span className="text-sm text-foreground truncate">
                  {doc.title}
                </span>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                {formatRelativeTime(doc.updated_at)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
