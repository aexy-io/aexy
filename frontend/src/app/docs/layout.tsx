"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { AppHeader } from "@/components/layout/AppHeader";
import { DocumentSidebar } from "@/components/docs/DocumentSidebar";
import { useRouter, useParams } from "next/navigation";
import { Building2, Plus } from "lucide-react";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const {
    currentWorkspaceId,
    currentWorkspaceLoading,
    workspaces,
    workspacesLoading,
    createWorkspace,
    isCreating,
  } = useWorkspace();
  const router = useRouter();
  const params = useParams();
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const handleSelectDocument = (documentId: string) => {
    router.push(`/docs/${documentId}`);
  };

  const handleCreateWorkspace = async () => {
    setIsCreatingWorkspace(true);
    try {
      await createWorkspace({
        name: "My Workspace",
        slug: `workspace-${Date.now()}`,
      });
    } catch (error) {
      console.error("Failed to create workspace:", error);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || currentWorkspaceLoading || workspacesLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  // Show workspace creation prompt if no workspaces exist
  if (workspaces.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <AppHeader user={user} logout={logout} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Building2 className="h-8 w-8 text-primary-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">
              Create a Workspace
            </h2>
            <p className="text-slate-400 mb-6">
              You need a workspace to start creating documentation. Workspaces help you organize documents and collaborate with your team.
            </p>
            <button
              onClick={handleCreateWorkspace}
              disabled={isCreatingWorkspace || isCreating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition disabled:opacity-50"
            >
              {isCreatingWorkspace || isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  Create Workspace
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <AppHeader user={user} logout={logout} />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          {currentWorkspaceId && (
            <DocumentSidebar
              workspaceId={currentWorkspaceId}
              selectedDocumentId={params?.documentId as string | undefined}
              onSelectDocument={handleSelectDocument}
            />
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
