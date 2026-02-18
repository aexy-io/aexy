"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { NotionSidebar } from "@/components/docs/sidebar";
import { SearchModal } from "@/components/docs/SearchModal";
import { NotificationInbox } from "@/components/docs/NotificationInbox";
import { useRouter, useParams } from "next/navigation";
import { Building2, Plus } from "lucide-react";

export default function DocsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
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

  // Modal states
  const [showSearch, setShowSearch] = useState(false);
  const [showInbox, setShowInbox] = useState(false);

  // Scroll-aware header state
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollY = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle scroll to show/hide header
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;

    const currentScrollY = contentRef.current.scrollTop;
    const scrollDelta = currentScrollY - lastScrollY.current;

    // Show header when scrolling up, hide when scrolling down
    if (scrollDelta > 10 && currentScrollY > 80) {
      setShowHeader(false);
    } else if (scrollDelta < -10 || currentScrollY < 80) {
      setShowHeader(true);
    }

    lastScrollY.current = currentScrollY;
  }, []);

  // Global keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCreateWorkspace = async () => {
    setIsCreatingWorkspace(true);
    try {
      await createWorkspace({
        name: "My Workspace",
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

  if (!mounted || isLoading || currentWorkspaceLoading || workspacesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Show workspace creation prompt if no workspaces exist
  if (workspaces.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
<div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Building2 className="h-8 w-8 text-primary-400" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">
              Create a Workspace
            </h2>
            <p className="text-muted-foreground mb-6">
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
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Scroll-aware Header */}
      <div
        className={`flex-shrink-0 z-30 transition-all duration-300 ${
          showHeader ? "h-16 opacity-100" : "h-0 opacity-0 overflow-hidden"
        }`}
      >
</div>

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Notion-style Sidebar */}
        <div className="w-60 flex-shrink-0 h-full">
          {currentWorkspaceId && (
            <NotionSidebar
              selectedDocumentId={params?.documentId as string | undefined}
              onOpenSearch={() => setShowSearch(true)}
              onOpenInbox={() => setShowInbox(true)}
            />
          )}
        </div>

        {/* Main Content */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          {children}
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal
        workspaceId={currentWorkspaceId}
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
      />

      {/* Notification Inbox */}
      <NotificationInbox
        workspaceId={currentWorkspaceId}
        isOpen={showInbox}
        onClose={() => setShowInbox(false)}
      />
    </div>
  );
}
