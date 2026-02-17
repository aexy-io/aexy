"use client";

import Link from "next/link";
import { Home, ChevronRight } from "lucide-react";
import { useDocumentBreadcrumbs } from "@/hooks/useNotionDocs";

interface DocumentBreadcrumbProps {
  workspaceId: string | null;
  documentId: string;
}

export function DocumentBreadcrumb({
  workspaceId,
  documentId,
}: DocumentBreadcrumbProps) {
  const { ancestors, isLoading } = useDocumentBreadcrumbs(workspaceId, documentId);

  if (isLoading) {
    return (
      <nav className="flex items-center gap-1.5 text-sm">
        <Link
          href="/docs"
          className="p-1 hover:bg-muted/50 rounded transition-colors text-muted-foreground hover:text-foreground"
        >
          <Home className="h-4 w-4" />
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="h-4 w-24 bg-muted rounded animate-pulse" />
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link
        href="/docs"
        className="p-1 hover:bg-muted/50 rounded transition-colors text-muted-foreground hover:text-foreground"
        title="Home"
      >
        <Home className="h-4 w-4" />
      </Link>

      {ancestors.map((ancestor) => (
        <div key={ancestor.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <Link
            href={`/docs/${ancestor.id}`}
            className="flex items-center gap-1.5 px-1.5 py-0.5 hover:bg-muted/50 rounded transition-colors text-muted-foreground hover:text-foreground truncate max-w-[150px]"
          >
            {ancestor.icon && (
              <span className="text-sm flex-shrink-0">{ancestor.icon}</span>
            )}
            <span className="truncate">{ancestor.title || "Untitled"}</span>
          </Link>
        </div>
      ))}
    </nav>
  );
}
