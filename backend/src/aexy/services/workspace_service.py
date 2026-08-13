"""Workspace service for managing workspaces and members."""

import logging
import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.workspace import Workspace, WorkspaceMember, WorkspaceSubscription, WorkspacePendingInvite
import secrets
from aexy.models.developer import Developer
from aexy.models.repository import Organization, DeveloperOrganization
from aexy.services.task_config_service import TaskConfigService
from aexy.services.document_space_service import DocumentSpaceService


logger = logging.getLogger(__name__)

# Sentinel for "this field was not sent", so an explicit null can mean "clear it".
UNSET = object()


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:100]


class WorkspaceService:
    """Service for workspace CRUD and membership management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_workspace(
        self,
        name: str,
        owner_id: str,
        type: str = "internal",
        github_org_id: str | None = None,
        description: str | None = None,
    ) -> Workspace:
        """Create a new workspace.

        Args:
            name: Workspace display name.
            owner_id: Developer ID of the owner.
            type: "internal" or "github_linked".
            github_org_id: GitHub org ID if linking.
            description: Optional description.

        Returns:
            Created Workspace.
        """
        # Generate unique slug
        base_slug = generate_slug(name)
        slug = base_slug
        counter = 1

        while True:
            existing = await self.db.execute(
                select(Workspace).where(Workspace.slug == slug)
            )
            if not existing.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        workspace = Workspace(
            id=str(uuid4()),
            name=name,
            slug=slug,
            type=type,
            description=description,
            github_org_id=github_org_id,
            owner_id=owner_id,
            settings={},
            is_active=True,
        )
        self.db.add(workspace)

        # Add owner as first member
        owner_member = WorkspaceMember(
            id=str(uuid4()),
            workspace_id=workspace.id,
            developer_id=owner_id,
            role="owner",
            status="active",
            is_billable=True,
            joined_at=datetime.now(timezone.utc),
            billing_start_date=datetime.now(timezone.utc),
        )
        self.db.add(owner_member)

        await self.db.flush()
        await self.db.refresh(workspace)

        # Seed default task statuses for the workspace
        task_config_service = TaskConfigService(self.db)
        await task_config_service.seed_default_statuses(workspace.id)

        # Create default document space for the workspace
        space_service = DocumentSpaceService(self.db)
        await space_service.create_default_space(
            workspace_id=workspace.id,
            created_by_id=owner_id,
        )

        return workspace

    async def get_workspace(self, workspace_id: str) -> Workspace | None:
        """Get a workspace by ID."""
        stmt = (
            select(Workspace)
            .where(Workspace.id == workspace_id)
            .options(selectinload(Workspace.members))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_workspace_by_slug(self, slug: str) -> Workspace | None:
        """Get a workspace by slug."""
        stmt = select(Workspace).where(Workspace.slug == slug)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_user_workspaces(self, developer_id: str) -> list[Workspace]:
        """List all workspaces a developer is a member of."""
        stmt = (
            select(Workspace)
            .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
            .where(
                WorkspaceMember.developer_id == developer_id,
                WorkspaceMember.status == "active",
                Workspace.is_active == True,
            )
            .order_by(Workspace.name)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_workspace(
        self,
        workspace_id: str,
        name: str | None = None,
        description: str | None = None,
        avatar_url: str | None = None,
        settings: dict | None = None,
    ) -> Workspace | None:
        """Update a workspace."""
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return None

        if name is not None:
            workspace.name = name
        if description is not None:
            workspace.description = description
        if avatar_url is not None:
            workspace.avatar_url = avatar_url
        if settings is not None:
            workspace.settings = settings

        await self.db.flush()
        await self.db.refresh(workspace)
        return workspace

    async def delete_workspace(self, workspace_id: str) -> bool:
        """Delete a workspace (soft delete by setting is_active=False)."""
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return False

        workspace.is_active = False
        await self.db.flush()
        return True

    # Member management
    async def _promote_community_account(self, developer_id: str, role: str) -> None:
        """When a community-only account is granted a real workspace role, lift
        the isolation flag so they become a normal internal user.

        No-op for the ``community`` role itself (that path never runs through
        ``add_member`` anyway) and for accounts that are already internal. The
        change takes effect on their next login-issued token.
        """
        if role == "community":
            return
        developer = await self.db.get(Developer, developer_id)
        if developer is not None and getattr(developer, "account_type", "internal") == "community":
            developer.account_type = "internal"
            await self.db.flush()

    async def add_member(
        self,
        workspace_id: str,
        developer_id: str,
        role: str = "member",
        invited_by_id: str | None = None,
        status: str = "active",
    ) -> WorkspaceMember:
        """Add a member to a workspace."""
        await self._promote_community_account(developer_id, role)
        # Check if already a member
        existing = await self.get_member(workspace_id, developer_id)
        if existing:
            if existing.status == "removed":
                # Reactivate removed member
                existing.status = status
                existing.role = role
                existing.joined_at = datetime.now(timezone.utc) if status == "active" else None
                await self.db.flush()
                await self.db.refresh(existing)
                return existing
            elif existing.status == "pending" and status == "active":
                # Activate pending member (e.g., when accepting invite)
                existing.status = "active"
                existing.role = role
                existing.joined_at = datetime.now(timezone.utc)
                existing.billing_start_date = datetime.now(timezone.utc)
                await self.db.flush()
                await self.db.refresh(existing)
                return existing
            raise ValueError("Developer is already a member of this workspace")

        member = WorkspaceMember(
            id=str(uuid4()),
            workspace_id=workspace_id,
            developer_id=developer_id,
            role=role,
            status=status,
            invited_by_id=invited_by_id,
            invited_at=datetime.now(timezone.utc) if status == "pending" else None,
            joined_at=datetime.now(timezone.utc) if status == "active" else None,
            is_billable=True,
            billing_start_date=datetime.now(timezone.utc) if status == "active" else None,
        )
        self.db.add(member)
        await self.db.flush()
        await self.db.refresh(member)

        # Notify the developer they were invited/added to workspace
        try:
            from aexy.services.notification_service import notify_workspace_invite

            workspace = await self.get_workspace(workspace_id)
            ws_name = workspace.name if workspace else "a workspace"
            await notify_workspace_invite(
                db=self.db,
                developer_id=developer_id,
                workspace_name=ws_name,
                workspace_id=workspace_id,
            )
        except Exception:
            pass  # Non-critical

        return member

    async def get_member(
        self, workspace_id: str, developer_id: str
    ) -> WorkspaceMember | None:
        """Get a specific member."""
        stmt = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.developer_id == developer_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def remove_member(self, workspace_id: str, developer_id: str) -> bool:
        """Remove a member from a workspace."""
        member = await self.get_member(workspace_id, developer_id)
        if not member:
            return False

        if member.role == "owner":
            raise ValueError("Cannot remove the workspace owner")

        member.status = "removed"
        await self.db.flush()
        return True

    async def update_member_role(
        self,
        workspace_id: str,
        developer_id: str,
        new_role: str | None = None,
        new_role_id: str | None | object = UNSET,
    ) -> WorkspaceMember | None:
        """Update a member's legacy role and/or the custom role assigned to them.

        ``new_role_id`` is what makes capabilities that no legacy template
        carries — full Service Desk visibility, for one — grantable and
        revocable natively: the permission resolver reads the custom role's
        permission list in place of the template. ``UNSET`` leaves it alone,
        ``None`` clears it.
        """
        member = await self.get_member(workspace_id, developer_id)
        if not member:
            return None

        if new_role is not None:
            if member.role == "owner" and new_role != "owner":
                raise ValueError("Cannot change the owner's role")
            member.role = new_role

        if new_role_id is not UNSET:
            if new_role_id is not None:
                # A role id from another workspace would silently import that
                # workspace's permission set.
                from aexy.models.role import CustomRole

                found = (
                    await self.db.execute(
                        select(CustomRole.id).where(
                            CustomRole.id == new_role_id,
                            CustomRole.workspace_id == workspace_id,
                        )
                    )
                ).scalar_one_or_none()
                if found is None:
                    raise ValueError("Role not found in this workspace")
            member.role_id = new_role_id

        await self.db.flush()
        await self.db.refresh(member)
        # Role is the access baseline for anyone whose departments carry no
        # profile, so a role change can change what they see and reach.
        await self._invalidate_access_cache(workspace_id)
        return member

    async def set_member_status(
        self,
        workspace_id: str,
        developer_id: str,
        new_status: str,
    ) -> WorkspaceMember | None:
        """Toggle a member between "active" and "removed".

        Used by the admin "Mark as left" / "Restore" actions on the
        workspace members page. Distinct from `remove_member` because it
        also supports the *un*-remove transition without re-running the
        invite flow — the WorkspaceMember row stays put, only the
        status flips, so history (commits, reviews, etc.) attributed to
        the member is preserved across the round-trip.
        """
        allowed = {"active", "removed"}
        if new_status not in allowed:
            raise ValueError(
                f"status must be one of {sorted(allowed)}, got {new_status!r}"
            )

        member = await self.get_member(workspace_id, developer_id)
        if not member:
            return None

        if member.role == "owner" and new_status == "removed":
            raise ValueError("Cannot mark the workspace owner as left")

        was_pending = member.status == "pending"
        member.status = new_status
        await self.db.flush()
        await self.db.refresh(member)
        # A removed member resolves to no access at all; that has to bite now,
        # not at the end of a cache window.
        await self._invalidate_access_cache(workspace_id)

        # Deciding a *pending* member is deciding a join request, and the
        # requester was previously told nothing either way — the admins got the
        # `workspace_join_request` notification and the person waiting got a
        # screen that never changed. A status flip on an already-active member is
        # the "Mark as left" / "Restore" admin action, which is not a join
        # decision and stays silent.
        if was_pending:
            from aexy.models.workspace import Workspace
            from aexy.services.notification_service import notify_workspace_join_decided

            workspace = await self.db.get(Workspace, workspace_id)
            await notify_workspace_join_decided(
                db=self.db,
                requester_id=str(developer_id),
                workspace_id=str(workspace_id),
                workspace_name=workspace.name if workspace else "the workspace",
                approved=new_status == "active",
            )

        return member

    async def get_members(
        self,
        workspace_id: str,
        include_pending: bool = False,
        include_removed: bool = False,
    ) -> list[WorkspaceMember]:
        """Get all members of a workspace."""
        stmt = (
            select(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == workspace_id)
            .options(selectinload(WorkspaceMember.developer))
        )

        if not include_removed:
            if include_pending:
                stmt = stmt.where(WorkspaceMember.status.in_(["active", "pending"]))
            else:
                stmt = stmt.where(WorkspaceMember.status == "active")

        stmt = stmt.order_by(WorkspaceMember.role, WorkspaceMember.joined_at)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_members_by_role(
        self,
        workspace_id: str,
        role: str,
    ) -> list[WorkspaceMember]:
        """Get all members of a workspace with a specific role."""
        stmt = (
            select(WorkspaceMember)
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.role == role,
                WorkspaceMember.status == "active",
            )
            .options(selectinload(WorkspaceMember.developer))
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_workspace_admins(
        self,
        workspace_id: str,
        exclude_developer_id: str | None = None,
    ) -> list[WorkspaceMember]:
        """Active owners + admins of a workspace, deduped by developer.

        `exclude_developer_id` drops one person from the result — used when
        notifying admins *about an action* so whoever performed it isn't told
        about their own change.
        """
        members: dict[str, WorkspaceMember] = {}
        for role in ("owner", "admin"):
            for member in await self.get_members_by_role(workspace_id, role):
                if exclude_developer_id and str(member.developer_id) == str(exclude_developer_id):
                    continue
                members[str(member.developer_id)] = member
        return list(members.values())

    async def get_member_count(self, workspace_id: str) -> int:
        """Get count of active members."""
        stmt = (
            select(func.count(WorkspaceMember.id))
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def get_billable_seat_count(self, workspace_id: str) -> int:
        """Get count of billable seats."""
        stmt = (
            select(func.count(WorkspaceMember.id))
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
                WorkspaceMember.is_billable == True,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    # GitHub integration
    async def link_github_org(
        self, workspace_id: str, github_org_id: str
    ) -> Workspace | None:
        """Link a GitHub organization to a workspace."""
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return None

        # Verify the GitHub org exists
        stmt = select(Organization).where(Organization.id == github_org_id)
        result = await self.db.execute(stmt)
        github_org = result.scalar_one_or_none()
        if not github_org:
            raise ValueError("GitHub organization not found")

        workspace.github_org_id = github_org_id
        workspace.type = "github_linked"
        if github_org.avatar_url:
            workspace.avatar_url = github_org.avatar_url

        await self.db.flush()
        await self.db.refresh(workspace)
        return workspace

    async def sync_github_org_members(self, workspace_id: str) -> int:
        """Sync members from linked GitHub organization.

        Returns:
            Number of members added.
        """
        workspace = await self.get_workspace(workspace_id)
        if not workspace or not workspace.github_org_id:
            return 0

        # Get developers who are part of the GitHub org
        stmt = (
            select(DeveloperOrganization)
            .where(
                DeveloperOrganization.organization_id == workspace.github_org_id,
                DeveloperOrganization.is_enabled == True,
            )
        )
        result = await self.db.execute(stmt)
        dev_orgs = result.scalars().all()

        added_count = 0
        for dev_org in dev_orgs:
            try:
                # Add as member if not already in workspace
                existing = await self.get_member(workspace_id, dev_org.developer_id)
                if not existing or existing.status == "removed":
                    role = "admin" if dev_org.role == "admin" else "member"
                    await self.add_member(
                        workspace_id=workspace_id,
                        developer_id=dev_org.developer_id,
                        role=role,
                        status="active",
                    )
                    added_count += 1
            except ValueError:
                # Already a member
                pass

        return added_count

    # Check permissions
    async def check_permission(
        self,
        workspace_id: str,
        developer_id: str,
        required_role: str = "member",
    ) -> bool:
        """Check if a developer has the required role in a workspace."""
        member = await self.get_member(workspace_id, developer_id)
        if not member or member.status != "active":
            return False

        # "community" ranks below everything: outside participants who joined via
        # a public forum. They only ever use the public endpoints; this keeps
        # them below "member" so they can never pass an internal permission gate.
        role_hierarchy = {"owner": 4, "admin": 3, "member": 2, "viewer": 1, "community": 0}
        member_level = role_hierarchy.get(member.role, 0)
        required_level = role_hierarchy.get(required_role, 0)

        return member_level >= required_level

    async def is_owner(self, workspace_id: str, developer_id: str) -> bool:
        """Check if a developer is the *active* workspace owner.

        Defense-in-depth: `remove_member` already refuses to flip an
        owner row to `removed`, but a future bug or direct DB edit
        could break that invariant. Require active membership here so
        the check matches `check_permission`'s behavior.
        """
        member = await self.get_member(workspace_id, developer_id)
        return (
            member is not None
            and member.role == "owner"
            and member.status == "active"
        )

    # Pending Invites
    async def create_pending_invite(
        self,
        workspace_id: str,
        email: str,
        role: str = "member",
        invited_by_id: str | None = None,
        app_permissions: dict | None = None,
        expires_days: int = 7,
        department_id: str | None = None,
        role_in_department: str | None = None,
        team_id: str | None = None,
        role_in_team: str | None = None,
    ) -> WorkspacePendingInvite:
        """Create a pending invite for a non-existing user.

        ``department_id`` and ``team_id`` are both optional and both applied when
        the invite is accepted (see ``accept_pending_invite``). They answer
        different questions: the department decides what the person can see, the
        team decides who chases them for standups, escalations and approvals.
        """
        from datetime import timedelta

        # Check if already invited
        existing = await self.get_pending_invite_by_email(workspace_id, email)
        if existing and existing.status == "pending":
            raise ValueError("An invitation has already been sent to this email")

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)

        invite = WorkspacePendingInvite(
            id=str(uuid4()),
            workspace_id=workspace_id,
            email=email.lower(),
            role=role,
            token=token,
            invited_by_id=invited_by_id,
            app_permissions=app_permissions,
            department_id=department_id,
            role_in_department=role_in_department,
            team_id=team_id,
            role_in_team=role_in_team,
            status="pending",
            expires_at=expires_at,
        )
        self.db.add(invite)
        await self.db.flush()
        await self.db.refresh(invite)
        return invite

    async def get_pending_invites_for_email(
        self, email: str
    ) -> list[WorkspacePendingInvite]:
        """Get all pending, non-expired invites across all workspaces for a given email."""
        stmt = (
            select(WorkspacePendingInvite)
            .where(
                func.lower(WorkspacePendingInvite.email) == email.lower(),
                WorkspacePendingInvite.status == "pending",
                WorkspacePendingInvite.expires_at > datetime.now(timezone.utc),
            )
            .options(
                selectinload(WorkspacePendingInvite.workspace),
                selectinload(WorkspacePendingInvite.invited_by),
            )
            .order_by(WorkspacePendingInvite.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_pending_invite_by_email(
        self, workspace_id: str, email: str
    ) -> WorkspacePendingInvite | None:
        """Get a pending invite by email."""
        stmt = select(WorkspacePendingInvite).where(
            WorkspacePendingInvite.workspace_id == workspace_id,
            WorkspacePendingInvite.email == email.lower(),
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_pending_invite_by_token(
        self, token: str
    ) -> WorkspacePendingInvite | None:
        """Get a pending invite by token."""
        stmt = (
            select(WorkspacePendingInvite)
            .where(
                WorkspacePendingInvite.token == token,
                WorkspacePendingInvite.status == "pending",
            )
            .options(
                selectinload(WorkspacePendingInvite.workspace),
                selectinload(WorkspacePendingInvite.invited_by),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_pending_invites(
        self, workspace_id: str
    ) -> list[WorkspacePendingInvite]:
        """Get all pending invites for a workspace."""
        stmt = (
            select(WorkspacePendingInvite)
            .where(
                WorkspacePendingInvite.workspace_id == workspace_id,
                WorkspacePendingInvite.status == "pending",
            )
            .options(selectinload(WorkspacePendingInvite.invited_by))
            .order_by(WorkspacePendingInvite.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def accept_pending_invite(
        self, token: str, developer_id: str
    ) -> WorkspaceMember | None:
        """Accept a pending invite and create a member."""
        invite = await self.get_pending_invite_by_token(token)
        if not invite:
            return None

        # Check if invite has expired. Postgres hands back an aware datetime for
        # TIMESTAMPTZ, but not every backend does (SQLite drops the offset), and
        # comparing naive to aware raises TypeError rather than returning False —
        # which would turn a stray naive value into a failed accept.
        if invite.expires_at is not None:
            expires_at = invite.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                invite.status = "expired"
                await self.db.flush()
                return None

        # Create member with the role and permissions from invite
        member = await self.add_member(
            workspace_id=invite.workspace_id,
            developer_id=developer_id,
            role=invite.role,
            invited_by_id=invite.invited_by_id,
            status="active",
        )

        # Apply app permissions if set
        if invite.app_permissions:
            member.app_permissions = invite.app_permissions
            await self.db.flush()
            await self.db.refresh(member)

        if invite.department_id:
            await self._place_in_department(invite, developer_id)
            # The department decides what this person can see, so their sidebar
            # and their reach both depend on the placement above having landed.
            # Nothing has resolved access for them yet, but another worker may
            # have cached the "not a member" answer from a page load moments ago.
            await self._invalidate_access_cache(str(invite.workspace_id))

        if invite.team_id:
            # Independent of the department, and of its success: a joiner can
            # legitimately have one without the other, and neither should be able
            # to cost them the other.
            await self._place_in_team(invite, developer_id)

        # Mark invite as accepted
        invite.status = "accepted"
        await self.db.flush()

        return member

    async def _place_in_team(
        self, invite: WorkspacePendingInvite, developer_id: str
    ) -> None:
        """Apply the invite's optional team placement.

        Best-effort in a savepoint, for the same reason as
        ``_place_in_department``: the team may have been renamed, deactivated or
        deleted in the days between invite and accept, and a stale placement must
        not cost someone their invitation.

        Placement is what makes a joiner reachable — standup prompts, blocker
        escalation, compliance reminders, review digests and leave approvals all
        resolve through team membership, so someone in no team is silently left
        out of all of it rather than visibly broken.
        """
        from aexy.models.team import TEAM_MEMBER_ROLES, Team, TeamMember, TeamMemberRole

        try:
            async with self.db.begin_nested():
                team = (
                    await self.db.execute(
                        select(Team).where(
                            Team.id == invite.team_id,
                            Team.workspace_id == invite.workspace_id,
                            Team.is_active == True,  # noqa: E712
                        )
                    )
                ).scalar_one_or_none()
                if team is None:
                    logger.warning(
                        "Invite %s named team %s, which no longer exists (or is "
                        "inactive) in workspace %s",
                        invite.id, invite.team_id, invite.workspace_id,
                    )
                    return

                # Re-accepting, or an admin who already added them by hand while
                # the invite was outstanding: leave the existing membership alone
                # rather than raising on the unique pair.
                already = (
                    await self.db.execute(
                        select(TeamMember.id).where(
                            TeamMember.team_id == team.id,
                            TeamMember.developer_id == developer_id,
                        )
                    )
                ).scalar_one_or_none()
                if already is not None:
                    return

                # An unrecognised role would exclude them from the lead lookups
                # (see TeamMemberRole), so fall back to plain member rather than
                # storing something half the code ignores.
                role = invite.role_in_team or TeamMemberRole.MEMBER.value
                if role not in TEAM_MEMBER_ROLES:
                    logger.warning(
                        "Invite %s named unknown team role %r; using %r",
                        invite.id, role, TeamMemberRole.MEMBER.value,
                    )
                    role = TeamMemberRole.MEMBER.value

                self.db.add(
                    TeamMember(
                        id=str(uuid4()),
                        team_id=team.id,
                        developer_id=developer_id,
                        role=role,
                        source="manual",
                        joined_at=datetime.now(timezone.utc),
                    )
                )
        except Exception:  # noqa: BLE001 - never block the join
            logger.exception(
                "Could not place developer %s in team %s on invite accept",
                developer_id, invite.team_id,
            )

    @staticmethod
    async def _invalidate_access_cache(workspace_id: str) -> None:
        """Drop cached access resolutions for a workspace, across workers.

        Imported lazily to keep the workspace service importable from the access
        service, which needs the workspace models.
        """
        from aexy.services.app_access_service import invalidate_app_settings_cache

        await invalidate_app_settings_cache(workspace_id)

    async def _place_in_department(
        self, invite: WorkspacePendingInvite, developer_id: str
    ) -> None:
        """Apply the invite's optional department placement.

        Best-effort on purpose: joining the workspace is the outcome that matters,
        and the department may legitimately have been renamed, deleted, or moved
        to another workspace in the days between invite and accept. A stale
        placement must not cost someone their invitation, so this runs in a
        savepoint and only logs on failure.
        """
        from aexy.models.organization import Department, DepartmentMember

        try:
            async with self.db.begin_nested():
                dept = (
                    await self.db.execute(
                        select(Department).where(
                            Department.id == invite.department_id,
                            Department.workspace_id == invite.workspace_id,
                        )
                    )
                ).scalar_one_or_none()
                if dept is None:
                    logger.warning(
                        "Invite %s named department %s, which no longer exists in workspace %s",
                        invite.id, invite.department_id, invite.workspace_id,
                    )
                    return
                # Only claim "primary" if they don't already have one. A second
                # is_primary row violates the one-primary-per-workspace invariant
                # (uq_department_member_primary), so on a database that has the
                # index this INSERT would fail and the placement would be
                # swallowed by the handler below — the person joins with no
                # department, which is precisely what this code exists to avoid.
                has_primary = (
                    await self.db.execute(
                        select(DepartmentMember.id).where(
                            DepartmentMember.workspace_id == invite.workspace_id,
                            DepartmentMember.developer_id == developer_id,
                            DepartmentMember.is_primary.is_(True),
                        )
                    )
                ).scalar_one_or_none()
                self.db.add(
                    DepartmentMember(
                        id=str(uuid4()),
                        workspace_id=invite.workspace_id,
                        department_id=dept.id,
                        developer_id=developer_id,
                        role_in_department=invite.role_in_department or "member",
                        # First department someone lands in is their primary one.
                        is_primary=has_primary is None,
                        source="invite",
                    )
                )
        except Exception:  # noqa: BLE001 - never block the join
            logger.exception(
                "Could not place developer %s in department %s on invite accept",
                developer_id, invite.department_id,
            )

    async def revoke_pending_invite(self, workspace_id: str, invite_id: str) -> bool:
        """Revoke a pending invite."""
        stmt = select(WorkspacePendingInvite).where(
            WorkspacePendingInvite.id == invite_id,
            WorkspacePendingInvite.workspace_id == workspace_id,
            WorkspacePendingInvite.status == "pending",
        )
        result = await self.db.execute(stmt)
        invite = result.scalar_one_or_none()
        if not invite:
            return False

        invite.status = "revoked"
        await self.db.flush()
        return True

    async def resend_pending_invite(
        self, workspace_id: str, invite_id: str, expires_days: int = 7
    ) -> WorkspacePendingInvite | None:
        """Resend a pending invite by extending its expiry date."""
        from datetime import timedelta

        stmt = select(WorkspacePendingInvite).where(
            WorkspacePendingInvite.id == invite_id,
            WorkspacePendingInvite.workspace_id == workspace_id,
            WorkspacePendingInvite.status == "pending",
        )
        result = await self.db.execute(stmt)
        invite = result.scalar_one_or_none()
        if not invite:
            return None

        # Extend expiry date
        invite.expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)
        await self.db.flush()
        await self.db.refresh(invite)
        return invite

    # App Permissions
    async def update_member_app_permissions(
        self,
        workspace_id: str,
        developer_id: str,
        app_permissions: dict,
    ) -> WorkspaceMember | None:
        """Update a member's app permissions."""
        member = await self.get_member(workspace_id, developer_id)
        if not member:
            return None

        member.app_permissions = app_permissions
        await self.db.flush()
        await self.db.refresh(member)
        await self._invalidate_access_cache(workspace_id)
        return member

    async def get_workspace_app_settings(self, workspace_id: str) -> dict:
        """Get workspace-level app settings."""
        from aexy.models.app_definitions import APP_CATALOG

        defaults = {app_id: True for app_id in APP_CATALOG}
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return defaults

        stored = workspace.settings.get("app_settings", {})
        return {**defaults, **stored}

    async def update_workspace_app_settings(
        self, workspace_id: str, app_settings: dict
    ) -> Workspace | None:
        """Update workspace-level app settings."""
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return None

        # Create a new dict to ensure SQLAlchemy detects the change
        settings = dict(workspace.settings or {})
        settings["app_settings"] = app_settings
        workspace.settings = settings

        await self.db.flush()
        await self.db.refresh(workspace)

        from aexy.services.app_access_service import invalidate_app_settings_cache

        await invalidate_app_settings_cache(workspace_id)
        return workspace

    def get_effective_app_permissions(
        self, workspace_settings: dict, member_permissions: dict | None
    ) -> dict:
        """Get effective app permissions for a member (member overrides workspace)."""
        # Start with workspace defaults
        effective = workspace_settings.copy()

        # Override with member-specific permissions
        if member_permissions:
            effective.update(member_permissions)

        return effective
