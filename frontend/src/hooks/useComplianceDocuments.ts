"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import {
  complianceDocumentsApi,
  complianceFoldersApi,
  ComplianceDocument,
  ComplianceDocumentCreate,
  ComplianceDocumentUpdate,
  ComplianceDocumentStatus,
  ComplianceEntityType,
  ComplianceLinkType,
  ComplianceFolderCreate,
  ComplianceFolderUpdate,
} from "@/lib/api";

// ==========================================
// Document Hooks
// ==========================================

export function useComplianceDocuments(
  workspaceId: string | null,
  params?: {
    folder_id?: string;
    status?: ComplianceDocumentStatus;
    mime_type?: string;
    tags?: string;
    search?: string;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_order?: string;
  }
) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance-documents", workspaceId, params],
    queryFn: () => complianceDocumentsApi.list(workspaceId!, params),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (docData: ComplianceDocumentCreate) =>
      complianceDocumentsApi.create(workspaceId!, docData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-documents", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["compliance-folder-tree", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ documentId, data }: { documentId: string; data: ComplianceDocumentUpdate }) =>
      complianceDocumentsApi.update(workspaceId!, documentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-documents", workspaceId] });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ documentId, folderId }: { documentId: string; folderId: string | null }) =>
      complianceDocumentsApi.move(workspaceId!, documentId, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-documents", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["compliance-folder-tree", workspaceId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (documentId: string) =>
      complianceDocumentsApi.archive(workspaceId!, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-documents", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) =>
      complianceDocumentsApi.delete(workspaceId!, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-documents", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["compliance-folder-tree", workspaceId] });
    },
  });

  return {
    documents: data?.items || [],
    total: data?.total || 0,
    page: data?.page || 1,
    pageSize: data?.page_size || 20,
    isLoading,
    error,
    createDocument: createMutation.mutateAsync,
    updateDocument: updateMutation.mutateAsync,
    moveDocument: moveMutation.mutateAsync,
    archiveDocument: archiveMutation.mutateAsync,
    deleteDocument: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

export function useComplianceDocument(workspaceId: string | null, documentId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance-document", workspaceId, documentId],
    queryFn: () => complianceDocumentsApi.get(workspaceId!, documentId!),
    enabled: !!workspaceId && !!documentId,
  });

  return { document: data, isLoading, error };
}

// ==========================================
// Folder Hooks
// ==========================================

export function useComplianceFolders(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const { data: folders, isLoading } = useQuery({
    queryKey: ["compliance-folders", workspaceId],
    queryFn: () => complianceFoldersApi.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: tree, isLoading: treeLoading } = useQuery({
    queryKey: ["compliance-folder-tree", workspaceId],
    queryFn: () => complianceFoldersApi.getTree(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: ComplianceFolderCreate) =>
      complianceFoldersApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-folders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["compliance-folder-tree", workspaceId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ folderId, data }: { folderId: string; data: ComplianceFolderUpdate }) =>
      complianceFoldersApi.update(workspaceId!, folderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-folders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["compliance-folder-tree", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (folderId: string) =>
      complianceFoldersApi.delete(workspaceId!, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-folders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["compliance-folder-tree", workspaceId] });
    },
  });

  return {
    folders: folders || [],
    tree: tree || [],
    isLoading,
    treeLoading,
    createFolder: createMutation.mutateAsync,
    updateFolder: updateMutation.mutateAsync,
    deleteFolder: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}

// ==========================================
// Tag Hooks
// ==========================================

export function useComplianceTags(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["compliance-tags", workspaceId],
    queryFn: () => complianceDocumentsApi.listWorkspaceTags(workspaceId!),
    enabled: !!workspaceId,
  });

  const addTagsMutation = useMutation({
    mutationFn: ({ documentId, tags }: { documentId: string; tags: string[] }) =>
      complianceDocumentsApi.addTags(workspaceId!, documentId, tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-tags", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["compliance-documents", workspaceId] });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: ({ documentId, tag }: { documentId: string; tag: string }) =>
      complianceDocumentsApi.removeTag(workspaceId!, documentId, tag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-tags", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["compliance-documents", workspaceId] });
    },
  });

  return {
    tags: data?.tags || [],
    isLoading,
    addTags: addTagsMutation.mutateAsync,
    removeTag: removeTagMutation.mutateAsync,
  };
}

// ==========================================
// Link Hooks
// ==========================================

export function useComplianceDocumentLinks(workspaceId: string | null, documentId: string | null) {
  const queryClient = useQueryClient();

  const { data: links, isLoading } = useQuery({
    queryKey: ["compliance-doc-links", workspaceId, documentId],
    queryFn: () => complianceDocumentsApi.getDocumentLinks(workspaceId!, documentId!),
    enabled: !!workspaceId && !!documentId,
  });

  const linkMutation = useMutation({
    mutationFn: (data: {
      entity_type: ComplianceEntityType;
      entity_id: string;
      link_type?: ComplianceLinkType;
      notes?: string;
    }) => complianceDocumentsApi.linkDocument(workspaceId!, documentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-doc-links", workspaceId, documentId] });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) =>
      complianceDocumentsApi.unlinkDocument(workspaceId!, documentId!, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-doc-links", workspaceId, documentId] });
    },
  });

  return {
    links: links || [],
    isLoading,
    linkDocument: linkMutation.mutateAsync,
    unlinkDocument: unlinkMutation.mutateAsync,
  };
}

export function useEntityDocuments(
  workspaceId: string | null,
  entityType: ComplianceEntityType | null,
  entityId: string | null
) {
  const { data, isLoading } = useQuery({
    queryKey: ["compliance-entity-docs", workspaceId, entityType, entityId],
    queryFn: () => complianceDocumentsApi.getEntityDocuments(workspaceId!, entityType!, entityId!),
    enabled: !!workspaceId && !!entityType && !!entityId,
  });

  return {
    documents: data?.documents || [],
    links: data?.links || [],
    isLoading,
  };
}

// ==========================================
// Upload Hook
// ==========================================

export function useDocumentUpload(workspaceId: string | null) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const upload = useCallback(
    async (
      file: File,
      metadata: { name?: string; description?: string; folder_id?: string; tags?: string[] }
    ): Promise<ComplianceDocument | null> => {
      if (!workspaceId) return null;

      setUploading(true);
      setProgress(0);
      setError(null);

      try {
        setProgress(10);

        // Direct upload through backend (avoids presigned URL browser issues)
        const document = await complianceDocumentsApi.uploadDirect(
          workspaceId,
          file,
          {
            name: metadata.name || file.name,
            description: metadata.description,
            folder_id: metadata.folder_id,
            tags: metadata.tags,
          }
        );

        setProgress(100);

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ["compliance-documents", workspaceId] });
        queryClient.invalidateQueries({ queryKey: ["compliance-folder-tree", workspaceId] });

        return document;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [workspaceId, queryClient]
  );

  return {
    upload,
    uploading,
    progress,
    error,
  };
}
