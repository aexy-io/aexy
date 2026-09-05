"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Lock, Users, Plus, Clock, Upload } from "lucide-react";

import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { SidebarNavigation } from "./SidebarNavigation";
import { SidebarSection } from "./SidebarSection";
import { SidebarAppGroup } from "./SidebarAppGroup";
import { DocumentItem } from "./DocumentItem";
import { SpaceFolderWithData } from "./SpaceFolderWithData";
import { CreateSpaceModal } from "../CreateSpaceModal";
import { ImportWikiModal } from "../ImportWikiModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useNotionDocs } from "@/hooks/useNotionDocs";
import { useDocumentSpaces } from "@/hooks/useDocumentSpaces";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useAppAccess } from "@/hooks/useAppAccess";
import { useSidebarLayout } from "@/hooks/useSidebarLayout";
import { useSidebarPersona } from "@/hooks/useSidebarPersona";
import { useRecentApps } from "@/hooks/useRecentApps";
import { SidebarItemConfig, SIDEBAR_LAYOUTS } from "@/config/sidebarLayouts";
import { SIDEBAR_TO_APP_MAP } from "@/config/appDefinitions";

interface NotionSidebarProps {
  selectedDocumentId?: string;
  onOpenSearch: () => void;
}

export function NotionSidebar({
  selectedDocumentId,
  onOpenSearch,
}: NotionSidebarProps) {
  const router = useRouter();
  const tImport = useTranslations("docs.import");
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { user } = useAuth();

  // The main app sidebar is hidden on /docs routes, so the docs sidebar is
  // the user's only escape hatch to other modules. Mirror the main
  // sidebar's grouping so the user sees the same Engineering / People /
  // Business / etc. structure, plus a "Recent" strip at the top.
  const { layoutConfig: userLayoutConfig } = useSidebarLayout();
  const { filterByPersona } = useSidebarPersona();
  const { hasAppAccess } = useAppAccess(workspaceId, user?.id ?? null);

  // Always use the grouped layout in the docs sidebar — the flat layout
  // would be ~25 ungrouped rows here, which defeats the point.
  const baseLayout = userLayoutConfig.id === "grouped"
    ? userLayoutConfig
    : SIDEBAR_LAYOUTS.grouped;

  const personaConfig = useMemo(
    () => filterByPersona(baseLayout),
    [filterByPersona, baseLayout]
  );

  const filterItemsByAccess = useMemo(() => {
    const filter = (items: SidebarItemConfig[]): SidebarItemConfig[] =>
      items
        .map((item) => ({
          ...item,
          items: item.items ? filter(item.items) : undefined,
        }))
        .filter((item) => {
          const appId = SIDEBAR_TO_APP_MAP[item.href];
          return appId ? hasAppAccess(appId) : true;
        });
    return filter;
  }, [hasAppAccess]);

  // The docs sidebar IS the Knowledge surface — re-listing it here would
  // be tautological. Hide that section entirely.
  const appSections = useMemo(() => {
    return personaConfig.sections
      .filter((s) => s.id !== "knowledge")
      .map((section) => ({
        ...section,
        // Empty-label sections (core/main) get a friendly title.
        label: section.label || "Workspace",
        items: filterItemsByAccess(section.items),
      }))
      .filter((s) => s.items.length > 0);
  }, [personaConfig, filterItemsByAccess]);

  // Recording happens once at the app layout (so visits from any
  // surface count). Here we just read — and hide docs/drive since the
  // user is already inside the docs surface.
  const { recentApps: allRecent } = useRecentApps({
    record: false,
    isAppAccessible: hasAppAccess,
  });
  const recentApps = useMemo(
    () => allRecent.filter((a) => a.id !== "docs" && a.id !== "drive").slice(0, 5),
    [allRecent]
  );

  // Document spaces
  const {
    spaces,
    createSpace,
    isCreating: isCreatingSpace,
  } = useDocumentSpaces(workspaceId);

  const [showCreateSpaceModal, setShowCreateSpaceModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Private and shared documents (not tied to spaces)
  const {
    privateTree,
    sharedTree,
    favorites,
    isLoading,
    toggleFavorite,
    createDocument,
    deleteDocument,
  } = useNotionDocs(workspaceId);

  // Create new private document
  const handleCreatePrivateDocument = async (parentId?: string) => {
    if (!workspaceId) return;
    try {
      const doc = await createDocument({
        title: "Untitled",
        visibility: "private",
        parent_id: parentId,
        // No space_id for private docs
      });
      router.push(`/docs/${doc.id}`);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  };

  // Create new shared document (workspace-level, not tied to any space)
  const handleCreateSharedDocument = async (parentId?: string) => {
    if (!workspaceId) return;
    try {
      const doc = await createDocument({
        title: "Untitled",
        visibility: "workspace",
        parent_id: parentId,
        // No space_id - workspace-level shared doc
      });
      router.push(`/docs/${doc.id}`);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  };

  // Create new document in a space
  const handleCreateSpaceDocument = async (spaceId: string, parentId?: string) => {
    if (!workspaceId) return;
    try {
      const doc = await createDocument({
        title: "Untitled",
        visibility: "workspace",
        parent_id: parentId,
        space_id: spaceId,
      });
      router.push(`/docs/${doc.id}`);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  };

  // Open the styled confirm dialog. window.confirm() is deliberately
  // gone — it broke visual consistency with the dark theme and
  // couldn't be styled. Recursive child rows reach this same handler,
  // so we resolve the title lazily from id rather than capturing it
  // in a parent closure.
  const handleDelete = (documentId: string) => {
    setPendingDeleteId(documentId);
  };

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    deleteDocument(pendingDeleteId);
    if (selectedDocumentId === pendingDeleteId) {
      router.push("/docs");
    }
    setPendingDeleteId(null);
  };

  // `handleDuplicate` used to be wired here as a `console.log` TODO.
  // Inert affordances are worse than missing ones — DocumentItem's
  // dropdown hides the Duplicate row when `onDuplicate` is undefined,
  // so we just don't pass a handler until duplication is implemented.

  // Handle create space
  const handleCreateSpace = async (data: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
  }) => {
    await createSpace(data);
  };

  // `handleManageSpace` used to be wired here as a TODO. SpaceFolder's
  // onManageSpace prop is optional and the dropdown row hides when it's
  // absent — so we just don't pass one until space-settings ships.

  // Render empty state
  const EmptyState = ({ message }: { message: string }) => (
    <div className="px-4 py-3 text-xs text-muted-foreground text-center">
      {message}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-card border-r border-border/50">
      {/* Workspace Switcher */}
      <div className="p-2 border-b border-border/50">
        <WorkspaceSwitcher
          workspaces={workspaces || []}
          currentWorkspace={currentWorkspace ?? null}
          onSwitch={switchWorkspace}
        />
      </div>

      {/* Navigation */}
      <SidebarNavigation onOpenSearch={onOpenSearch} />

      {/* Divider */}
      <div className="h-px bg-muted/50 mx-3 my-1" />

      {/* Scrollable Content — role=tree so assistive tech recognises
          the hierarchical doc list and surfaces aria-selected on rows. */}
      <div
        className="flex-1 overflow-y-auto"
        role="tree"
        aria-label="Documents"
      >
        {isLoading ? (
          <div className="space-y-1 px-2 py-2 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <div className="h-4 w-4 bg-accent rounded" />
                <div className="h-3 w-24 bg-accent rounded" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Favorites Section */}
            {favorites.length > 0 && (
              <SidebarSection
                title="Favorites"
                icon={<Star className="h-3.5 w-3.5" />}
                count={favorites.length}
              >
                {favorites.map((doc) => (
                  <DocumentItem
                    key={doc.id}
                    document={doc}
                    isSelected={selectedDocumentId === doc.id}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </SidebarSection>
            )}

            {/* Private Section - Personal pages, not tied to any space */}
            <SidebarSection
              title="Private"
              icon={<Lock className="h-3.5 w-3.5" />}
              onAdd={() => handleCreatePrivateDocument()}
              addTooltip="Add private page"
              count={privateTree.length}
            >
              {privateTree.length > 0 ? (
                privateTree.map((doc) => (
                  <DocumentItem
                    key={doc.id}
                    document={doc}
                    isSelected={selectedDocumentId === doc.id}
                    onToggleFavorite={toggleFavorite}
                    onDelete={handleDelete}
                    onAddChild={(parentId) =>
                      handleCreatePrivateDocument(parentId)
                    }
                  />
                ))
              ) : (
                <EmptyState message="No private pages yet" />
              )}
            </SidebarSection>

            {/* Shared Section - Workspace-level shared docs, not tied to any space */}
            <SidebarSection
              title="Shared"
              icon={<Users className="h-3.5 w-3.5" />}
              onAdd={() => handleCreateSharedDocument()}
              addTooltip="Add shared page"
              count={sharedTree.length}
            >
              {sharedTree.length > 0 ? (
                sharedTree.map((doc) => (
                  <DocumentItem
                    key={doc.id}
                    document={doc}
                    isSelected={selectedDocumentId === doc.id}
                    onToggleFavorite={toggleFavorite}
                    onDelete={handleDelete}
                    onAddChild={(parentId) =>
                      handleCreateSharedDocument(parentId)
                    }
                  />
                ))
              ) : (
                <EmptyState message="No shared pages yet" />
              )}
            </SidebarSection>

            {/* Divider before spaces */}
            <div className="h-px bg-muted/50 mx-3 my-2" />

            {/* Space Folders - Each space as a collapsible folder */}
            {spaces.map((space) => (
              <SpaceFolderWithData
                key={space.id}
                workspaceId={workspaceId!}
                space={space}
                selectedDocumentId={selectedDocumentId}
                defaultExpanded={spaces.length === 1}
                onToggleFavorite={toggleFavorite}
                onDelete={handleDelete}
                onAddDocument={handleCreateSpaceDocument}
              />
            ))}

            {/* Create Space Button */}
            <div className="px-2 py-1">
              <button
                onClick={() => setShowCreateSpaceModal(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50 rounded-md transition-colors text-muted-foreground hover:text-muted-foreground"
              >
                <div className="h-5 w-5 rounded border border-dashed border-border flex items-center justify-center">
                  <Plus className="h-3 w-3" />
                </div>
                <span className="text-xs">Add space</span>
              </button>
            </div>

            {/* Import an exported wiki. Beside "Add space" because that is
                where somebody arriving with a Notion or Confluence export is
                already looking — they are trying to make a space, and what
                they actually want is to bring one across. */}
            <div className="px-2 py-1">
              <button
                onClick={() => setShowImportModal(true)}
                data-testid="sidebar-import-wiki"
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50 rounded-md transition-colors text-muted-foreground hover:text-muted-foreground"
              >
                <div className="h-5 w-5 rounded border border-dashed border-border flex items-center justify-center">
                  <Upload className="h-3 w-3" />
                </div>
                <span className="text-xs">{tImport("sidebarAction")}</span>
              </button>
            </div>

            {/* Divider before apps */}
            <div className="h-px bg-muted/50 mx-3 my-2" />

            {/* Recent apps — opens expanded so the most-recent jumps are
                one click away. Hidden entirely on first run when the
                visit log is empty. */}
            {recentApps.length > 0 && (
              <SidebarSection
                title="Recent"
                icon={<Clock className="h-3.5 w-3.5" />}
                count={recentApps.length}
                defaultExpanded={true}
              >
                {recentApps.map((app) => {
                  const Icon = app.icon;
                  return (
                    <Link
                      key={app.id}
                      href={app.baseRoute}
                      className="flex items-center gap-2 px-2 py-1.5 mx-1 hover:bg-accent/50 rounded-md transition-colors text-foreground/80 hover:text-foreground text-sm"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{app.name}</span>
                    </Link>
                  );
                })}
              </SidebarSection>
            )}

            {/* App sections — same structure as the main sidebar,
                collapsed by default so the docs surface stays focused. */}
            {appSections.map((section) => (
              <SidebarSection
                key={section.id}
                title={section.label}
                count={section.items.length}
                defaultExpanded={false}
              >
                {section.items.map((item) =>
                  item.items && item.items.length > 0 ? (
                    <SidebarAppGroup
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      subItems={item.items}
                    />
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 px-2 py-1.5 mx-1 hover:bg-accent/50 rounded-md transition-colors text-foreground/80 hover:text-foreground text-sm"
                    >
                      <item.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )
                )}
              </SidebarSection>
            ))}
          </>
        )}
      </div>

      {workspaceId && (
        <ImportWikiModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          workspaceId={workspaceId}
          spaces={spaces || []}
        />
      )}

      {/* Create Space Modal */}
      <CreateSpaceModal
        isOpen={showCreateSpaceModal}
        onClose={() => setShowCreateSpaceModal(false)}
        onCreate={handleCreateSpace}
        isCreating={isCreatingSpace}
      />

      {/* Styled delete confirmation — replaces window.confirm() */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete document?"
        description="This document and any child pages will be moved to trash. This can't be undone from the sidebar."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
