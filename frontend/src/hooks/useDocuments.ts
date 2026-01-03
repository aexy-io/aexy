"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  documentApi,
  templateApi,
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentTreeItem,
  DocumentVersion,
  DocumentCodeLink,
  DocumentCollaborator,
  DocumentLinkType,
  DocumentPermission,
  TemplateListItem,
  DocumentTemplate,
  TemplateCategory,
} from "@/lib/api";

// ==================== Document Hooks ====================

export function useDocuments(workspaceId: string | null) {
  const queryClient = useQueryClient();

  // Get document tree
  const {
    data: documentTree,
    isLoading: isLoadingTree,
    error: treeError,
  } = useQuery<DocumentTreeItem[]>({
    queryKey: ["documents", "tree", workspaceId],
    queryFn: () => documentApi.getTree(workspaceId!),
    enabled: !!workspaceId,
  });

  // Create document
  const createDocument = useMutation({
    mutationFn: (data: DocumentCreate) => documentApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", "tree", workspaceId] });
    },
  });

  // Update document
  const updateDocument = useMutation({
    mutationFn: ({ documentId, data }: { documentId: string; data: DocumentUpdate }) =>
      documentApi.update(workspaceId!, documentId, data),
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["documents", "tree", workspaceId] });
    },
  });

  // Delete document
  const deleteDocument = useMutation({
    mutationFn: (documentId: string) => documentApi.delete(workspaceId!, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", "tree", workspaceId] });
    },
  });

  // Move document
  const moveDocument = useMutation({
    mutationFn: ({
      documentId,
      newParentId,
      position,
    }: {
      documentId: string;
      newParentId?: string;
      position: number;
    }) => documentApi.move(workspaceId!, documentId, { new_parent_id: newParentId, position }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", "tree", workspaceId] });
    },
  });

  // Duplicate document
  const duplicateDocument = useMutation({
    mutationFn: ({ documentId, includeChildren }: { documentId: string; includeChildren?: boolean }) =>
      documentApi.duplicate(workspaceId!, documentId, includeChildren),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", "tree", workspaceId] });
    },
  });

  // Search documents
  const searchDocuments = useCallback(
    async (query: string) => {
      if (!workspaceId) return [];
      return documentApi.list(workspaceId, { search: query });
    },
    [workspaceId]
  );

  return {
    documentTree,
    isLoadingTree,
    treeError,
    createDocument,
    updateDocument,
    deleteDocument,
    moveDocument,
    duplicateDocument,
    searchDocuments,
    isCreating: createDocument.isPending,
    isUpdating: updateDocument.isPending,
    isDeleting: deleteDocument.isPending,
  };
}

// ==================== Single Document Hook ====================

export function useDocument(workspaceId: string | null, documentId: string | null) {
  const queryClient = useQueryClient();

  // Get document
  const {
    data: document,
    isLoading,
    error,
  } = useQuery<Document>({
    queryKey: ["document", documentId],
    queryFn: () => documentApi.get(workspaceId!, documentId!),
    enabled: !!workspaceId && !!documentId,
  });

  // Update document content
  const updateContent = useMutation({
    mutationFn: (data: DocumentUpdate) => documentApi.update(workspaceId!, documentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
    },
  });

  // Get version history
  const {
    data: versions,
    isLoading: isLoadingVersions,
  } = useQuery<DocumentVersion[]>({
    queryKey: ["document", documentId, "versions"],
    queryFn: () => documentApi.getVersions(workspaceId!, documentId!),
    enabled: !!workspaceId && !!documentId,
  });

  // Restore version
  const restoreVersion = useMutation({
    mutationFn: (versionId: string) => documentApi.restoreVersion(workspaceId!, documentId!, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["document", documentId, "versions"] });
    },
  });

  return {
    document,
    isLoading,
    error,
    updateContent,
    versions,
    isLoadingVersions,
    restoreVersion,
    isUpdating: updateContent.isPending,
  };
}

// ==================== Code Links Hook ====================

