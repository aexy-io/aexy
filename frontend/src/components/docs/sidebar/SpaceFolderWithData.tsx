"use client";

import { DocumentSpaceListItem } from "@/lib/api";
import { useSpaceDocuments } from "@/hooks/useNotionDocs";
import { SpaceFolder } from "./SpaceFolder";

interface SpaceFolderWithDataProps {
  workspaceId: string;
  space: DocumentSpaceListItem;
  selectedDocumentId?: string;
  defaultExpanded?: boolean;
  onToggleFavorite: (documentId: string) => void;
  onDelete: (documentId: string) => void;
  // Optional: NotionSidebar deliberately passes no duplicate handler until
  // duplication is implemented, and DocumentItem hides the Duplicate row when
  // it is absent. Requiring it here made that decision a type error.
  onDuplicate?: (documentId: string) => void;
  onAddDocument: (spaceId: string, parentId?: string) => void;
  onManageSpace?: (spaceId: string) => void;
}

export function SpaceFolderWithData({
  workspaceId,
  space,
  selectedDocumentId,
  defaultExpanded = true,
  onToggleFavorite,
  onDelete,
  onDuplicate,
  onAddDocument,
  onManageSpace,
}: SpaceFolderWithDataProps) {
  const { documents, isLoading } = useSpaceDocuments(workspaceId, space.id);

  return (
    <SpaceFolder
      space={space}
      documents={documents}
      selectedDocumentId={selectedDocumentId}
      isLoading={isLoading}
      defaultExpanded={defaultExpanded}
      onToggleFavorite={onToggleFavorite}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onAddDocument={onAddDocument}
      onManageSpace={onManageSpace}
    />
  );
}
