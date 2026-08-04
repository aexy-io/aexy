"""Permission resolution and checking service."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from aexy.models.workspace import WorkspaceMember
from aexy.models.project import ProjectMember
from aexy.models.role import CustomRole
from aexy.models.permissions import PERMISSIONS, ROLE_TEMPLATES, WIDGET_PERMISSIONS, get_accessible_widgets


class PermissionService:
    """
    Service for resolving and checking permissions.

    Permission resolution order:
    1. Start with org-level role permissions
    2. Apply org-level permission overrides
    3. If project_id provided:
       a. Apply project role permissions (if set, replaces org role)
       b. Apply project permission overrides
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_effective_permissions(
        self,
        workspace_id: str,
        developer_id: str,
        project_id: str | None = None,
    ) -> set[str]:
        """
        Get effective permissions for a user.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            project_id: Optional project ID for project-specific permissions

        Returns:
            Set of permission strings the user has.
        """
        permissions: set[str] = set()

        # Step 1: Get org-level membership and role
        org_member = await self._get_workspace_member(workspace_id, developer_id)
        if not org_member or org_member.status != "active":
            return permissions

        # Resolved up front but applied *last* — see the end of this method.
        is_owner = await self._is_workspace_owner(workspace_id, developer_id)

        # Step 2: Get org role permissions
        if org_member.role_id:
            org_role = await self._get_role(org_member.role_id)
            if org_role and org_role.is_active:
                permissions.update(org_role.permissions)
        elif org_member.role:
            # Fallback to legacy role -> template mapping
            template = ROLE_TEMPLATES.get(org_member.role, {})
            permissions.update(template.get("permissions", []))

        # Step 3: Apply org-level overrides
        if org_member.permission_overrides:
            for perm, granted in org_member.permission_overrides.items():
                if granted:
                    permissions.add(perm)
                else:
                    permissions.discard(perm)

        # Step 4: If project context, apply project-level permissions
        if project_id:
            project_member = await self._get_project_member(project_id, developer_id)

            if project_member and project_member.status == "active":
                # Project role REPLACES org role for this project
                if project_member.role_id:
                    project_role = await self._get_role(project_member.role_id)
                    if project_role and project_role.is_active:
                        # Replace org permissions with project permissions
                        permissions = set(project_role.permissions)

                # Apply project-level overrides
                if project_member.permission_overrides:
                    for perm, granted in project_member.permission_overrides.items():
                        if granted:
                            permissions.add(perm)
                        else:
                            permissions.discard(perm)

        # Step 5: The workspace owner always holds everything, applied after every
        # other step for two reasons.
        #
        # `workspaces.owner_id` — not the membership row's `role` string — is the
        # authority on who the owner is. Creation does set that row to "owner", but
        # a transfer, a seed script or a hand-fixed database can leave the real
        # owner on an admin row, and admins no longer hold deletes, billing or role
        # management (see OWNER_ONLY_PERMISSIONS), so that would lock an owner out
        # of their own workspace.
        #
        # Applying it last also survives a project role, which *replaces* the org
        # permission set in step 4 — an owner with a project role would otherwise
        # lose the ability to delete that very project. Overrides cannot revoke
        # from an owner either, which is deliberate: a workspace whose owner has
        # revoked their own billing access has nobody who can restore it.
        if is_owner:
            permissions.update(ROLE_TEMPLATES["owner"]["permissions"])

        return permissions

    async def check_permission(
        self,
        workspace_id: str,
        developer_id: str,
        permission: str,
        project_id: str | None = None,
    ) -> bool:
        """
        Check if user has a specific permission.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            permission: Permission string to check
            project_id: Optional project ID for project-specific check

        Returns:
            True if user has the permission, False otherwise
        """
        permissions = await self.get_effective_permissions(
            workspace_id, developer_id, project_id
        )
        return permission in permissions

    async def check_any_permission(
        self,
        workspace_id: str,
        developer_id: str,
        permissions_needed: list[str],
        project_id: str | None = None,
    ) -> bool:
        """
        Check if user has ANY of the specified permissions.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            permissions_needed: List of permissions to check
            project_id: Optional project ID for project-specific check

        Returns:
            True if user has at least one of the permissions
        """
        permissions = await self.get_effective_permissions(
            workspace_id, developer_id, project_id
        )
        return bool(permissions.intersection(permissions_needed))

    async def check_all_permissions(
        self,
        workspace_id: str,
        developer_id: str,
        permissions_needed: list[str],
        project_id: str | None = None,
    ) -> bool:
        """
        Check if user has ALL of the specified permissions.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            permissions_needed: List of permissions to check
            project_id: Optional project ID for project-specific check

        Returns:
            True if user has all of the permissions
        """
        permissions = await self.get_effective_permissions(
            workspace_id, developer_id, project_id
        )
        return set(permissions_needed).issubset(permissions)

    async def get_accessible_widgets(
        self,
        workspace_id: str,
        developer_id: str,
        project_id: str | None = None,
    ) -> list[str]:
        """
        Get list of widget IDs the user can access based on permissions.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            project_id: Optional project ID for project-specific permissions

        Returns:
            List of widget IDs the user can access
        """
        permissions = await self.get_effective_permissions(
            workspace_id, developer_id, project_id
        )
        return get_accessible_widgets(permissions)

    async def get_user_role_info(
        self,
        workspace_id: str,
        developer_id: str,
        project_id: str | None = None,
    ) -> dict:
        """
        Get role information for a user.

        Returns:
            Dict with role_id, role_name, has_project_override, etc.
        """
        org_member = await self._get_workspace_member(workspace_id, developer_id)
        if not org_member:
            return {
                "role_id": None,
                "role_name": None,
                "has_project_override": False,
            }

        role_id = org_member.role_id
        role_name = None
        has_project_override = False

        # Get org role name
        if org_member.role_id:
            org_role = await self._get_role(org_member.role_id)
            if org_role:
                role_name = org_role.name
        elif org_member.role:
            template = ROLE_TEMPLATES.get(org_member.role)
            if template:
                role_name = template.get("name")

        # Check for project override
        if project_id:
            project_member = await self._get_project_member(project_id, developer_id)
            if project_member and project_member.role_id:
                project_role = await self._get_role(project_member.role_id)
                if project_role:
                    role_id = project_role.id
                    role_name = project_role.name
                    has_project_override = True

        return {
            "role_id": role_id,
            "role_name": role_name,
            "has_project_override": has_project_override,
        }

    # Helper methods
    async def _get_workspace_member(
        self, workspace_id: str, developer_id: str
    ) -> WorkspaceMember | None:
        """Get workspace member record."""
        stmt = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.developer_id == developer_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _is_workspace_owner(self, workspace_id: str, developer_id: str) -> bool:
        """Whether this developer owns the workspace, per `workspaces.owner_id`."""
        from aexy.models.workspace import Workspace

        owner_id = (
            await self.db.execute(
                select(Workspace.owner_id).where(Workspace.id == workspace_id)
            )
        ).scalar_one_or_none()
        return owner_id is not None and str(owner_id) == str(developer_id)

    async def _get_project_member(
        self, project_id: str, developer_id: str
    ) -> ProjectMember | None:
        """Get project member record."""
        stmt = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.developer_id == developer_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_role(self, role_id: str) -> CustomRole | None:
        """Get custom role by ID."""
        stmt = select(CustomRole).where(CustomRole.id == role_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
