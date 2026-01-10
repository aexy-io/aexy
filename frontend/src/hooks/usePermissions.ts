"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api";
import { useMyProjectPermissions } from "./useProjects";

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
    accessibleWidgets: accessibleWidgets || [],
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
  // If we have a project context, use project permissions
  const projectPerms = useMyProjectPermissions(
    projectId ? workspaceId : null,
    projectId || null
  );

  // For now, workspace-level permissions would need a separate endpoint
  // The project permissions endpoint handles inheritance, so it works for both
  // When no project is specified, we could query org-level permissions

  const hasPermission = (permission: string): boolean => {
    if (projectId) {
      return projectPerms.hasPermission(permission);
    }
    // Without project context, we'd need workspace-level permission check
    // For now, return false - this should be connected to workspace member role
    return false;
  };

  const hasAnyPermission = (permissions: string[]): boolean => {
    if (projectId) {
      return projectPerms.hasAnyPermission(permissions);
    }
    return false;
  };

  const hasAllPermissions = (permissions: string[]): boolean => {
    if (projectId) {
      return projectPerms.hasAllPermissions(permissions);
    }
    return false;
  };

  return {
    permissions: projectId ? projectPerms.permissions : [],
    isLoading: projectId ? projectPerms.isLoading : false,
    error: projectId ? projectPerms.error : null,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isWorkspaceOwner: projectPerms.isWorkspaceOwner,
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
 * Permission constants for easy reference
 * These match the backend PERMISSIONS definitions
 */
export const PERMISSIONS = {
  // Members
  CAN_INVITE_MEMBERS: "can_invite_members",
  CAN_REMOVE_MEMBERS: "can_remove_members",
  CAN_VIEW_MEMBERS: "can_view_members",
  CAN_MANAGE_MEMBER_ROLES: "can_manage_member_roles",

  // Roles
  CAN_MANAGE_ROLES: "can_manage_roles",
  CAN_ASSIGN_ROLES: "can_assign_roles",
  CAN_VIEW_ROLES: "can_view_roles",

  // Projects
  CAN_CREATE_PROJECTS: "can_create_projects",
  CAN_EDIT_PROJECTS: "can_edit_projects",
  CAN_DELETE_PROJECTS: "can_delete_projects",
  CAN_VIEW_PROJECTS: "can_view_projects",
  CAN_MANAGE_PROJECT_MEMBERS: "can_manage_project_members",

  // Teams
  CAN_CREATE_TEAMS: "can_create_teams",
  CAN_EDIT_TEAMS: "can_edit_teams",
  CAN_DELETE_TEAMS: "can_delete_teams",
  CAN_VIEW_TEAMS: "can_view_teams",
  CAN_MANAGE_TEAM_MEMBERS: "can_manage_team_members",

  // Sprints
  CAN_CREATE_SPRINTS: "can_create_sprints",
  CAN_EDIT_SPRINTS: "can_edit_sprints",
  CAN_DELETE_SPRINTS: "can_delete_sprints",
  CAN_VIEW_SPRINTS: "can_view_sprints",
  CAN_MANAGE_SPRINT_TASKS: "can_manage_sprint_tasks",

  // Tasks
  CAN_CREATE_TASKS: "can_create_tasks",
  CAN_EDIT_TASKS: "can_edit_tasks",
  CAN_DELETE_TASKS: "can_delete_tasks",
  CAN_VIEW_TASKS: "can_view_tasks",
  CAN_ASSIGN_TASKS: "can_assign_tasks",

  // Epics
  CAN_CREATE_EPICS: "can_create_epics",
  CAN_EDIT_EPICS: "can_edit_epics",
  CAN_DELETE_EPICS: "can_delete_epics",
  CAN_VIEW_EPICS: "can_view_epics",

  // Tickets
  CAN_VIEW_TICKETS: "can_view_tickets",
  CAN_CREATE_TICKETS: "can_create_tickets",
  CAN_MANAGE_TICKETS: "can_manage_tickets",
  CAN_RESPOND_TICKETS: "can_respond_tickets",
  CAN_MANAGE_TICKET_FORMS: "can_manage_ticket_forms",

  // CRM
  CAN_VIEW_CRM: "can_view_crm",
  CAN_CREATE_CRM_RECORDS: "can_create_crm_records",
  CAN_EDIT_CRM_RECORDS: "can_edit_crm_records",
  CAN_DELETE_CRM_RECORDS: "can_delete_crm_records",
  CAN_MANAGE_CRM_PIPELINES: "can_manage_crm_pipelines",
  CAN_MANAGE_CRM_AUTOMATIONS: "can_manage_crm_automations",

  // Documents
  CAN_VIEW_DOCS: "can_view_docs",
  CAN_CREATE_DOCS: "can_create_docs",
  CAN_EDIT_DOCS: "can_edit_docs",
  CAN_DELETE_DOCS: "can_delete_docs",
  CAN_MANAGE_DOC_TEMPLATES: "can_manage_doc_templates",

  // Assessments
  CAN_VIEW_ASSESSMENTS: "can_view_assessments",
  CAN_CREATE_ASSESSMENTS: "can_create_assessments",
  CAN_MANAGE_ASSESSMENTS: "can_manage_assessments",
  CAN_GRADE_ASSESSMENTS: "can_grade_assessments",

  // Hiring
  CAN_VIEW_HIRING: "can_view_hiring",
  CAN_MANAGE_HIRING: "can_manage_hiring",
  CAN_VIEW_CANDIDATES: "can_view_candidates",
  CAN_MANAGE_CANDIDATES: "can_manage_candidates",

  // Tracking
  CAN_VIEW_TRACKING: "can_view_tracking",
  CAN_MANAGE_TRACKING: "can_manage_tracking",
  CAN_VIEW_TIME_ENTRIES: "can_view_time_entries",
  CAN_MANAGE_TIME_ENTRIES: "can_manage_time_entries",

  // Billing
  CAN_VIEW_BILLING: "can_view_billing",
  CAN_MANAGE_BILLING: "can_manage_billing",
  CAN_MANAGE_SUBSCRIPTIONS: "can_manage_subscriptions",

  // Integrations
  CAN_VIEW_INTEGRATIONS: "can_view_integrations",
  CAN_MANAGE_INTEGRATIONS: "can_manage_integrations",
  CAN_MANAGE_WEBHOOKS: "can_manage_webhooks",

  // Workspace
  CAN_MANAGE_WORKSPACE_SETTINGS: "can_manage_workspace_settings",
  CAN_DELETE_WORKSPACE: "can_delete_workspace",
  CAN_VIEW_ANALYTICS: "can_view_analytics",
  CAN_EXPORT_DATA: "can_export_data",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
