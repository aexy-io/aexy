"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { NotionSidebar } from "@/components/docs/sidebar";
import { SearchModal } from "@/components/docs/SearchModal";
import { Spinner } from "@/components/ui/spinner";
import { useRouter, useParams } from "next/navigation";
import { Plus, Menu, X } from "lucide-react";

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
  // Mobile drawer state — desktop ignores this; the sidebar is always
  // visible there. Below `md` we hide the sidebar off-screen and a
  // hamburger toggles it.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  // Chromeless / embedded mode (macOS app): hide the docs NotionSidebar + top
  // bar so the embed is editor-only (the native app provides the doc tree).
  const [embedded, setEmbedded] = useState(false);

  // Handle hydration
  useEffect(() => {
    setMounted(true);
    try {
      setEmbedded(
        new URLSearchParams(window.location.search).get("embed") === "true" ||
          window.localStorage.getItem("aexy_embed") === "1"
      );
    } catch {
      /* SSR / no storage */
    }
  }, []);

  // Cmd+K in /docs scope must reach the doc-scoped SearchModal, not
  // the app-shell global CommandPalette. Both listen on `document`;
  // without `capture: true` + stopImmediatePropagation the global wins
  // (it's mounted earlier in the layout tree). Capture phase here runs
  // BEFORE the bubble-phase listeners the global hook installs.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setShowSearch((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  // Close the mobile drawer whenever the route changes — without this
  // the drawer stays open after picking a doc from the sidebar.
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [params?.documentId]);

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
      <div className="min-h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Show workspace creation prompt if no workspaces exist.
  // Typography-first: an eyebrow label, a confident headline, one
  // line of supporting copy, one primary action. No decorative
  // gradient square — that pattern was the audit's strongest
  // AI-slop tell and added nothing the headline doesn't.
  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-lg mx-auto">
            <p className="text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground mb-4">
              First step
            </p>
            <h2 className="text-4xl md:text-5xl font-semibold text-foreground tracking-tight mb-4">
              Set up your workspace
            </h2>
            <p className="text-muted-foreground text-base mb-8 max-w-md mx-auto">
              Workspaces are where your docs live. Set one up to start
              writing, organising, and sharing with your team.
            </p>
            <button
              onClick={handleCreateWorkspace}
              disabled={isCreatingWorkspace || isCreating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition disabled:opacity-50"
            >
              {isCreatingWorkspace || isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  Create workspace
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Editor-only: the native app's tree is the sole navigation.
  if (embedded) {
    return <div className="h-screen bg-background overflow-y-auto">{children}</div>;
  }

  return (
    <div className="h-screen bg-background flex flex-col md:flex-row overflow-hidden">
      {/* Mobile top bar — visible below md, holds the docs-scoped
          hamburger. Sits to the right of pl-14 so the app-shell's
          fixed top-left sidebar trigger (also at top-4 left-4) doesn't
          overlap the docs hamburger. */}
      <div className="md:hidden flex items-center gap-2 pl-14 pr-3 h-12 border-b border-border/50 bg-background/95 backdrop-blur-xl flex-shrink-0">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open docs sidebar"
          data-testid="docs-mobile-menu-trigger"
          className="p-2 hover:bg-accent rounded-lg transition"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>
        <span className="text-foreground font-semibold text-sm">Docs</span>
      </div>

      {/* Mobile backdrop — only renders when drawer is open. */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Main Layout — sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar:
            - desktop (md+): static 240px column
            - mobile: fixed-position drawer, translated off-screen until open */}
        <div
          data-testid="docs-sidebar"
          className={`w-60 flex-shrink-0 h-full bg-card transition-transform duration-200
            fixed inset-y-0 left-0 z-50 md:relative md:translate-x-0
            ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}
        >
          {/* Mobile-only close affordance inside the drawer */}
          <div className="md:hidden flex justify-end px-2 pt-2">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close sidebar"
              className="p-2 hover:bg-accent rounded-lg transition"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          {currentWorkspaceId && (
            <NotionSidebar
              selectedDocumentId={params?.documentId as string | undefined}
              onOpenSearch={() => setShowSearch(true)}
            />
          )}
        </div>

        {/* Main Content */}
        <div
          ref={contentRef}
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
    </div>
  );
}
