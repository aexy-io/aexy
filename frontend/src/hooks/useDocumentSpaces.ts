"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  spaceApi,
  DocumentSpace,
  DocumentSpaceListItem,
  DocumentSpaceCreate,
  DocumentSpaceUpdate,
  DocumentSpaceMember,
  DocumentSpaceRole,
} from "@/lib/api";

/**
 * Hook for managing document spaces within a workspace
 */
export function useDocumentSpaces(workspaceId: string | null) {
  const queryClient = useQueryClient();

  // Get current space from localStorage
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`current-space-${workspaceId}`) || null;
  });

  // Fetch spaces
  const {
    data: spaces,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["document-spaces", workspaceId],
    queryFn: () => spaceApi.list(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60000,
  });

  // Find current space or default to the default space
  const currentSpace =
    spaces?.find((s) => s.id === currentSpaceId) ||
    spaces?.find((s) => s.is_default) ||
    (spaces && spaces.length > 0 ? spaces[0] : null);

  // Update currentSpaceId when spaces load and there's no current selection
  useEffect(() => {
    if (spaces && spaces.length > 0 && !currentSpaceId) {
      const defaultSpace = spaces.find((s) => s.is_default) || spaces[0];
      setCurrentSpaceId(defaultSpace.id);
    }
  }, [spaces, currentSpaceId]);

  // Persist current space selection
  const switchSpace = (spaceId: string) => {
    setCurrentSpaceId(spaceId);
    if (typeof window !== "undefined" && workspaceId) {
      localStorage.setItem(`current-space-${workspaceId}`, spaceId);
    }
  };

  // Create space mutation
  const createSpaceMutation = useMutation({
    mutationFn: (data: DocumentSpaceCreate) => spaceApi.create(workspaceId!, data),
    onSuccess: (newSpace) => {
      queryClient.invalidateQueries({
        queryKey: ["document-spaces", workspaceId],
      });
      // Switch to the new space
      switchSpace(newSpace.id);
    },
  });

  // Update space mutation
  const updateSpaceMutation = useMutation({
    mutationFn: ({ spaceId, data }: { spaceId: string; data: DocumentSpaceUpdate }) =>
      spaceApi.update(workspaceId!, spaceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["document-spaces", workspaceId],
      });
    },
  });

  // Delete space mutation
  const deleteSpaceMutation = useMutation({
    mutationFn: (spaceId: string) => spaceApi.delete(workspaceId!, spaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["document-spaces", workspaceId],
      });
      // If deleted space was current, switch to default
      const defaultSpace = spaces?.find((s) => s.is_default);
      if (defaultSpace) {
        switchSpace(defaultSpace.id);
      }
    },
  });

  return {
    // Data
    spaces: spaces || [],
    currentSpace,
    currentSpaceId: currentSpace?.id || null,

    // Actions
    switchSpace,
    createSpace: createSpaceMutation.mutateAsync,
    updateSpace: updateSpaceMutation.mutateAsync,
    deleteSpace: deleteSpaceMutation.mutate,

    // Loading states
    isLoading,
    isCreating: createSpaceMutation.isPending,
    isUpdating: updateSpaceMutation.isPending,
    isDeleting: deleteSpaceMutation.isPending,

    // Error
    error,

    // Helpers
    refetch: () => {
      queryClient.invalidateQueries({
        queryKey: ["document-spaces", workspaceId],
      });
    },
  };
}

/**
 * Hook for managing members of a specific space
 */
export function useSpaceMembers(workspaceId: string | null, spaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: members,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["document-space-members", workspaceId, spaceId],
    queryFn: () => spaceApi.getMembers(workspaceId!, spaceId!),
    enabled: !!workspaceId && !!spaceId,
    staleTime: 60000,
  });

  const addMemberMutation = useMutation({
    mutationFn: (data: { developer_id: string; role?: DocumentSpaceRole }) =>
      spaceApi.addMember(workspaceId!, spaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["document-space-members", workspaceId, spaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["document-spaces", workspaceId],
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: DocumentSpaceRole }) =>
      spaceApi.updateMemberRole(workspaceId!, spaceId!, memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["document-space-members", workspaceId, spaceId],
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      spaceApi.removeMember(workspaceId!, spaceId!, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["document-space-members", workspaceId, spaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["document-spaces", workspaceId],
      });
    },
  });

  const addAllMembersMutation = useMutation({
    mutationFn: () => spaceApi.addAllWorkspaceMembers(workspaceId!, spaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["document-space-members", workspaceId, spaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["document-spaces", workspaceId],
      });
    },
  });

  return {
    members: members || [],
    isLoading,
    error,

    addMember: addMemberMutation.mutateAsync,
    updateRole: updateRoleMutation.mutate,
    removeMember: removeMemberMutation.mutate,
    addAllMembers: addAllMembersMutation.mutateAsync,

    isAdding: addMemberMutation.isPending,
    isUpdating: updateRoleMutation.isPending,
    isRemoving: removeMemberMutation.isPending,
    isAddingAll: addAllMembersMutation.isPending,
  };
}
