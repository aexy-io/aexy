"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  documentApi,
  DocumentTreeItem,
  DocumentVisibility,
  DocumentNotificationList,
  DocumentAncestor,
  DocumentCreate,
} from "@/lib/api";

/**
 * Hook for managing Notion-like document organization
 * - Private docs are personal (NOT filtered by space)
 * - Shared docs are workspace-level (NOT tied to any specific space)
 * - Space docs belong to specific spaces
 */
export function useNotionDocs(workspaceId: string | null) {
  const queryClient = useQueryClient();

  // Private documents tree - personal pages, NOT tied to any space
  const {
    data: privateTree,
    isLoading: privateLoading,
    error: privateError,
  } = useQuery({
    queryKey: ["documents", "tree", workspaceId, "private"],
    queryFn: () => documentApi.getTree(workspaceId!, {
      visibility: "private",
      // No space_id - private docs are personal
    }),
    enabled: !!workspaceId,
    staleTime: 30000,
  });

  // Shared documents tree - workspace-level shared docs, NOT tied to any space
  const {
    data: sharedTree,
    isLoading: sharedLoading,
    error: sharedError,
  } = useQuery({
    queryKey: ["documents", "tree", workspaceId, "shared-no-space"],
    queryFn: () => documentApi.getTree(workspaceId!, {
      visibility: "workspace",
      space_id: "none", // Special value to get docs without a space
    }),
    enabled: !!workspaceId,
    staleTime: 30000,
  });

  // Favorites
  const {
    data: favorites,
    isLoading: favoritesLoading,
    error: favoritesError,
  } = useQuery({
    queryKey: ["documents", "favorites", workspaceId],
    queryFn: () => documentApi.getFavorites(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30000,
  });

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: (documentId: string) =>
      documentApi.toggleFavorite(workspaceId!, documentId),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: ["documents", "favorites", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["documents", "tree", workspaceId],
      });
    },
  });

  // Create document mutation
  const createDocumentMutation = useMutation({
    mutationFn: (data: DocumentCreate) =>
      documentApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", "tree", workspaceId],
      });
    },
  });

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: string) =>
      documentApi.delete(workspaceId!, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", "tree", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["documents", "favorites", workspaceId],
      });
    },
  });

  return {
    // Data
    privateTree: privateTree || [],
    sharedTree: sharedTree || [],
    favorites: favorites || [],

    // Loading states
    isLoading: privateLoading || sharedLoading || favoritesLoading,
    privateLoading,
    sharedLoading,
    favoritesLoading,

    // Errors
    error: privateError || sharedError || favoritesError,

    // Mutations
    toggleFavorite: toggleFavoriteMutation.mutate,
    isTogglingFavorite: toggleFavoriteMutation.isPending,

    createDocument: createDocumentMutation.mutateAsync,
    isCreating: createDocumentMutation.isPending,

    deleteDocument: deleteDocumentMutation.mutate,
    isDeleting: deleteDocumentMutation.isPending,

    // Helpers
    refetch: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", "tree", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["documents", "favorites", workspaceId],
      });
    },
  };
}

/**
 * Hook for fetching documents for a specific space
 */
export function useSpaceDocuments(workspaceId: string | null, spaceId: string | null) {
  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents", "tree", workspaceId, spaceId, "workspace"],
    queryFn: () => documentApi.getTree(workspaceId!, {
      visibility: "workspace",
      space_id: spaceId || undefined,
    }),
    enabled: !!workspaceId && !!spaceId,
    staleTime: 30000,
  });

  return {
    documents: documents || [],
    isLoading,
  };
}

/**
 * Hook for document breadcrumbs/ancestors
 */
export function useDocumentBreadcrumbs(
  workspaceId: string | null,
  documentId: string | null
) {
  const { data: ancestors, isLoading } = useQuery({
    queryKey: ["documents", documentId, "ancestors"],
    queryFn: () => documentApi.getAncestors(workspaceId!, documentId!),
    enabled: !!workspaceId && !!documentId,
    staleTime: 60000,
  });

  return {
    ancestors: ancestors || [],
    isLoading,
  };
}

/**
 * Hook for document notifications
 */
export function useDocumentNotifications(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: notificationData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["documents", "notifications", workspaceId],
    queryFn: () => documentApi.getNotifications(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30000,
    refetchInterval: 60000, // Refetch every minute
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      documentApi.markNotificationRead(workspaceId!, notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", "notifications", workspaceId],
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => documentApi.markAllNotificationsRead(workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", "notifications", workspaceId],
      });
    },
  });

  return {
    notifications: notificationData?.notifications || [],
    total: notificationData?.total || 0,
    unreadCount: notificationData?.unread_count || 0,
    isLoading,
    error,

    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
    isMarkingRead: markReadMutation.isPending,
  };
}
