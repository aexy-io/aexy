"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Lock, Users, Loader2, Plus } from "lucide-react";

import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { SidebarNavigation } from "./SidebarNavigation";
import { SidebarSection } from "./SidebarSection";
import { DocumentItem } from "./DocumentItem";
import { SpaceFolderWithData } from "./SpaceFolderWithData";
import { CreateSpaceModal } from "../CreateSpaceModal";
import { useNotionDocs, useDocumentNotifications } from "@/hooks/useNotionDocs";
import { useDocumentSpaces } from "@/hooks/useDocumentSpaces";
import { useWorkspace } from "@/hooks/useWorkspace";

interface NotionSidebarProps {
  selectedDocumentId?: string;
  onOpenSearch: () => void;
  onOpenInbox: () => void;
}

export function NotionSidebar({
  selectedDocumentId,
  onOpenSearch,
  onOpenInbox,
}: NotionSidebarProps) {
  const router = useRouter();
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  // Document spaces
  const {
    spaces,
    createSpace,
    isCreating: isCreatingSpace,
  } = useDocumentSpaces(workspaceId);

  const [showCreateSpaceModal, setShowCreateSpaceModal] = useState(false);

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

  const { unreadCount } = useDocumentNotifications(workspaceId);

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

  // Handle delete
  const handleDelete = (documentId: string) => {
    if (confirm("Are you sure you want to delete this document?")) {
      deleteDocument(documentId);
      if (selectedDocumentId === documentId) {
        router.push("/docs");
      }
    }
  };

  // Handle duplicate
  const handleDuplicate = async (documentId: string) => {
    // TODO: Implement duplicate
    console.log("Duplicate:", documentId);
  };

  // Handle create space
  const handleCreateSpace = async (data: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
  }) => {
    await createSpace(data);
  };

  // Handle manage space
  const handleManageSpace = (spaceId: string) => {
    // TODO: Navigate to space settings or open modal
    console.log("Manage space:", spaceId);
  };

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
      <SidebarNavigation
        onOpenSearch={onOpenSearch}
        onOpenInbox={onOpenInbox}
        unreadCount={unreadCount}
      />

      {/* Divider */}
      <div className="h-px bg-muted/50 mx-3 my-1" />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
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
                    onDuplicate={handleDuplicate}
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
                    onDuplicate={handleDuplicate}
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
                onDuplicate={handleDuplicate}
                onAddDocument={handleCreateSpaceDocument}
                onManageSpace={handleManageSpace}
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
          </>
        )}
      </div>

      {/* Create Space Modal */}
      <CreateSpaceModal
        isOpen={showCreateSpaceModal}
        onClose={() => setShowCreateSpaceModal(false)}
        onCreate={handleCreateSpace}
        isCreating={isCreatingSpace}
      />
    </div>
  );
}
