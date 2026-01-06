"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDocument } from "@/hooks/useDocuments";
import { useAuth } from "@/hooks/useAuth";
import { CollaborativeEditor } from "@/components/docs/CollaborativeEditor";
import { DocumentEditor } from "@/components/docs/DocumentEditor";
import { DocumentBreadcrumb } from "@/components/docs/DocumentBreadcrumb";

export default function DocumentPage() {
  const params = useParams();
  const documentId = params?.documentId as string;
  const { currentWorkspaceId } = useWorkspace();
  const { user } = useAuth();
  // Disable collaboration until WebSocket issues are resolved
  const [collaborationEnabled] = useState(false);

  const {
    document,
    isLoading,
    error,
    updateContent,
    isUpdating,
  } = useDocument(currentWorkspaceId, documentId);

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
          <div className="relative">
            <div className="w-10 h-10 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Document Not Found</h2>
          <p className="text-slate-400 text-sm">
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
        <header className="flex items-center px-3 py-3 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-sm">
          <DocumentBreadcrumb workspaceId={currentWorkspaceId} documentId={documentId} />
        </header>
        <div className="flex-1 overflow-hidden">
          <CollaborativeEditor
            documentId={documentId}
            content={document.content || { type: "doc", content: [] }}
            title={document.title}
            icon={document.icon}
            onSave={handleSave}
            isLoading={isUpdating}
            autoSave={true}
            autoSaveDelay={2000}
            userId={user.id}
            userName={user.name || "Unknown"}
            userEmail={user.email || undefined}
            collaborationEnabled={collaborationEnabled}
          />
        </div>
      </div>
    );
  }

  // Fallback to regular editor
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center px-6 py-3 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-sm">
        <DocumentBreadcrumb workspaceId={currentWorkspaceId} documentId={documentId} />
      </header>
      <div className="flex-1 overflow-hidden">
        <DocumentEditor
          content={document.content || { type: "doc", content: [] }}
          title={document.title}
          icon={document.icon}
          onSave={handleSave}
          isLoading={isUpdating}
          autoSave={true}
          autoSaveDelay={1000}
        />
      </div>
    </div>
  );
}
