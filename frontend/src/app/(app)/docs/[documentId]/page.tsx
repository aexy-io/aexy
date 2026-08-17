"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDocument, useDocumentCodeLinks } from "@/hooks/useDocuments";
import { useAuth } from "@/hooks/useAuth";
import { CollaborativeEditor } from "@/components/docs/CollaborativeEditor";
import { DocumentEditor } from "@/components/docs/DocumentEditor";
import { DocumentBreadcrumb } from "@/components/docs/DocumentBreadcrumb";
import { DocumentComments } from "@/components/docs/DocumentComments";
import { ProposedEditsBanner } from "@/components/docs/ProposedEditsBanner";
import { DocumentProvenance } from "@/components/docs/DocumentProvenance";
import { CodeLinkPanel } from "@/components/docs/CodeLinkPanel";
import { DocumentImprovements } from "@/components/docs/DocumentImprovements";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { DocumentLinkType, documentApi, workspaceApi } from "@/lib/api";

export default function DocumentPage() {
  const params = useParams();
  const documentId = params?.documentId as string;
  const { currentWorkspaceId } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Disable collaboration until WebSocket issues are resolved
  const [collaborationEnabled] = useState(false);

  // Chromeless embed (macOS app): hide the title/breadcrumb header — the native
  // app renders the title and provides navigation.
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    try {
      setEmbedded(
        new URLSearchParams(window.location.search).get("embed") === "true" ||
          window.localStorage.getItem("aexy_embed") === "1"
      );
    } catch {
      /* SSR / no storage */
    }
  }, []);

  const {
    document,
    isLoading,
    error,
    updateContent,
    isUpdating,
  } = useDocument(currentWorkspaceId, documentId);

  // Sync state is rendered by DocumentProvenance, which reads the links
  // directly — the page no longer needs to pre-digest them.
  const { codeLinks } = useDocumentCodeLinks(currentWorkspaceId, documentId);

  // Ownership is only legible if the strip can name a person, and the transfer
  // picker needs somebody to transfer *to* — without this the control renders
  // "Owned" and no way to hand it on, which is a backend endpoint with no
  // doorway. Only fetched when there is a link to own.
  // Where this document publishes itself, if it does. Rendered beside the
  // source it was written from: both answer "how is this page connected to the
  // repository", and splitting them across two panels is how `GitHubSyncPanel`
  // ended up unmounted and forgotten.
  const { data: publishesTo = [] } = useQuery({
    queryKey: ["document", documentId, "github-sync"],
    queryFn: () => documentApi.getGitHubSyncConfigs(currentWorkspaceId!, documentId),
    enabled: Boolean(currentWorkspaceId && documentId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members", currentWorkspaceId],
    queryFn: () => workspaceApi.getMembers(currentWorkspaceId!),
    enabled: Boolean(currentWorkspaceId) && (codeLinks?.length ?? 0) > 0,
    select: (rows) =>
      rows
        .filter((row) => row.status === "active")
        .map((row) => ({ id: row.developer_id, name: row.developer_name })),
  });

  const handleManualSync = useCallback(async () => {
    if (!currentWorkspaceId || !documentId) return;
    try {
      await documentApi.generate(currentWorkspaceId, documentId);
      // The document content is updated server-side; refetch by
      // invalidating the document query via mutate.
      await updateContent.mutateAsync({});
    } catch (err) {
      console.error("Failed to regenerate document:", err);
    }
  }, [currentWorkspaceId, documentId, updateContent]);

  // 433 lines of repository picker that had never been mounted. Generation
  // creates linked documents; a page somebody typed by hand could not be
  // connected to the code it describes from anywhere in the product.
  const [showCodeLink, setShowCodeLink] = useState(false);
  const { createCodeLink } = useDocumentCodeLinks(currentWorkspaceId, documentId);

  const handleLinkToCode = useCallback(
    async (data: {
      repository_id: string;
      path: string;
      link_type: DocumentLinkType;
      branch: string;
    }) => {
      await createCodeLink.mutateAsync(data);
      setShowCodeLink(false);
      toast.success("Linked to code");
    },
    [createCodeLink]
  );

  const [showImprovements, setShowImprovements] = useState(false);

  const handleSave = useCallback(
    async (data: { title?: string; content?: Record<string, unknown> }) => {
      try {
        await updateContent.mutateAsync(data);
      } catch (error) {
        console.error("Failed to save document:", error);
      }
    },
    [updateContent]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="md" label="Loading document" />
          <p className="text-muted-foreground text-sm">Loading document…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Document Not Found</h2>
          <p className="text-muted-foreground text-sm">
            This document may have been deleted or you don&apos;t have access to it.
          </p>
        </div>
      </div>
    );
  }

  if (!document) {
    return null;
  }

  // Use CollaborativeEditor when user is authenticated and collaboration is enabled
  if (collaborationEnabled && user) {
    return (
      <div className="flex flex-col h-full">
        <CollaborativeEditor
          documentId={documentId}
          content={document.content || { type: "doc", content: [] }}
          title={document.title}
          icon={document.icon}
          onSave={handleSave}
          isLoading={isUpdating}
          autoSave={true}
          autoSaveDelay={2000}
          embedded={embedded}
          breadcrumb={embedded ? undefined : <DocumentBreadcrumb workspaceId={currentWorkspaceId} documentId={documentId} />}
          userId={user.id}
          userName={user.name || "Unknown"}
          userEmail={user.email || undefined}
          collaborationEnabled={collaborationEnabled}
        />
      </div>
    );
  }

  // Fallback to regular editor.
  return (
    <div className="flex flex-col h-full">
      {currentWorkspaceId ? (
        <div className="px-4 pt-4 space-y-3">
          {/* Proposed edits — banner is self-hiding when none exist */}
          <ProposedEditsBanner
            workspaceId={currentWorkspaceId}
            documentId={documentId}
            currentContent={document.content}
          />
          {/* Where this document came from, and whether it has fallen behind.
              Only for linked documents — an unlinked one has no source to be
              out of date with. */}
          {/* One statement of sync state, not two. `SyncStatusPanel` said the
              same thing in different words directly beneath this, which is the
              duplicated-rail mistake the comment rail already made once. Its
              one unique affordance — regenerate on demand — moved here. */}
          <DocumentProvenance
            workspaceId={currentWorkspaceId}
            documentId={documentId}
            codeLinks={codeLinks ?? []}
            members={members}
            publishesTo={publishesTo}
            onSync={handleManualSync}
            isSyncing={isUpdating}
          />
        </div>
      ) : null}
      <DocumentEditor
        content={document.content || { type: "doc", content: [] }}
        title={document.title}
        icon={document.icon}
        onSave={handleSave}
        // NOTE: do NOT pass `isLoading={isUpdating}` here.
        // `isUpdating` flips true→false on every keystroke-triggered save
        // because of the debounced autosave inside DocumentEditor. Passing
        // it as `isLoading` makes DocumentEditor render its skeleton on
        // each save, unmounting the TipTap editor and losing the cursor
        // (the symptom: "doc refreshes and cursor becomes deselected
        // after typing"). The page-level initial-load skeleton above
        // already covers the only case where we want to hide the editor.
        // The in-editor save indicator (Cloud / Saved / Saving…) shows
        // save state without unmounting anything.
        autoSave={true}
        autoSaveDelay={1000}
        embedded={embedded}
        // Drives the template empty state. Withheld from the embed, which is a
        // read-only view — offering to rewrite the document there would be odd.
        workspaceId={embedded ? null : currentWorkspaceId}
        // Drives anchored comments. Withheld from the embed for the same reason as
        // the bottom section: an embed is a reader.
        documentId={embedded ? null : documentId}
        breadcrumb={embedded ? undefined : <DocumentBreadcrumb workspaceId={currentWorkspaceId} documentId={documentId} />}
        // Only when unlinked: the provenance strip owns the linked case, and
        // two places to manage one relationship is how the panel got orphaned
        // in the first place.
        onLinkToCode={
          !embedded && currentWorkspaceId && (codeLinks?.length ?? 0) === 0
            ? () => setShowCodeLink(true)
            : undefined
        }
        onImprove={
          !embedded && currentWorkspaceId
            ? () => setShowImprovements(true)
            : undefined
        }
      />
      {currentWorkspaceId && (
        <CodeLinkPanel
          workspaceId={currentWorkspaceId}
          documentId={documentId}
          isOpen={showCodeLink}
          onClose={() => setShowCodeLink(false)}
          onLink={handleLinkToCode}
        />
      )}
      {currentWorkspaceId && (
        <DocumentImprovements
          workspaceId={currentWorkspaceId}
          documentId={documentId}
          isOpen={showImprovements}
          onClose={() => setShowImprovements(false)}
          // Applying queues a proposal, and the banner that shows proposals is
          // above the editor — without this it appears only on the next reload,
          // which reads as the Apply having done nothing.
          onProposed={() =>
            queryClient.invalidateQueries({
              queryKey: ["proposed-edits", currentWorkspaceId, documentId],
            })
          }
        />
      )}
      {/* Comments live under the document rather than in a side panel, and are
          hidden when embedded — an embed is a read-only view of the content, so a
          comment box in it would post to a document the reader may not have open. */}
      {!embedded && (
        <div className="px-4 pb-10 max-w-3xl mx-auto w-full">
          <DocumentComments
            workspaceId={currentWorkspaceId}
            documentId={documentId}
          />
        </div>
      )}
    </div>
  );
}
