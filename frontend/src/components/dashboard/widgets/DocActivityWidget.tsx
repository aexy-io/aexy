"use client";

import Link from "next/link";
import { Activity, ChevronRight, FileText, Clock } from "lucide-react";
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

export function DocActivityWidget() {
  const { currentWorkspace } = useWorkspace();
  const { documentTree, isLoadingTree } = useDocuments(
    currentWorkspace?.id || null
  );

  if (isLoadingTree) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const allDocs = documentTree ? flattenTree(documentTree) : [];
  const totalCount = allDocs.length;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentlyUpdated = allDocs.filter(
    (doc) => new Date(doc.updated_at) >= sevenDaysAgo
  ).length;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-violet-500/10 rounded-lg shrink-0">
            <Activity className="h-4 w-4 text-violet-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">
            Doc Activity
          </h3>
        </div>
        <Link
          href="/docs"
          className="text-violet-400 hover:text-violet-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view document activity.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-2">
                <FileText className="h-3 w-3 text-violet-400" />
                <span className="text-xs text-muted-foreground">
                  Total Documents
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totalCount}</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-2">
                <Clock className="h-3 w-3 text-violet-400" />
                <span className="text-xs text-muted-foreground">
                  Updated (7d)
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {recentlyUpdated}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
