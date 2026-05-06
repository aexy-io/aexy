"use client";

import { ArrowLeft, Loader2, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useSmartViewFiles,
  useSmartViews,
} from "@/hooks/useDrive";

import { FileCard } from "@/components/drive/FileCard";
import { SmartViewEditor } from "@/components/drive/SmartViewEditor";

export default function SmartViewPage() {
  const router = useRouter();
  const params = useParams<{ viewId: string }>();
  const { currentWorkspaceId } = useWorkspace();

  const viewsQ = useSmartViews(currentWorkspaceId);
  const filesQ = useSmartViewFiles(currentWorkspaceId, params.viewId);
  const [editing, setEditing] = useState(false);

  const view = viewsQ.data?.smart_views.find((v) => v.id === params.viewId);

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/docs/drive"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Drive
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Sparkles className="h-5 w-5 text-primary-400" />
          {view?.name ?? "Smart view"}
        </h1>
        {view && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm hover:bg-muted/60"
          >
            <Settings className="h-3.5 w-3.5" />
            Edit filter
          </button>
        )}
      </div>

      {filesQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (filesQ.data?.files.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files match this smart view's filter.
        </p>
      ) : (
        <ul
          data-testid="drive-smart-view-files"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {filesQ.data?.files.map((f) => (
            <li key={f.id}>
              <FileCard
                file={f}
                onClick={() => router.push(`/docs/drive/${f.id}`)}
              />
            </li>
          ))}
        </ul>
      )}

      {editing && view && (
        <SmartViewEditor
          workspaceId={currentWorkspaceId}
          view={view}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
