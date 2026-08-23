"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardApi, workspaceApi } from "@/lib/api";
import { useMyProjectPermissions } from "./useProjects";
import { EMPTY_ARRAY } from "@/lib/emptyArray";

/**
 * Hook for getting accessible widgets based on user permissions at workspace level
 */
export function useAccessibleWidgets(workspaceId: string | null, projectId?: string | null) {
  const {
    data: accessibleWidgets,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["accessibleWidgets", workspaceId, projectId],
    queryFn: () => dashboardApi.getAccessibleWidgets(workspaceId!, projectId || undefined),
    enabled: !!workspaceId,
  });

  return {
    accessibleWidgets: accessibleWidgets ?? EMPTY_ARRAY,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for checking user permissions at workspace or project level
 * If projectId is provided, checks project-level permissions (with inheritance)
 * Otherwise, uses workspace-level permissions from the member role
 */
export function usePermissions(workspaceId: string | null, projectId?: string | null) {
  // If we have a project context, use project permissions (that endpoint already
  // handles inheritance from the workspace role).
  const projectPerms = useMyProjectPermissions(
    projectId ? workspaceId : null,
    projectId || null
  );

  // Workspace-level permissions. This branch used to `return false` for every
  // check, with a comment saying it needed an endpoint — so every caller silently
  // behaved as though the user could do nothing, and features gated on it were
  // either dead or fell back to guessing from a role string.
  const {
    data: workspacePerms,
    isLoading: workspaceLoading,
    error: workspaceError,
  } = useQuery({
    queryKey: ["workspacePermissions", workspaceId],
    queryFn: () => workspaceApi.getMyPermissions(workspaceId!),
    enabled: !!workspaceId && !projectId,
    // Permissions change when an admin edits a role, not while someone works —
    // and this gates navigation, so re-fetching it on every focus is wasteful.
    staleTime: 5 * 60_000,
  });

  const permissions = projectId ? projectPerms.permissions : workspacePerms?.permissions ?? [];

  const hasPermission = (permission: string): boolean => {
    if (projectId) return projectPerms.hasPermission(permission);
    return permissions.includes(permission);
  };

  const hasAnyPermission = (needed: string[]): boolean => {
    if (projectId) return projectPerms.hasAnyPermission(needed);
    return needed.some((p) => permissions.includes(p));
  };

  const hasAllPermissions = (needed: string[]): boolean => {
    if (projectId) return projectPerms.hasAllPermissions(needed);
    return needed.every((p) => permissions.includes(p));
  };

  return {
    permissions,
    isLoading: projectId ? projectPerms.isLoading : workspaceLoading,
    error: projectId ? projectPerms.error : workspaceError,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isWorkspaceOwner: projectId ? projectPerms.isWorkspaceOwner : !!workspacePerms?.is_owner,
    roleName: projectId ? undefined : workspacePerms?.role_name ?? null,
  };
}

/**
 * Higher-order component pattern for permission-gated components
 * Usage: <PermissionGate permission="can_manage_crm"><YourComponent /></PermissionGate>
 */
export interface PermissionGateProps {
  workspaceId: string | null;
  projectId?: string | null;
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The workspace permission catalogue, mirroring `backend/src/aexy/models/permissions.py`.
 *
 * This map was hand-maintained and had drifted badly: 39 of its 70 entries named
 * permissions the backend has never defined (`can_manage_webhooks`,
 * `can_view_teams`, `can_delete_workspace`, …) while 30 real ones were missing.
 * Gating a page on a phantom key hides it from everyone, permanently and
 * silently — nobody holds a permission that doesn't exist. All 61 keys below are
 * generated from the backend catalogue, and `settingsNavigation.test.ts` asserts
 * the two stay in step.
 *
 * Entries marked owner-only are excluded from the `admin` role template by
 * default (`OWNER_ONLY_PERMISSIONS`); an owner can delegate any of them per
 * member.
 */
export const PERMISSIONS = {
  // Members
  CAN_INVITE_MEMBERS: "can_invite_members",
  CAN_REMOVE_MEMBERS: "can_remove_members",
  CAN_VIEW_MEMBERS: "can_view_members",

  // Roles
  CAN_MANAGE_ROLES: "can_manage_roles",  // owner-only by default
  CAN_ASSIGN_ROLES: "can_assign_roles",  // owner-only by default

  // Projects
  CAN_CREATE_PROJECTS: "can_create_projects",
  CAN_EDIT_PROJECTS: "can_edit_projects",
  CAN_DELETE_PROJECTS: "can_delete_projects",  // owner-only by default
  CAN_VIEW_PROJECTS: "can_view_projects",

  // Teams
  CAN_CREATE_TEAMS: "can_create_teams",
  CAN_EDIT_TEAMS: "can_edit_teams",
  CAN_DELETE_TEAMS: "can_delete_teams",  // owner-only by default
  CAN_MANAGE_TEAM_MEMBERS: "can_manage_team_members",

  // Tickets
  CAN_VIEW_TICKETS: "can_view_tickets",
  CAN_CREATE_TICKETS: "can_create_tickets",
  CAN_MANAGE_TICKETS: "can_manage_tickets",
  CAN_DELETE_TICKETS: "can_delete_tickets",  // owner-only by default

  // Organization
  CAN_VIEW_ORG: "can_view_org",
  CAN_MANAGE_ORG: "can_manage_org",

  // Service Desk
  CAN_VIEW_SERVICE_DESK: "can_view_service_desk",
  // Every ticket in the workspace, read-only. Deliberately separate from
  // managing the desk: an Ops Lead watches everything without reconfiguring it.
  CAN_VIEW_ALL_SERVICE_DESK: "can_view_all_service_desk",
  CAN_MANAGE_SERVICE_DESK: "can_manage_service_desk",

  // Crm
  CAN_VIEW_CRM: "can_view_crm",
  CAN_MANAGE_CRM: "can_manage_crm",

  // Docs
  CAN_VIEW_DOCS: "can_view_docs",
  CAN_CREATE_DOCS: "can_create_docs",
  CAN_EDIT_DOCS: "can_edit_docs",
  CAN_DELETE_DOCS: "can_delete_docs",  // owner-only by default

  // Sprints
  CAN_VIEW_SPRINTS: "can_view_sprints",
  CAN_MANAGE_SPRINTS: "can_manage_sprints",
  CAN_MANAGE_TASKS: "can_manage_tasks",

  // Hiring
  CAN_VIEW_HIRING: "can_view_hiring",
  CAN_MANAGE_HIRING: "can_manage_hiring",
  CAN_SCHEDULE_INTERVIEWS: "can_schedule_interviews",

  // Tracking
  CAN_VIEW_TRACKING: "can_view_tracking",
  CAN_MANAGE_TRACKING: "can_manage_tracking",
  CAN_SUBMIT_STANDUPS: "can_submit_standups",
  CAN_VIEW_TRACKER_RECORDS: "can_view_tracker_records",

  // Reviews
  CAN_VIEW_REVIEWS: "can_view_reviews",
  CAN_MANAGE_REVIEWS: "can_manage_reviews",
  CAN_SUBMIT_FEEDBACK: "can_submit_feedback",

  // Learning
  CAN_VIEW_LEARNING: "can_view_learning",
  CAN_MANAGE_LEARNING: "can_manage_learning",

  // Forms
  CAN_VIEW_FORMS: "can_view_forms",
  CAN_MANAGE_FORMS: "can_manage_forms",

  // Oncall
  CAN_VIEW_ONCALL: "can_view_oncall",
  CAN_MANAGE_ONCALL: "can_manage_oncall",

  // Insights
  CAN_VIEW_INSIGHTS: "can_view_insights",
  CAN_MANAGE_INSIGHTS: "can_manage_insights",

  // Compliance
  CAN_VIEW_COMPLIANCE: "can_view_compliance",
  CAN_MANAGE_COMPLIANCE: "can_manage_compliance",

  // Tables
  CAN_VIEW_TABLES: "can_view_tables",
  CAN_CREATE_TABLES: "can_create_tables",
  CAN_MANAGE_TABLES: "can_manage_tables",

  // Leaves
  CAN_REQUEST_LEAVES: "can_request_leaves",
  CAN_APPROVE_LEAVES: "can_approve_leaves",
  CAN_VIEW_LEAVES: "can_view_leaves",
  CAN_MANAGE_LEAVES: "can_manage_leaves",

  // Billing
  CAN_VIEW_BILLING: "can_view_billing",
  CAN_MANAGE_BILLING: "can_manage_billing",  // owner-only by default

  // Settings
  CAN_MANAGE_WORKSPACE_SETTINGS: "can_manage_workspace_settings",
  CAN_MANAGE_INTEGRATIONS: "can_manage_integrations",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
