"""App access resolution and management service.

This service handles app and module access control for workspace members.

Access Resolution Order:
1. Workspace-level app settings (baseline - which apps are enabled for the workspace)
2. Role-based app defaults (from role template)
3. Member-specific app_permissions overrides
4. Granular permission check (existing 42 permissions)
5. Admin override (admins see all enabled workspace apps)
"""

from typing import TypedDict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from aexy.models.workspace import WorkspaceMember, Workspace
from aexy.models.role import CustomRole
from aexy.models.app_access import AppAccessTemplate, AppAccessLog, AppAccessLogAction
from aexy.models.app_definitions import (
    APP_CATALOG,
    SYSTEM_APP_BUNDLES,
    ROLE_DEFAULT_APP_ACCESS,
    get_default_app_access_for_role,
    validate_app_access_config,
)
from aexy.models.permissions import ROLE_TEMPLATES


class EffectiveAppAccess(TypedDict):
    """Effective app access for a member."""

    app_id: str
    enabled: bool
    modules: dict[str, bool]  # module_id -> enabled


class AppAccessStatus(TypedDict):
    """Full access status response."""

    apps: dict[str, EffectiveAppAccess]
    applied_template_id: str | None
    applied_template_name: str | None
    has_custom_overrides: bool
    is_admin: bool


