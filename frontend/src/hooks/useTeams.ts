"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { teamApi, TeamListItem, Team, TeamMember, TeamProfile } from "@/lib/api";

export function useTeams(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: teams,
    isLoading,
    error,
    refetch,
  } = useQuery<TeamListItem[]>({
    queryKey: ["teams", workspaceId],
    queryFn: () => teamApi.list(workspaceId!),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof teamApi.create>[1]) => teamApi.create(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => teamApi.delete(workspaceId!, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
  });

  const createFromRepoMutation = useMutation({
    mutationFn: (data: Parameters<typeof teamApi.createFromRepository>[1]) =>
      teamApi.createFromRepository(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
  });

  return {
    teams: teams || [],
    isLoading,
    error,
    refetch,
    createTeam: createMutation.mutateAsync,
    deleteTeam: deleteMutation.mutateAsync,
    createFromRepository: createFromRepoMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useTeam(workspaceId: string | null, teamId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: team,
    isLoading,
    error,
    refetch,
  } = useQuery<Team>({
    queryKey: ["team", workspaceId, teamId],
    queryFn: () => teamApi.get(workspaceId!, teamId!),
    enabled: !!workspaceId && !!teamId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof teamApi.update>[2]) => teamApi.update(workspaceId!, teamId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => teamApi.sync(workspaceId!, teamId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId, teamId] });
    },
  });

  return {
    team,
    isLoading,
    error,
    refetch,
    updateTeam: updateMutation.mutateAsync,
    syncTeam: syncMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isSyncing: syncMutation.isPending,
  };
}

export function useTeamMembers(workspaceId: string | null, teamId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: members,
    isLoading,
    error,
    refetch,
  } = useQuery<TeamMember[]>({
    queryKey: ["teamMembers", workspaceId, teamId],
    queryFn: () => teamApi.getMembers(workspaceId!, teamId!),
    enabled: !!workspaceId && !!teamId,
  });

  const addMutation = useMutation({
    mutationFn: ({ developerId, role }: { developerId: string; role?: string }) =>
      teamApi.addMember(workspaceId!, teamId!, developerId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["team", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ developerId, role }: { developerId: string; role: string }) =>
      teamApi.updateMemberRole(workspaceId!, teamId!, developerId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId, teamId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (developerId: string) => teamApi.removeMember(workspaceId!, teamId!, developerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["team", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
    },
  });

  return {
    members: members || [],
    isLoading,
    error,
    refetch,
    addMember: addMutation.mutateAsync,
    updateMemberRole: updateRoleMutation.mutateAsync,
    removeMember: removeMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isUpdatingRole: updateRoleMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}

export function useTeamProfile(workspaceId: string | null, teamId: string | null) {
  const {
    data: profile,
    isLoading,
    error,
    refetch,
  } = useQuery<TeamProfile>({
    queryKey: ["teamProfile", workspaceId, teamId],
    queryFn: () => teamApi.getProfile(workspaceId!, teamId!),
    enabled: !!workspaceId && !!teamId,
  });

  return {
    profile,
    isLoading,
    error,
    refetch,
  };
}

export function useTeamBusFactor(workspaceId: string | null, teamId: string | null) {
  const {
    data: busFactor,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["teamBusFactor", workspaceId, teamId],
    queryFn: () => teamApi.getBusFactor(workspaceId!, teamId!),
    enabled: !!workspaceId && !!teamId,
  });

  return {
    busFactor,
    isLoading,
    error,
  };
}
