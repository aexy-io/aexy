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
  onDuplicate: (documentId: string) => void;
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
