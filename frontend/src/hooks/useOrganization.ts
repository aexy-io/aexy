"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  organizationApi,
  Department,
  DepartmentCreate,
  DepartmentDetail,
  DepartmentNode,
  DepartmentUpdate,
  FunctionCatalog,
  MembershipCreate,
  MembershipUpdate,
  OrganizationPermissions,
  PersonSummary,
  PositionStatus,
} from "@/lib/organization-api";

const orgKeys = {
  chart: (ws: string) => ["organization", "chart", ws] as const,
  departments: (ws: string) => ["organization", "departments", ws] as const,
  department: (ws: string, id: string) => ["organization", "department", ws, id] as const,
  people: (ws: string) => ["organization", "people", ws] as const,
  myPermissions: (ws: string) => ["organization", "my-permissions", ws] as const,
  functions: (ws: string) => ["organization", "functions", ws] as const,
};

/** Whether the caller may edit the org structure (can_manage_org). The API
 *  enforces it either way; this only drives whether the UI offers the controls. */
export function useOrganizationPermissions() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  return useQuery<OrganizationPermissions>({
    queryKey: orgKeys.myPermissions(ws ?? ""),
    queryFn: () => organizationApi.getMyPermissions(ws!),
    enabled: !!ws,
  });
}

/** What a department's function may be set to, and what each one drives here.
 *
 *  Workspace-scoped rather than static: which functions actually route anything
 *  depends on this workspace's own Service Desk taxonomy, and which are already
 *  claimed depends on its departments. */
export function useFunctionCatalog() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  return useQuery<FunctionCatalog>({
    queryKey: orgKeys.functions(ws ?? ""),
    queryFn: () => organizationApi.getFunctionCatalog(ws!),
    enabled: !!ws,
  });
}

export function useOrgChart() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  return useQuery<DepartmentNode[]>({
    queryKey: orgKeys.chart(ws ?? ""),
    queryFn: () => organizationApi.getOrgChart(ws!),
    enabled: !!ws,
  });
}

export function useDepartments() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  return useQuery<Department[]>({
    queryKey: orgKeys.departments(ws ?? ""),
    queryFn: () => organizationApi.listDepartments(ws!),
    enabled: !!ws,
  });
}

export function useDepartment(departmentId: string | null | undefined) {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  return useQuery<DepartmentDetail>({
    queryKey: orgKeys.department(ws ?? "", departmentId ?? ""),
    queryFn: () => organizationApi.getDepartment(ws!, departmentId!),
    enabled: !!ws && !!departmentId,
  });
}

/** Workspace members with their departments and manager — including the ones in
 *  no department, who no department-first view can show. */
export function usePeople() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  return useQuery<PersonSummary[]>({
    queryKey: orgKeys.people(ws ?? ""),
    queryFn: () => organizationApi.listPeople(ws!),
    enabled: !!ws,
  });
}

export function useOrganizationMutations() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const qc = useQueryClient();

  const invalidate = (departmentId?: string) => {
    if (!ws) return;
    qc.invalidateQueries({ queryKey: orgKeys.chart(ws) });
    qc.invalidateQueries({ queryKey: orgKeys.departments(ws) });
    // People carry their departments and manager, so any org write can change it.
    qc.invalidateQueries({ queryKey: orgKeys.people(ws) });
    // Creating, renaming or deleting a department changes which functions are
    // claimed and by whom, so a stale catalogue would offer a key that is taken.
    qc.invalidateQueries({ queryKey: orgKeys.functions(ws) });
    if (departmentId) qc.invalidateQueries({ queryKey: orgKeys.department(ws, departmentId) });
  };

  const createDepartment = useMutation({
    mutationFn: (data: DepartmentCreate) => organizationApi.createDepartment(ws!, data),
    onSuccess: () => invalidate(),
  });

  const updateDepartment = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DepartmentUpdate }) =>
      organizationApi.updateDepartment(ws!, id, data),
    onSuccess: (_r, v) => invalidate(v.id),
  });

  const reparentDepartment = useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      organizationApi.reparentDepartment(ws!, id, parentId),
    onSuccess: (_r, v) => invalidate(v.id),
  });

  const deleteDepartment = useMutation({
    mutationFn: (id: string) => organizationApi.deleteDepartment(ws!, id),
    onSuccess: () => invalidate(),
  });

  const addMember = useMutation({
    mutationFn: ({ departmentId, data }: { departmentId: string; data: MembershipCreate }) =>
      organizationApi.addMember(ws!, departmentId, data),
    onSuccess: (_r, v) => invalidate(v.departmentId),
  });

  const updateMember = useMutation({
    mutationFn: ({
      departmentId,
      memberId,
      data,
    }: {
      departmentId: string;
      memberId: string;
      data: MembershipUpdate;
    }) => organizationApi.updateMember(ws!, departmentId, memberId, data),
    onSuccess: (_r, v) => invalidate(v.departmentId),
  });

  const removeMember = useMutation({
    mutationFn: ({ departmentId, memberId }: { departmentId: string; memberId: string }) =>
      organizationApi.removeMember(ws!, departmentId, memberId),
    onSuccess: (_r, v) => invalidate(v.departmentId),
  });

  const addPosition = useMutation({
    mutationFn: ({
      departmentId,
      data,
    }: {
      departmentId: string;
      data: { title: string; status?: PositionStatus; filled_by_id?: string | null };
    }) => organizationApi.addPosition(ws!, departmentId, data),
    onSuccess: (_r, v) => invalidate(v.departmentId),
  });

  const setManager = useMutation({
    mutationFn: ({ developerId, managerId }: { developerId: string; managerId: string | null }) =>
      organizationApi.setManager(ws!, developerId, managerId),
    onSuccess: () => invalidate(),
  });

  return {
    createDepartment,
    updateDepartment,
    reparentDepartment,
    deleteDepartment,
    addMember,
    updateMember,
    removeMember,
    addPosition,
    setManager,
  };
}