export function useDocumentCodeLinks(workspaceId: string | null, documentId: string | null) {
  const queryClient = useQueryClient();

  // Get code links
  const {
    data: codeLinks,
    isLoading,
    error,
  } = useQuery<DocumentCodeLink[]>({
    queryKey: ["document", documentId, "code-links"],
    queryFn: () => documentApi.getCodeLinks(workspaceId!, documentId!),
    enabled: !!workspaceId && !!documentId,
  });

  // Create code link
  const createCodeLink = useMutation({
    mutationFn: (data: {
      repository_id: string;
      path: string;
      link_type?: DocumentLinkType;
      branch?: string;
      section_id?: string;
    }) => documentApi.createCodeLink(workspaceId!, documentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId, "code-links"] });
    },
  });

  // Delete code link
  const deleteCodeLink = useMutation({
    mutationFn: (linkId: string) => documentApi.deleteCodeLink(workspaceId!, documentId!, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId, "code-links"] });
    },
  });

  return {
    codeLinks,
    isLoading,
    error,
    createCodeLink,
    deleteCodeLink,
    isCreating: createCodeLink.isPending,
    isDeleting: deleteCodeLink.isPending,
  };
}

// ==================== Collaborators Hook ====================

export function useDocumentCollaborators(workspaceId: string | null, documentId: string | null) {
  const queryClient = useQueryClient();

  // Add collaborator
  const addCollaborator = useMutation({
    mutationFn: (data: { developer_id: string; permission?: DocumentPermission }) =>
      documentApi.addCollaborator(workspaceId!, documentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
    },
  });

  // Update collaborator
  const updateCollaborator = useMutation({
    mutationFn: ({ developerId, permission }: { developerId: string; permission: DocumentPermission }) =>
      documentApi.updateCollaborator(workspaceId!, documentId!, developerId, permission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
    },
  });

  // Remove collaborator
  const removeCollaborator = useMutation({
    mutationFn: (developerId: string) =>
      documentApi.removeCollaborator(workspaceId!, documentId!, developerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
    },
  });

  return {
    addCollaborator,
    updateCollaborator,
    removeCollaborator,
    isAdding: addCollaborator.isPending,
    isUpdating: updateCollaborator.isPending,
    isRemoving: removeCollaborator.isPending,
  };
}

// ==================== Templates Hook ====================

export function useTemplates(workspaceId: string | null) {
  const queryClient = useQueryClient();

  // Get templates
  const {
    data: templates,
    isLoading,
    error,
  } = useQuery<TemplateListItem[]>({
    queryKey: ["templates", workspaceId],
    queryFn: () =>
      templateApi.list({
        workspace_id: workspaceId || undefined,
        include_system: true,
      }),
    enabled: true, // Always load templates (includes system templates)
  });

  // Get templates by category
  const templatesByCategory = useMemo(() => {
    if (!templates) return {};
    return templates.reduce(
      (acc, template) => {
        const category = template.category;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(template);
        return acc;
      },
      {} as Record<TemplateCategory, TemplateListItem[]>
    );
  }, [templates]);

  // Get single template
  const getTemplate = useCallback(async (templateId: string): Promise<DocumentTemplate> => {
    return templateApi.get(templateId);
  }, []);

  // Duplicate template
  const duplicateTemplate = useMutation({
    mutationFn: (templateId: string) => templateApi.duplicate(templateId, workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates", workspaceId] });
    },
  });

  // Create template
  const createTemplate = useMutation({
    mutationFn: (data: {
      name: string;
      category: TemplateCategory;
      content_template: Record<string, unknown>;
      prompt_template: string;
      variables: string[];
      description?: string;
      icon?: string;
      system_prompt?: string;
    }) => templateApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates", workspaceId] });
    },
  });

  return {
    templates,
    templatesByCategory,
    isLoading,
    error,
    getTemplate,
    duplicateTemplate,
    createTemplate,
    isDuplicating: duplicateTemplate.isPending,
    isCreating: createTemplate.isPending,
  };
}