class AppAccessService:
    """
    Service for resolving and managing app access.

    Handles the resolution of what apps and modules a member can access
    based on workspace settings, role defaults, and member overrides.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_effective_access(
        self,
        workspace_id: str,
        developer_id: str,
    ) -> AppAccessStatus:
        """
        Get effective app access for a member.

        Resolution order:
        1. Start with workspace-level app settings
        2. Apply role-based defaults
        3. Apply member-specific overrides
        4. Admin override: admins see all workspace-enabled apps

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID

        Returns:
            AppAccessStatus with resolved access for all apps
        """
        # Get workspace member with role
        member = await self._get_workspace_member(workspace_id, developer_id)
        if not member or member.status != "active":
            return self._empty_access_status()

        # Check if user is admin/owner
        is_admin = await self._is_admin(member)

        # Get workspace settings for app access
        workspace = await self._get_workspace(workspace_id)
        workspace_app_settings = {}
        if workspace and workspace.settings:
            workspace_app_settings = workspace.settings.get("app_settings", {})

        # Step 1: Start with role-based defaults
        role_template_id = self._get_role_template_id(member)
        role_defaults = get_default_app_access_for_role(role_template_id)

        # Step 2: Get member's app_permissions
        member_app_perms = member.app_permissions or {}
        member_apps = member_app_perms.get("apps", {})

        # Check for legacy format (flat {app_id: bool}) and convert
        if member_apps == {} and member_app_perms:
            # Check if this looks like legacy format
            is_legacy = any(
                isinstance(v, bool) for v in member_app_perms.values()
                if not isinstance(v, dict)
            )
            if is_legacy:
                # Convert legacy format
                member_apps = {}
                for app_id, enabled in member_app_perms.items():
                    if app_id in ("apps", "applied_template_id", "custom_overrides"):
                        continue
                    if isinstance(enabled, bool):
                        member_apps[app_id] = {"enabled": enabled, "modules": {}}

        applied_template_id = member_app_perms.get("applied_template_id")
        has_custom_overrides = member_app_perms.get("custom_overrides", False)

        # Step 3: Resolve each app's access
        apps: dict[str, EffectiveAppAccess] = {}

        for app_id, app_config in APP_CATALOG.items():
            # Start with role defaults
            role_app_config = role_defaults.get(app_id, {"enabled": False})
            enabled = role_app_config.get("enabled", False)
            role_modules = role_app_config.get("modules", {})

            # Apply member overrides
            member_app_config = member_apps.get(app_id, {})
            if member_app_config:
                # If member has explicit setting, use it
                if "enabled" in member_app_config:
                    enabled = member_app_config["enabled"]

            # Admin override: admins see all apps
            if is_admin:
                enabled = True

            # Workspace-level disable: if workspace disabled this app, override everything
            workspace_app_enabled = workspace_app_settings.get(app_id, True)
            if not workspace_app_enabled:
                enabled = False

            # Resolve modules
            modules: dict[str, bool] = {}
            app_modules = app_config.get("modules", {})

            for module_id in app_modules:
                # Start with role default or True (if no role config)
                module_enabled = role_modules.get(module_id, True)

                # Apply member override
                member_modules = member_app_config.get("modules", {})
                if module_id in member_modules:
                    module_enabled = member_modules[module_id]

                # Admin override
                if is_admin:
                    module_enabled = True

                modules[module_id] = module_enabled

            apps[app_id] = {
                "app_id": app_id,
                "enabled": enabled,
                "modules": modules,
            }

        # Get template name if applied
        applied_template_name = None
        if applied_template_id:
            template = await self._get_template(applied_template_id)
            if template:
                applied_template_name = template.name

        return {
            "apps": apps,
            "applied_template_id": applied_template_id,
            "applied_template_name": applied_template_name,
            "has_custom_overrides": has_custom_overrides,
            "is_admin": is_admin,
        }

    async def check_app_access(
        self,
        workspace_id: str,
        developer_id: str,
        app_id: str,
    ) -> bool:
        """
        Check if a member has access to a specific app.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            app_id: App ID to check

        Returns:
            True if member has access to the app
        """
        access = await self.get_effective_access(workspace_id, developer_id)
        app_access = access["apps"].get(app_id)
        if not app_access:
            return False
        return app_access["enabled"]

    async def check_module_access(
        self,
        workspace_id: str,
        developer_id: str,
        app_id: str,
        module_id: str,
    ) -> bool:
        """
        Check if a member has access to a specific module.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            app_id: App ID
            module_id: Module ID to check

        Returns:
            True if member has access to the module
        """
        access = await self.get_effective_access(workspace_id, developer_id)
        app_access = access["apps"].get(app_id)
        if not app_access or not app_access["enabled"]:
            return False

        # If app has no modules, access is granted via app enabled
        if not app_access["modules"]:
            return True

        return app_access["modules"].get(module_id, False)

    async def update_member_access(
        self,
        workspace_id: str,
        developer_id: str,
        app_config: dict,
        applied_template_id: str | None = None,
    ) -> WorkspaceMember:
        """
        Update a member's app access configuration.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            app_config: New app configuration {app_id: {enabled, modules}}
            applied_template_id: Template ID if applying a template

        Returns:
            Updated WorkspaceMember
        """
        member = await self._get_workspace_member(workspace_id, developer_id)
        if not member:
            raise ValueError("Member not found")

        # Validate the config
        is_valid, error = validate_app_access_config({"apps": app_config})
        if not is_valid:
            raise ValueError(f"Invalid app config: {error}")

        # Determine if there are custom overrides
        has_custom = False
        if applied_template_id:
            template = await self._get_template(applied_template_id)
            if template:
                # Compare with template to detect overrides
                for app_id, config in app_config.items():
                    template_app = template.app_config.get(app_id, {})
                    if config != template_app:
                        has_custom = True
                        break

        # Update the member's app_permissions
        member.app_permissions = {
            "apps": app_config,
            "applied_template_id": applied_template_id,
            "custom_overrides": has_custom,
        }

        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def apply_template_to_member(
        self,
        workspace_id: str,
        developer_id: str,
        template_id: str,
    ) -> WorkspaceMember:
        """
        Apply an app access template to a member.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            template_id: Template ID to apply

        Returns:
            Updated WorkspaceMember
        """
        template = await self._get_template(template_id)
        if not template:
            raise ValueError("Template not found")

        # If template is workspace-specific, verify it belongs to this workspace
        if template.workspace_id and template.workspace_id != workspace_id:
            raise ValueError("Template does not belong to this workspace")

        member = await self._get_workspace_member(workspace_id, developer_id)
        if not member:
            raise ValueError("Member not found")

        # Apply template config
        member.app_permissions = {
            "apps": template.app_config,
            "applied_template_id": str(template.id),
            "custom_overrides": False,
        }

        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def bulk_apply_template(
        self,
        workspace_id: str,
        developer_ids: list[str],
        template_id: str,
    ) -> list[WorkspaceMember]:
        """
        Apply an app access template to multiple members.

        Args:
            workspace_id: Workspace ID
            developer_ids: List of developer IDs
            template_id: Template ID to apply

        Returns:
            List of updated WorkspaceMembers
        """
        template = await self._get_template(template_id)
        if not template:
            raise ValueError("Template not found")

        if template.workspace_id and template.workspace_id != workspace_id:
            raise ValueError("Template does not belong to this workspace")

        # Get all members
        stmt = select(WorkspaceMember).where(
            and_(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.developer_id.in_(developer_ids),
                WorkspaceMember.status == "active",
            )
        )
        result = await self.db.execute(stmt)
        members = list(result.scalars().all())

        # Update each member
        app_permissions = {
            "apps": template.app_config,
            "applied_template_id": str(template.id),
            "custom_overrides": False,
        }

        for member in members:
            member.app_permissions = app_permissions

        await self.db.commit()

        # Refresh all
        for member in members:
            await self.db.refresh(member)

        return members

    async def reset_member_to_role_defaults(
        self,
        workspace_id: str,
        developer_id: str,
    ) -> WorkspaceMember:
        """
        Reset a member's app access to their role defaults.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID

        Returns:
            Updated WorkspaceMember
        """
        member = await self._get_workspace_member(workspace_id, developer_id)
        if not member:
            raise ValueError("Member not found")

        # Clear app_permissions to fall back to role defaults
        member.app_permissions = None

        await self.db.commit()
        await self.db.refresh(member)
        return member

    # Template management
    async def list_templates(
        self,
        workspace_id: str,
        include_system: bool = True,
    ) -> list[AppAccessTemplate]:
        """
        List available app access templates.

        Args:
            workspace_id: Workspace ID
            include_system: Include system templates

        Returns:
            List of templates
        """
        conditions = [AppAccessTemplate.is_active == True]

        if include_system:
            conditions.append(
                (AppAccessTemplate.workspace_id == workspace_id)
                | (AppAccessTemplate.workspace_id.is_(None))
            )
        else:
            conditions.append(AppAccessTemplate.workspace_id == workspace_id)

        stmt = select(AppAccessTemplate).where(and_(*conditions))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_template(self, template_id: str) -> AppAccessTemplate | None:
        """Get a template by ID."""
        return await self._get_template(template_id)

    async def create_template(
        self,
        workspace_id: str,
        name: str,
        app_config: dict,
        description: str | None = None,
        icon: str = "Package",
        color: str = "#6366f1",
    ) -> AppAccessTemplate:
        """
        Create a custom app access template.

        Args:
            workspace_id: Workspace ID
            name: Template name
            app_config: App configuration
            description: Optional description
            icon: Icon name
            color: Color hex code

        Returns:
            Created template
        """
        from aexy.models.app_access import generate_slug

        # Validate config
        is_valid, error = validate_app_access_config({"apps": app_config})
        if not is_valid:
            raise ValueError(f"Invalid app config: {error}")

        slug = generate_slug(name)

        template = AppAccessTemplate(
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            icon=icon,
            color=color,
            app_config=app_config,
            is_system=False,
            is_active=True,
        )

        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)
        return template

    async def update_template(
        self,
        template_id: str,
        workspace_id: str,
        **kwargs,
    ) -> AppAccessTemplate:
        """
        Update a custom template.

        Args:
            template_id: Template ID
            workspace_id: Workspace ID (for verification)
            **kwargs: Fields to update

        Returns:
            Updated template
        """
        template = await self._get_template(template_id)
        if not template:
            raise ValueError("Template not found")

        if template.is_system:
            raise ValueError("Cannot modify system templates")

        if template.workspace_id != workspace_id:
            raise ValueError("Template does not belong to this workspace")

        # Validate app_config if being updated
        if "app_config" in kwargs:
            is_valid, error = validate_app_access_config({"apps": kwargs["app_config"]})
            if not is_valid:
                raise ValueError(f"Invalid app config: {error}")

        # Update fields
        for key, value in kwargs.items():
            if hasattr(template, key):
                setattr(template, key, value)

        await self.db.commit()
        await self.db.refresh(template)
        return template

    async def delete_template(
        self,
        template_id: str,
        workspace_id: str,
    ) -> bool:
        """
        Delete a custom template (soft delete).

        Args:
            template_id: Template ID
            workspace_id: Workspace ID (for verification)

        Returns:
            True if deleted
        """
        template = await self._get_template(template_id)
        if not template:
            raise ValueError("Template not found")

        if template.is_system:
            raise ValueError("Cannot delete system templates")

        if template.workspace_id != workspace_id:
            raise ValueError("Template does not belong to this workspace")

        template.is_active = False
        await self.db.commit()
        return True

    # Access matrix for bulk viewing
    async def get_access_matrix(
        self,
        workspace_id: str,
    ) -> list[dict]:
        """
        Get access matrix for all active members.

        Returns list of members with their app access summary.
        """
        stmt = (
            select(WorkspaceMember)
            .options(
                selectinload(WorkspaceMember.developer),
                selectinload(WorkspaceMember.custom_role),
            )
            .where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.status == "active",
                )
            )
        )
        result = await self.db.execute(stmt)
        members = list(result.scalars().all())

        matrix = []
        for member in members:
            access = await self.get_effective_access(
                workspace_id, str(member.developer_id)
            )

            # Summarize access per app
            app_summary = {}
            for app_id, app_access in access["apps"].items():
                if not app_access["enabled"]:
                    app_summary[app_id] = "none"
                elif not app_access["modules"]:
                    app_summary[app_id] = "full"
                else:
                    # Check if all modules enabled
                    enabled_count = sum(1 for v in app_access["modules"].values() if v)
                    total_count = len(app_access["modules"])
                    if enabled_count == total_count:
                        app_summary[app_id] = "full"
                    elif enabled_count > 0:
                        app_summary[app_id] = "partial"
                    else:
                        app_summary[app_id] = "none"

            matrix.append({
                "developer_id": str(member.developer_id),
                "developer_name": member.developer.name if member.developer else None,
                "developer_email": member.developer.email if member.developer else None,
                "role_name": (
                    member.custom_role.name if member.custom_role
                    else ROLE_TEMPLATES.get(member.role, {}).get("name", member.role)
                ),
                "applied_template_id": access["applied_template_id"],
                "applied_template_name": access["applied_template_name"],
                "has_custom_overrides": access["has_custom_overrides"],
                "is_admin": access["is_admin"],
                "apps": app_summary,
            })

        return matrix

    # Helper methods
    async def _get_workspace_member(
        self, workspace_id: str, developer_id: str
    ) -> WorkspaceMember | None:
        """Get workspace member record."""
        stmt = (
            select(WorkspaceMember)
            .options(selectinload(WorkspaceMember.custom_role))
            .where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_workspace(self, workspace_id: str) -> Workspace | None:
        """Get workspace record."""
        stmt = select(Workspace).where(Workspace.id == workspace_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_template(self, template_id: str) -> AppAccessTemplate | None:
        """Get template by ID."""
        stmt = select(AppAccessTemplate).where(
            and_(
                AppAccessTemplate.id == template_id,
                AppAccessTemplate.is_active == True,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _is_admin(self, member: WorkspaceMember) -> bool:
        """Check if member is admin or owner."""
        # Check legacy role
        if member.role in ("admin", "owner"):
            return True

        # Check custom role
        if member.custom_role:
            # Check if based on admin/owner template or has high priority
            if member.custom_role.based_on_template in ("admin", "owner"):
                return True
            if member.custom_role.priority >= 100:
                return True

        return False

    def _get_role_template_id(self, member: WorkspaceMember) -> str:
        """Get the role template ID for a member."""
        # Check custom role
        if member.custom_role and member.custom_role.based_on_template:
            return member.custom_role.based_on_template

        # Fall back to legacy role
        return member.role or "member"

    def _empty_access_status(self) -> AppAccessStatus:
        """Return empty access status for non-members."""
        apps = {}
        for app_id in APP_CATALOG:
            apps[app_id] = {
                "app_id": app_id,
                "enabled": False,
                "modules": {},
            }
        return {
            "apps": apps,
            "applied_template_id": None,
            "applied_template_name": None,
            "has_custom_overrides": False,
            "is_admin": False,
        }

    # =========================================================================
    # Access Logging (Enterprise Feature)
    # =========================================================================

    async def log_access_event(
        self,
        workspace_id: str,
        actor_id: str | None,
        action: AppAccessLogAction | str,
        target_type: str,
        target_id: str | None = None,
        description: str | None = None,
        old_value: dict | None = None,
        new_value: dict | None = None,
        extra_data: dict | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AppAccessLog:
        """
        Log an access control event.

        Args:
            workspace_id: Workspace ID
            actor_id: Developer who performed the action
            action: Action type (from AppAccessLogAction enum or string)
            target_type: Type of target ("member", "template", "workspace")
            target_id: ID of the target (member ID, template ID, etc.)
            description: Human-readable description
            old_value: Previous state (for updates)
            new_value: New state (for updates)
            extra_data: Additional context
            ip_address: Request IP address
            user_agent: Request user agent

        Returns:
            Created log entry
        """
        action_str = action.value if isinstance(action, AppAccessLogAction) else action

        log = AppAccessLog(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action=action_str,
            target_type=target_type,
            target_id=target_id,
            description=description,
            old_value=old_value,
            new_value=new_value,
            extra_data=extra_data or {},
            ip_address=ip_address,
            user_agent=user_agent,
        )

        self.db.add(log)
        await self.db.commit()
        await self.db.refresh(log)
        return log

    async def get_access_logs(
        self,
        workspace_id: str,
        action: str | None = None,
        target_type: str | None = None,
        target_id: str | None = None,
        actor_id: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[AppAccessLog], int]:
        """
        Get access logs for a workspace.

        Args:
            workspace_id: Workspace ID
            action: Filter by action type
            target_type: Filter by target type
            target_id: Filter by target ID
            actor_id: Filter by actor ID
            limit: Max results to return
            offset: Pagination offset

        Returns:
            Tuple of (logs, total_count)
        """
        from sqlalchemy import func as sql_func
        from sqlalchemy.orm import selectinload

        conditions = [AppAccessLog.workspace_id == workspace_id]

        if action:
            conditions.append(AppAccessLog.action == action)
        if target_type:
            conditions.append(AppAccessLog.target_type == target_type)
        if target_id:
            conditions.append(AppAccessLog.target_id == target_id)
        if actor_id:
            conditions.append(AppAccessLog.actor_id == actor_id)

        # Get total count
        count_stmt = select(sql_func.count()).where(and_(*conditions)).select_from(AppAccessLog)
        count_result = await self.db.execute(count_stmt)
        total_count = count_result.scalar() or 0

        # Get logs with pagination
        stmt = (
            select(AppAccessLog)
            .where(and_(*conditions))
            .order_by(AppAccessLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        logs = list(result.scalars().all())

        return logs, total_count

    async def get_access_log_summary(
        self,
        workspace_id: str,
        days: int = 30,
    ) -> dict:
        """
        Get summary statistics for access logs.

        Args:
            workspace_id: Workspace ID
            days: Number of days to summarize

        Returns:
            Summary statistics
        """
        from sqlalchemy import func as sql_func
        from datetime import datetime, timedelta

        cutoff = datetime.utcnow() - timedelta(days=days)

        # Action counts
        action_stmt = (
            select(AppAccessLog.action, sql_func.count())
            .where(
                and_(
                    AppAccessLog.workspace_id == workspace_id,
                    AppAccessLog.created_at >= cutoff,
                )
            )
            .group_by(AppAccessLog.action)
        )
        action_result = await self.db.execute(action_stmt)
        action_counts = dict(action_result.all())

        # Daily counts
        daily_stmt = (
            select(
                sql_func.date(AppAccessLog.created_at).label("date"),
                sql_func.count().label("count"),
            )
            .where(
                and_(
                    AppAccessLog.workspace_id == workspace_id,
                    AppAccessLog.created_at >= cutoff,
                )
            )
            .group_by(sql_func.date(AppAccessLog.created_at))
            .order_by(sql_func.date(AppAccessLog.created_at))
        )
        daily_result = await self.db.execute(daily_stmt)
        daily_counts = [
            {"date": str(row.date), "count": row.count}
            for row in daily_result.all()
        ]

        # Recent access denials
        denials_stmt = (
            select(AppAccessLog)
            .where(
                and_(
                    AppAccessLog.workspace_id == workspace_id,
                    AppAccessLog.action == AppAccessLogAction.ACCESS_DENIED.value,
                    AppAccessLog.created_at >= cutoff,
                )
            )
            .order_by(AppAccessLog.created_at.desc())
            .limit(10)
        )
        denials_result = await self.db.execute(denials_stmt)
        recent_denials = list(denials_result.scalars().all())

        return {
            "action_counts": action_counts,
            "daily_counts": daily_counts,
            "recent_denials": [
                {
                    "id": str(d.id),
                    "actor_id": str(d.actor_id) if d.actor_id else None,
                    "target_id": str(d.target_id) if d.target_id else None,
                    "extra_data": d.extra_data,
                    "created_at": d.created_at.isoformat(),
                }
                for d in recent_denials
            ],
            "total_events": sum(action_counts.values()),
            "period_days": days,
        }
