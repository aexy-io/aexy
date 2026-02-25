"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      toast.success("Team created");
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create team");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => teamApi.delete(workspaceId!, teamId),
    onSuccess: () => {
      toast.success("Team deleted");
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete team");
    },
  });

  const createFromRepoMutation = useMutation({
    mutationFn: (data: Parameters<typeof teamApi.createFromRepository>[1]) =>
      teamApi.createFromRepository(workspaceId!, data),
    onSuccess: () => {
      toast.success("Team created from repository");
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create team from repository");
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
      toast.success("Team updated");
      queryClient.invalidateQueries({ queryKey: ["team", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update team");
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => teamApi.sync(workspaceId!, teamId!),
    onSuccess: () => {
      toast.success("Team synced");
      queryClient.invalidateQueries({ queryKey: ["team", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId, teamId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to sync team");
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
      toast.success("Member added");
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["team", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to add member");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ developerId, role }: { developerId: string; role: string }) =>
      teamApi.updateMemberRole(workspaceId!, teamId!, developerId, role),
    onSuccess: () => {
      toast.success("Member role updated");
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId, teamId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update member role");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (developerId: string) => teamApi.removeMember(workspaceId!, teamId!, developerId),
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["team", workspaceId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams", workspaceId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to remove member");
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
