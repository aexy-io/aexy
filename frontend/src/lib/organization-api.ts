import { api } from "./api";

// Types

export type DepartmentMemberRole = "head" | "manager" | "member";
export type PositionStatus = "open" | "filled";

export interface Department {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  function_key: string | null;
  parent_id: string | null;
  path: string;
  depth: number;
  position: number;
  head_id: string | null;
  cost_center: string | null;
  budget_amount: string | null;
  budget_currency: string | null;
  headcount_planned: number;
  headcount_actual: number;
  location: string | null;
  timezone: string | null;
  is_active: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentMemberSummary {
  id: string;
  developer_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  role_in_department: DepartmentMemberRole;
  is_primary: boolean;
  allocation_percent: number;
}

export interface DepartmentDetail extends Department {
  members: DepartmentMemberSummary[];
  positions: DepartmentPosition[];
}

export interface DepartmentNode extends Department {
  children: DepartmentNode[];
}

export interface DepartmentPosition {
  id: string;
  department_id: string;
  title: string;
  status: PositionStatus;
  filled_by_id: string | null;
  created_at: string;
}

export interface DepartmentCreate {
  name: string;
  slug?: string | null;
  description?: string | null;
  function_key?: string | null;
  parent_id?: string | null;
  head_id?: string | null;
  cost_center?: string | null;
  budget_amount?: string | number | null;
  budget_currency?: string | null;
  headcount_planned?: number;
  location?: string | null;
  timezone?: string | null;
  position?: number;
}

export type DepartmentUpdate = Partial<DepartmentCreate> & { is_active?: boolean };

export interface MembershipCreate {
  developer_id: string;
  role_in_department?: DepartmentMemberRole;
  is_primary?: boolean;
  allocation_percent?: number;
}

export interface MembershipUpdate {
  role_in_department?: DepartmentMemberRole;
  is_primary?: boolean;
  allocation_percent?: number;
}

export interface PersonDepartment {
  id: string;
  name: string;
  function_key: string | null;
  role_in_department: DepartmentMemberRole;
  is_primary: boolean;
}

/** A workspace member as the Organization module sees them. Keyed on the
 *  developer rather than on a department membership, so people who are in NO
 *  department — every new joiner — are included. */
export interface PersonSummary {
  developer_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  workspace_role: string;
  /** Primary department first, then alphabetical. */
  departments: PersonDepartment[];
  manager_id: string | null;
  manager_name: string | null;
}

export interface OrganizationPermissions {
  /** Whether the current user holds can_manage_org. The API enforces this
   *  regardless; the UI uses it to avoid offering actions that would 403. */
  can_manage: boolean;
}

const base = (workspaceId: string) => `/workspaces/${workspaceId}/organization`;

export const organizationApi = {
  getMyPermissions: async (workspaceId: string): Promise<OrganizationPermissions> => {
    const res = await api.get(`${base(workspaceId)}/my-permissions`);
    return res.data as OrganizationPermissions;
  },

  listPeople: async (workspaceId: string): Promise<PersonSummary[]> => {
    const res = await api.get(`${base(workspaceId)}/people`);
    return res.data as PersonSummary[];
  },

  listDepartments: async (workspaceId: string): Promise<Department[]> => {
    const res = await api.get(`${base(workspaceId)}/departments`);
    return res.data as Department[];
  },

  getOrgChart: async (workspaceId: string): Promise<DepartmentNode[]> => {
    const res = await api.get(`${base(workspaceId)}/org-chart`);
    return res.data as DepartmentNode[];
  },

  getDepartment: async (workspaceId: string, departmentId: string): Promise<DepartmentDetail> => {
    const res = await api.get(`${base(workspaceId)}/departments/${departmentId}`);
    return res.data as DepartmentDetail;
  },

  createDepartment: async (workspaceId: string, data: DepartmentCreate): Promise<Department> => {
    const res = await api.post(`${base(workspaceId)}/departments`, data);
    return res.data as Department;
  },

  updateDepartment: async (
    workspaceId: string,
    departmentId: string,
    data: DepartmentUpdate,
  ): Promise<Department> => {
    const res = await api.patch(`${base(workspaceId)}/departments/${departmentId}`, data);
    return res.data as Department;
  },

  reparentDepartment: async (
    workspaceId: string,
    departmentId: string,
    parentId: string | null,
  ): Promise<Department> => {
    const res = await api.post(`${base(workspaceId)}/departments/${departmentId}/reparent`, {
      parent_id: parentId,
    });
    return res.data as Department;
  },

  deleteDepartment: async (workspaceId: string, departmentId: string): Promise<void> => {
    await api.delete(`${base(workspaceId)}/departments/${departmentId}`);
  },

  addMember: async (
    workspaceId: string,
    departmentId: string,
    data: MembershipCreate,
  ): Promise<DepartmentMemberSummary> => {
    const res = await api.post(`${base(workspaceId)}/departments/${departmentId}/members`, data);
    return res.data as DepartmentMemberSummary;
  },

  updateMember: async (
    workspaceId: string,
    departmentId: string,
    memberId: string,
    data: MembershipUpdate,
  ): Promise<DepartmentMemberSummary> => {
    const res = await api.patch(
      `${base(workspaceId)}/departments/${departmentId}/members/${memberId}`,
      data,
    );
    return res.data as DepartmentMemberSummary;
  },

  removeMember: async (
    workspaceId: string,
    departmentId: string,
    memberId: string,
  ): Promise<void> => {
    await api.delete(`${base(workspaceId)}/departments/${departmentId}/members/${memberId}`);
  },

  addPosition: async (
    workspaceId: string,
    departmentId: string,
    data: { title: string; status?: PositionStatus; filled_by_id?: string | null },
  ): Promise<DepartmentPosition> => {
    const res = await api.post(`${base(workspaceId)}/departments/${departmentId}/positions`, data);
    return res.data as DepartmentPosition;
  },

  developerDepartments: async (
    workspaceId: string,
    developerId: string,
  ): Promise<Department[]> => {
    const res = await api.get(`${base(workspaceId)}/developers/${developerId}/departments`);
    return res.data as Department[];
  },

  setManager: async (
    workspaceId: string,
    developerId: string,
    managerId: string | null,
  ): Promise<void> => {
    await api.put(`${base(workspaceId)}/developers/${developerId}/manager`, {
      manager_id: managerId,
    });
  },
};
