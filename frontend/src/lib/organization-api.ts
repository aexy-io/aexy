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
  /** Which system bundle the access profile came from — a label, not a join. */
  access_profile_slug: string | null;
  /**
   * Whether this department carries an access profile at all. False means its
   * members' access is still being decided by their legacy workspace role,
   * which is the thing an admin needs to notice.
   */
  has_access_profile: boolean;
  /** Default sidebar view for people whose primary department this is. */
  default_persona: string | null;
  created_at: string;
  updated_at: string;
}

/** What people in a department can see. */
export interface DepartmentAccessProfile {
  department_id: string;
  department_name: string;
  access_profile_slug: string | null;
  app_config: Record<string, { enabled: boolean; modules?: Record<string, boolean> }>;
  default_persona: string | null;
  enabled_app_ids: string[];
  member_count: number;
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
  /** The headcount seat this person occupies in this department, if any. */
  position_id: string | null;
  position_title: string | null;
  /** From `workspace_members.manager_id` — who this person reports to. */
  manager_id: string | null;
  manager_name: string | null;
}

export interface DepartmentDetail extends Department {
  members: DepartmentMemberSummary[];
  positions: DepartmentPosition[];
}

export interface DepartmentNode extends Department {
  children: DepartmentNode[];
  members: DepartmentMemberSummary[];
}

export interface DepartmentPosition {
  id: string;
  department_id: string;
  title: string;
  status: PositionStatus;
  filled_by_id: string | null;
  /** Display name of whoever holds the seat — so "Filled" says who by. */
  filled_by_name: string | null;
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
  /** A seat in this department to place them in. Omit to leave seats alone. */
  position_id?: string | null;
}

export interface MembershipUpdate {
  role_in_department?: DepartmentMemberRole;
  is_primary?: boolean;
  allocation_percent?: number;
  /** Seat id to move them into, or null to vacate the one they hold. Omitting
   *  the key leaves seats untouched — send it only when changing the seat. */
  position_id?: string | null;
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

  /** Every department's access profile — including the ones with none. */
  listAccessProfiles: async (workspaceId: string): Promise<DepartmentAccessProfile[]> => {
    const res = await api.get(`${base(workspaceId)}/access-profiles`);
    return res.data as DepartmentAccessProfile[];
  },

  getAccessProfile: async (
    workspaceId: string,
    departmentId: string,
  ): Promise<DepartmentAccessProfile> => {
    const res = await api.get(
      `${base(workspaceId)}/departments/${departmentId}/access-profile`,
    );
    return res.data as DepartmentAccessProfile;
  },

  /**
   * Assign, edit or clear a department's access profile.
   *
   * `profile_slug: null` with no `app_config` clears it, which puts the
   * department's members back on their role bundle and switches API enforcement
   * for them back off.
   */
  setAccessProfile: async (
    workspaceId: string,
    departmentId: string,
    data: {
      profile_slug?: string | null;
      app_config?: Record<string, { enabled: boolean; modules?: Record<string, boolean> }> | null;
      default_persona?: string | null;
    },
  ): Promise<DepartmentAccessProfile> => {
    const res = await api.put(
      `${base(workspaceId)}/departments/${departmentId}/access-profile`,
      data,
    );
    return res.data as DepartmentAccessProfile;
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
