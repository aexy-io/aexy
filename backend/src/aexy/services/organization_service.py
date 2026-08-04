"""Organization structure service — departments, membership, org chart.

Hierarchy is stored as a materialized ``path`` of ancestor ids (incl. self),
so subtree reads and re-parenting are simple string operations. See
``models/organization.py``.
"""

import re
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import (
    Department,
    DepartmentMember,
    DepartmentPosition,
)
from aexy.models.workspace import WorkspaceMember
from aexy.schemas.organization import (
    DepartmentCreate,
    DepartmentDetail,
    DepartmentNode,
    DepartmentResponse,
    DepartmentUpdate,
    MemberSummary,
    MembershipCreate,
    MembershipUpdate,
    PersonDepartment,
    PersonSummary,
    PositionCreate,
    PositionResponse,
)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "department"


class OrganizationService:
    """CRUD + hierarchy operations for the Organization module."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ---------------------------------------------------------------- helpers

    async def _get(self, workspace_id: str, dept_id: str) -> Department:
        dept = (
            await self.db.execute(
                select(Department).where(
                    Department.id == dept_id,
                    Department.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if dept is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
        return dept

    async def _require_workspace_member(self, workspace_id: str, developer_id: str) -> WorkspaceMember:
        """A person must already belong to the workspace to appear in its org.

        Without this, any developer id on the platform could be added to a
        department — and ``MemberSummary`` hands back that person's name and
        email, so it would double as a cross-workspace read of someone else's
        contact details.
        """
        member = (
            await self.db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                    WorkspaceMember.status == "active",
                )
            )
        ).scalar_one_or_none()
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="That person is not an active member of this workspace",
            )
        return member

    async def _unique_slug(self, workspace_id: str, base: str, exclude_id: str | None = None) -> str:
        slug = _slugify(base)
        candidate = slug
        n = 1
        while True:
            q = select(Department.id).where(
                Department.workspace_id == workspace_id,
                Department.slug == candidate,
            )
            if exclude_id:
                q = q.where(Department.id != exclude_id)
            exists = (await self.db.execute(q)).first()
            if not exists:
                return candidate
            n += 1
            candidate = f"{slug}-{n}"

    async def _member_counts(self, workspace_id: str) -> dict[str, int]:
        rows = (
            await self.db.execute(
                select(DepartmentMember.department_id, func.count(DepartmentMember.id))
                .join(Department, Department.id == DepartmentMember.department_id)
                .where(Department.workspace_id == workspace_id)
                .group_by(DepartmentMember.department_id)
            )
        ).all()
        return {dept_id: count for dept_id, count in rows}

    @staticmethod
    def _to_response(dept: Department, member_count: int) -> DepartmentResponse:
        resp = DepartmentResponse.model_validate(dept)
        resp.member_count = member_count
        resp.headcount_actual = member_count
        return resp

    # -------------------------------------------------------------- departments

    async def _require_unique_function(
        self, workspace_id: str, function_key: str | None, exclude_id: str | None = None
    ) -> None:
        """409 on a function_key already claimed in this workspace.

        ``uq_department_function_key`` enforces this, but an IntegrityError
        surfaces as a 500 — and the value is meaningful (Service Desk routes
        pending-with by it), so the caller deserves to be told which one clashed.
        """
        if not function_key:
            return
        query = select(Department.name).where(
            Department.workspace_id == workspace_id,
            Department.function_key == function_key,
        )
        if exclude_id:
            query = query.where(Department.id != exclude_id)
        clash = (await self.db.execute(query)).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"The function '{function_key}' is already assigned to '{clash}'",
            )

    async def _require_member_if_set(self, workspace_id: str, developer_id: str | None) -> None:
        """Membership check for the optional people references on a department.

        ``head_id`` and ``filled_by_id`` only FK to ``developers.id``, so any id on
        the platform was referentially valid here — while ``add_member`` and
        ``set_manager`` both check. ``head_id`` is not cosmetic: the digest service
        resolves it to decide who receives the *entire* desk's open-ticket list.
        """
        if developer_id:
            await self._require_workspace_member(workspace_id, developer_id)

    async def create_department(self, workspace_id: str, data: DepartmentCreate) -> DepartmentResponse:
        parent: Department | None = None
        if data.parent_id:
            parent = await self._get(workspace_id, data.parent_id)
        await self._require_unique_function(workspace_id, data.function_key or None)
        await self._require_member_if_set(workspace_id, data.head_id)

        dept_id = str(uuid4())
        if parent:
            path = f"{parent.path}{dept_id}/"
            depth = parent.depth + 1
        else:
            path = f"/{dept_id}/"
            depth = 0

        slug = await self._unique_slug(workspace_id, data.slug or data.name)

        dept = Department(
            id=dept_id,
            workspace_id=workspace_id,
            name=data.name,
            slug=slug,
            description=data.description,
            function_key=data.function_key or None,
            parent_id=parent.id if parent else None,
            path=path,
            depth=depth,
            position=data.position,
            head_id=data.head_id,
            cost_center=data.cost_center,
            budget_amount=data.budget_amount,
            budget_currency=data.budget_currency,
            headcount_planned=data.headcount_planned,
            location=data.location,
            timezone=data.timezone,
            settings=data.settings or {},
        )
        self.db.add(dept)
        await self.db.flush()
        await self.db.refresh(dept)
        return self._to_response(dept, 0)

    async def list_departments(self, workspace_id: str) -> list[DepartmentResponse]:
        depts = (
            await self.db.execute(
                select(Department)
                .where(Department.workspace_id == workspace_id)
                .order_by(Department.depth, Department.position, Department.name)
            )
        ).scalars().all()
        counts = await self._member_counts(workspace_id)
        return [self._to_response(d, counts.get(d.id, 0)) for d in depts]

    async def get_department(self, workspace_id: str, dept_id: str) -> DepartmentDetail:
        dept = await self._get(workspace_id, dept_id)
        members = await self._members_for(dept_id)
        positions = (
            await self.db.execute(
                select(DepartmentPosition)
                .where(DepartmentPosition.department_id == dept_id)
                .order_by(DepartmentPosition.created_at, DepartmentPosition.id)
            )
        ).scalars().all()
        base = self._to_response(dept, len(members))
        return DepartmentDetail(
            **base.model_dump(),
            members=members,
            positions=[PositionResponse.model_validate(p) for p in positions],
        )

    async def update_department(
        self, workspace_id: str, dept_id: str, data: DepartmentUpdate
    ) -> DepartmentResponse:
        dept = await self._get(workspace_id, dept_id)
        payload = data.model_dump(exclude_unset=True)
        if "slug" in payload and payload["slug"]:
            payload["slug"] = await self._unique_slug(workspace_id, payload["slug"], exclude_id=dept_id)
        if "function_key" in payload:
            await self._require_unique_function(
                workspace_id, payload["function_key"] or None, exclude_id=dept_id
            )
        if "head_id" in payload:
            await self._require_member_if_set(workspace_id, payload["head_id"])
        for key, value in payload.items():
            setattr(dept, key, value)
        await self.db.flush()
        await self.db.refresh(dept)
        counts = await self._member_counts(workspace_id)
        return self._to_response(dept, counts.get(dept_id, 0))

    async def reparent_department(
        self, workspace_id: str, dept_id: str, new_parent_id: str | None
    ) -> DepartmentResponse:
        dept = await self._get(workspace_id, dept_id)

        new_parent: Department | None = None
        if new_parent_id:
            if new_parent_id == dept_id:
                raise HTTPException(status_code=400, detail="A department cannot be its own parent")
            new_parent = await self._get(workspace_id, new_parent_id)
            # cycle guard: the new parent must not be the node itself or any of
            # its descendants (descendants have paths prefixed by dept.path).
            if new_parent.path.startswith(dept.path):
                raise HTTPException(status_code=400, detail="Cannot move a department under its own descendant")

        old_path = dept.path
        if new_parent:
            new_path = f"{new_parent.path}{dept_id}/"
            new_depth = new_parent.depth + 1
        else:
            new_path = f"/{dept_id}/"
            new_depth = 0
        depth_delta = new_depth - dept.depth

        # fetch subtree (self + descendants) and rewrite their paths/depths
        subtree = (
            await self.db.execute(
                select(Department).where(
                    Department.workspace_id == workspace_id,
                    Department.path.like(f"{old_path}%"),
                )
            )
        ).scalars().all()

        for node in subtree:
            node.path = new_path + node.path[len(old_path):]
            node.depth = node.depth + depth_delta
        dept.parent_id = new_parent.id if new_parent else None

        await self.db.flush()
        await self.db.refresh(dept)
        counts = await self._member_counts(workspace_id)
        return self._to_response(dept, counts.get(dept_id, 0))

    async def delete_department(self, workspace_id: str, dept_id: str) -> None:
        dept = await self._get(workspace_id, dept_id)
        # re-parent direct children onto this node's parent so the tree stays connected
        children = (
            await self.db.execute(
                select(Department).where(
                    Department.workspace_id == workspace_id,
                    Department.parent_id == dept_id,
                )
            )
        ).scalars().all()
        for child in children:
            await self.reparent_department(workspace_id, child.id, dept.parent_id)
        await self.db.delete(dept)
        await self.db.flush()

    async def get_org_chart(self, workspace_id: str) -> list[DepartmentNode]:
        depts = (
            await self.db.execute(
                select(Department)
                .where(Department.workspace_id == workspace_id)
                .order_by(Department.depth, Department.position, Department.name)
            )
        ).scalars().all()
        counts = await self._member_counts(workspace_id)

        nodes: dict[str, DepartmentNode] = {}
        for d in depts:
            base = self._to_response(d, counts.get(d.id, 0))
            nodes[d.id] = DepartmentNode(**base.model_dump(), children=[])

        roots: list[DepartmentNode] = []
        for d in depts:
            node = nodes[d.id]
            if d.parent_id and d.parent_id in nodes:
                nodes[d.parent_id].children.append(node)
            else:
                roots.append(node)
        return roots

    # ---------------------------------------------------------------- members

    async def _members_for(self, dept_id: str) -> list[MemberSummary]:
        rows = (
            await self.db.execute(
                select(DepartmentMember, Developer)
                .join(Developer, Developer.id == DepartmentMember.developer_id)
                .where(DepartmentMember.department_id == dept_id)
                .order_by(DepartmentMember.role_in_department, Developer.name)
            )
        ).all()
        out: list[MemberSummary] = []
        for m, dev in rows:
            out.append(
                MemberSummary(
                    id=m.id,
                    developer_id=dev.id,
                    name=dev.name,
                    email=dev.email,
                    avatar_url=getattr(dev, "avatar_url", None),
                    role_in_department=m.role_in_department,
                    is_primary=m.is_primary,
                    allocation_percent=m.allocation_percent,
                )
            )
        return out

    async def add_member(
        self, workspace_id: str, dept_id: str, data: MembershipCreate
    ) -> MemberSummary:
        await self._get(workspace_id, dept_id)  # validates department
        await self._require_workspace_member(workspace_id, data.developer_id)
        existing = (
            await self.db.execute(
                select(DepartmentMember).where(
                    DepartmentMember.department_id == dept_id,
                    DepartmentMember.developer_id == data.developer_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status_code=409, detail="Developer is already a member of this department")

        if data.is_primary:
            await self._clear_primary(workspace_id, data.developer_id)

        member = DepartmentMember(
            id=str(uuid4()),
            workspace_id=workspace_id,
            department_id=dept_id,
            developer_id=data.developer_id,
            role_in_department=data.role_in_department,
            is_primary=data.is_primary,
            allocation_percent=data.allocation_percent,
        )
        self.db.add(member)
        await self.db.flush()
        dev = await self.db.get(Developer, data.developer_id)
        return MemberSummary(
            id=member.id,
            developer_id=data.developer_id,
            name=dev.name if dev else None,
            email=dev.email if dev else None,
            avatar_url=getattr(dev, "avatar_url", None) if dev else None,
            role_in_department=member.role_in_department,
            is_primary=member.is_primary,
            allocation_percent=member.allocation_percent,
        )

    async def update_member(
        self, workspace_id: str, dept_id: str, member_id: str, data: MembershipUpdate
    ) -> MemberSummary:
        member = (
            await self.db.execute(
                select(DepartmentMember).where(
                    DepartmentMember.id == member_id,
                    DepartmentMember.department_id == dept_id,
                    DepartmentMember.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if member is None:
            raise HTTPException(status_code=404, detail="Membership not found")

        payload = data.model_dump(exclude_unset=True)
        if payload.get("is_primary") is True:
            await self._clear_primary(workspace_id, member.developer_id, keep_member_id=member_id)
        for key, value in payload.items():
            setattr(member, key, value)
        await self.db.flush()

        dev = await self.db.get(Developer, member.developer_id)
        return MemberSummary(
            id=member.id,
            developer_id=member.developer_id,
            name=dev.name if dev else None,
            email=dev.email if dev else None,
            avatar_url=getattr(dev, "avatar_url", None) if dev else None,
            role_in_department=member.role_in_department,
            is_primary=member.is_primary,
            allocation_percent=member.allocation_percent,
        )

    async def remove_member(self, workspace_id: str, dept_id: str, member_id: str) -> None:
        member = (
            await self.db.execute(
                select(DepartmentMember).where(
                    DepartmentMember.id == member_id,
                    DepartmentMember.department_id == dept_id,
                    DepartmentMember.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if member is None:
            raise HTTPException(status_code=404, detail="Membership not found")
        await self.db.delete(member)
        await self.db.flush()

    async def _clear_primary(
        self, workspace_id: str, developer_id: str, keep_member_id: str | None = None
    ) -> None:
        """Unset any existing primary membership for this developer (one-primary rule)."""
        rows = (
            await self.db.execute(
                select(DepartmentMember).where(
                    DepartmentMember.workspace_id == workspace_id,
                    DepartmentMember.developer_id == developer_id,
                    DepartmentMember.is_primary.is_(True),
                )
            )
        ).scalars().all()
        for row in rows:
            if row.id != keep_member_id:
                row.is_primary = False
        await self.db.flush()

    async def list_departments_for_developer(
        self, workspace_id: str, developer_id: str
    ) -> list[DepartmentResponse]:
        rows = (
            await self.db.execute(
                select(Department)
                .join(DepartmentMember, DepartmentMember.department_id == Department.id)
                .where(
                    Department.workspace_id == workspace_id,
                    DepartmentMember.developer_id == developer_id,
                )
            )
        ).scalars().all()
        counts = await self._member_counts(workspace_id)
        return [self._to_response(d, counts.get(d.id, 0)) for d in rows]

    # ------------------------------------------------------------------- people

    async def list_people(self, workspace_id: str) -> list[PersonSummary]:
        """Every active workspace member, with their departments and manager.

        Department-first reads (the directory, the org chart) structurally cannot
        show someone who belongs to no department, which is precisely the state
        every newly-invited member starts in. This walks the other way round —
        from workspace membership — so unassigned people are visible and can be
        placed.
        """
        rows = (
            await self.db.execute(
                select(WorkspaceMember, Developer)
                .join(Developer, Developer.id == WorkspaceMember.developer_id)
                .where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.status == "active",
                )
            )
        ).all()

        memberships = (
            await self.db.execute(
                select(DepartmentMember, Department)
                .join(Department, Department.id == DepartmentMember.department_id)
                .where(Department.workspace_id == workspace_id)
            )
        ).all()
        by_developer: dict[str, list[PersonDepartment]] = {}
        for dm, dept in memberships:
            by_developer.setdefault(dm.developer_id, []).append(
                PersonDepartment(
                    id=dept.id,
                    name=dept.name,
                    function_key=dept.function_key,
                    role_in_department=dm.role_in_department,
                    is_primary=dm.is_primary,
                )
            )

        names = {dev.id: dev.name or dev.email for _, dev in rows}
        people = [
            PersonSummary(
                developer_id=dev.id,
                name=dev.name,
                email=dev.email,
                avatar_url=getattr(dev, "avatar_url", None),
                workspace_role=member.role,
                # Primary first, then alphabetical, so the UI can take [0] as
                # "their department" without re-sorting.
                departments=sorted(
                    by_developer.get(dev.id, []),
                    key=lambda d: (not d.is_primary, d.name.lower()),
                ),
                manager_id=member.manager_id,
                manager_name=names.get(member.manager_id) if member.manager_id else None,
            )
            for member, dev in rows
        ]
        people.sort(key=lambda p: (p.name or p.email or "").lower())
        return people

    # ---------------------------------------------------------------- positions

    async def add_position(
        self, workspace_id: str, dept_id: str, data: PositionCreate
    ) -> PositionResponse:
        await self._get(workspace_id, dept_id)
        await self._require_member_if_set(workspace_id, data.filled_by_id)
        pos = DepartmentPosition(
            id=str(uuid4()),
            workspace_id=workspace_id,
            department_id=dept_id,
            title=data.title,
            status=data.status,
            filled_by_id=data.filled_by_id,
        )
        self.db.add(pos)
        await self.db.flush()
        await self.db.refresh(pos)
        return PositionResponse.model_validate(pos)

    # ---------------------------------------------------------------- reporting

    async def _reject_reporting_cycle(
        self, workspace_id: str, developer_id: str, manager_id: str
    ) -> None:
        """Refuse an assignment that would close a loop in the reporting chain.

        Walks the *proposed manager's* own chain upwards; if it comes back round
        to ``developer_id`` the line is circular. A cycle is not merely untidy —
        anything that walks the chain to render a reporting tree would recurse
        until it ran out of stack. The ``seen`` set also bounds the walk, so a
        loop already present in the data can't hang the request.
        """
        seen = {developer_id}
        cursor: str | None = manager_id
        while cursor is not None:
            if cursor in seen:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="That reporting line would create a cycle",
                )
            seen.add(cursor)
            cursor = (
                await self.db.execute(
                    select(WorkspaceMember.manager_id).where(
                        WorkspaceMember.workspace_id == workspace_id,
                        WorkspaceMember.developer_id == cursor,
                    )
                )
            ).scalar_one_or_none()

    async def set_manager(
        self, workspace_id: str, developer_id: str, manager_id: str | None
    ) -> None:
        if manager_id == developer_id:
            raise HTTPException(status_code=400, detail="A person cannot report to themselves")
        member = (
            await self.db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                )
            )
        ).scalar_one_or_none()
        if member is None:
            raise HTTPException(status_code=404, detail="Workspace member not found")

        if manager_id is not None:
            # manager_id FKs to developers.id, not to workspace_members — so
            # without this a manager from another workspace is referentially
            # valid and would silently stick.
            await self._require_workspace_member(workspace_id, manager_id)
            await self._reject_reporting_cycle(workspace_id, developer_id, manager_id)

        member.manager_id = manager_id
        await self.db.flush()
