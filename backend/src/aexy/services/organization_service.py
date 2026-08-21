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
    PositionStatus,
)
from aexy.models.workspace import WorkspaceMember
from aexy.schemas.organization import (
    DepartmentAccessProfileResponse,
    DepartmentAccessProfileUpdate,
    DepartmentCreate,
    DepartmentDetail,
    DepartmentNode,
    DepartmentResponse,
    DepartmentUpdate,
    FunctionCatalog,
    FunctionOption,
    MemberSummary,
    MembershipCreate,
    MembershipUpdate,
    PersonDepartment,
    PersonSummary,
    PositionCreate,
    PositionResponse,
)
from aexy.services.org_functions import (
    CUSTOM_PREFIX,
    FUNCTIONS,
    FUNCTIONS_BY_KEY,
    canonical_function_key,
    canonical_or_grandfathered,
    function_key_spellings,
)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "department"


async def department_for_function(
    db: AsyncSession, workspace_id: str, function_key: str | None
) -> Department | None:
    """The active department claiming ``function_key``, whatever the spelling.

    The one place that answers "who owns this function here". Callers used to
    write the comparison themselves against a literal — Service Desk intake
    auto-assigned tickets to ``function_key == "ops_kam"``, a key only workspaces
    started from the insurance template ever had — and each open-coded query also
    had to remember that a retired spelling still counts.

    ``.first()`` rather than ``scalar_one_or_none()``: the unique index makes two
    impossible in Postgres, but this is called from digests and mail intake, where
    raising would take down every workspace after this one in the batch.
    """
    spellings = function_key_spellings(function_key) if function_key else ()
    if not spellings:
        return None
    return (
        await db.execute(
            select(Department)
            .where(
                Department.workspace_id == workspace_id,
                Department.function_key.in_(spellings),
                Department.is_active.is_(True),
            )
            .order_by(Department.created_at, Department.id)
        )
    ).scalars().first()


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
        # Derived rather than mapped: the profile itself is deliberately not in
        # the list response (it is large and every caller here renders a row),
        # but whether one exists decides whether the row can say "using role
        # defaults" — which is the thing an admin needs to notice.
        resp.has_access_profile = bool(dept.app_config)
        return resp

    # -------------------------------------------------------------- departments

    @staticmethod
    def _canonical_function_key(raw: str | None, current: str | None = None) -> str | None:
        """Validate and canonicalise a function key on its way to the database.

        Retired spellings resolve forward, so a workspace still holding
        ``ops_kam`` writes ``operations`` the next time anyone saves.

        ``current`` grandfathers a value that is already stored: a workspace whose
        department carries a key predating the registry must still be able to
        rename that department, and refusing the unchanged value would lock the
        whole form. Only a *new* value has to be one we recognise.
        """
        try:
            return canonical_or_grandfathered(raw, current)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    async def _require_unique_function(
        self, workspace_id: str, function_key: str | None, exclude_id: str | None = None
    ) -> None:
        """409 on a function_key already claimed in this workspace.

        ``uq_department_function_key`` enforces this, but an IntegrityError
        surfaces as a 500 — and the value is meaningful (Service Desk routes
        pending-with by it), so the caller deserves to be told which one clashed.

        Matches every spelling of the function, not just the canonical one: a
        workspace that still holds ``ops_kam`` has claimed ``operations``, and
        letting a second department take the canonical spelling would give it two
        departments for one function — which is what the unique index exists to
        prevent, and which it cannot see.
        """
        if not function_key:
            return
        spellings = function_key_spellings(function_key) or (function_key,)
        query = select(Department.name).where(
            Department.workspace_id == workspace_id,
            Department.function_key.in_(spellings),
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
        function_key = self._canonical_function_key(data.function_key)
        await self._require_unique_function(workspace_id, function_key)
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
            function_key=function_key,
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
        # Seat holders are already on the roster, so name them from it rather than
        # joining developers a second time.
        holders = {m.developer_id: (m.name or m.email or "") for m in members}
        return DepartmentDetail(
            **base.model_dump(),
            members=members,
            positions=[self._to_position_response(p, holders) for p in positions],
        )

    async def update_department(
        self, workspace_id: str, dept_id: str, data: DepartmentUpdate
    ) -> DepartmentResponse:
        dept = await self._get(workspace_id, dept_id)
        payload = data.model_dump(exclude_unset=True)
        if "slug" in payload and payload["slug"]:
            payload["slug"] = await self._unique_slug(workspace_id, payload["slug"], exclude_id=dept_id)
        if "function_key" in payload:
            payload["function_key"] = self._canonical_function_key(
                payload["function_key"], current=dept.function_key
            )
            await self._require_unique_function(
                workspace_id, payload["function_key"], exclude_id=dept_id
            )
        if "head_id" in payload:
            await self._require_member_if_set(workspace_id, payload["head_id"])
        for key, value in payload.items():
            setattr(dept, key, value)
        await self.db.flush()
        await self.db.refresh(dept)
        counts = await self._member_counts(workspace_id)
        return self._to_response(dept, counts.get(dept_id, 0))

    async def seed_departments_for_use_cases(
        self, workspace_id: str, use_cases: list[str]
    ) -> list[DepartmentResponse]:
        """Create the departments implied by onboarding's use-case picks.

        Idempotent, and deliberately conservative about departments that already
        exist: a workspace being re-onboarded, or one where the founder already
        made a "Sales" department by hand, gets its existing department given a
        profile rather than a near-duplicate created beside it. Matching is by
        ``function_key`` first (the canonical identity) and then by name, since a
        hand-made department usually has no function key.

        An existing department that already carries a profile is left completely
        alone — somebody configured that on purpose.
        """
        from aexy.services.onboarding_use_cases import departments_for_use_cases
        from aexy.schemas.organization import DepartmentAccessProfileUpdate

        wanted = departments_for_use_cases(use_cases)
        if not wanted:
            return []

        existing = (
            await self.db.execute(
                select(Department).where(Department.workspace_id == workspace_id)
            )
        ).scalars().all()
        by_function = {d.function_key: d for d in existing if d.function_key}
        by_name = {d.name.strip().lower(): d for d in existing}

        results: list[DepartmentResponse] = []
        for spec in wanted:
            match = by_function.get(spec["function_key"]) or by_name.get(
                spec["name"].strip().lower()
            )
            if match is None:
                created = await self.create_department(
                    workspace_id,
                    DepartmentCreate(
                        name=spec["name"],
                        function_key=spec["function_key"],
                    ),
                )
                department_id = created.id
                # Register it so two use cases naming the same department in
                # different ways can't create it twice in one call.
                by_name[spec["name"].strip().lower()] = await self._get(
                    workspace_id, department_id
                )
                if spec["function_key"]:
                    by_function[spec["function_key"]] = by_name[
                        spec["name"].strip().lower()
                    ]
            elif match.app_config:
                # Already configured by hand — don't overwrite somebody's work.
                counts = await self._member_counts(workspace_id)
                results.append(self._to_response(match, counts.get(str(match.id), 0)))
                continue
            else:
                department_id = str(match.id)

            await self.set_access_profile(
                workspace_id,
                department_id,
                DepartmentAccessProfileUpdate(
                    profile_slug=spec["profile_slug"],
                    default_persona=spec["persona"],
                ),
            )
            counts = await self._member_counts(workspace_id)
            results.append(
                self._to_response(
                    await self._get(workspace_id, department_id),
                    counts.get(department_id, 0),
                )
            )

        return results

    # ------------------------------------------------------- access profiles

    async def get_access_profile(
        self, workspace_id: str, dept_id: str
    ) -> DepartmentAccessProfileResponse:
        """What this department's members can see."""
        dept = await self._get(workspace_id, dept_id)
        counts = await self._member_counts(workspace_id)
        return self._to_profile_response(dept, counts.get(dept_id, 0))

    async def list_access_profiles(
        self, workspace_id: str
    ) -> list[DepartmentAccessProfileResponse]:
        """Every department's profile, for the admin access screen.

        Includes departments with no profile: those are the ones an admin needs
        to see, because their members are still being decided by role.
        """
        depts = (
            await self.db.execute(
                select(Department)
                .where(Department.workspace_id == workspace_id)
                .order_by(Department.depth, Department.position, Department.name)
            )
        ).scalars().all()
        counts = await self._member_counts(workspace_id)
        return [self._to_profile_response(d, counts.get(str(d.id), 0)) for d in depts]

    async def set_access_profile(
        self, workspace_id: str, dept_id: str, data: DepartmentAccessProfileUpdate
    ) -> DepartmentAccessProfileResponse:
        """Assign, edit or clear a department's access profile.

        Changing this changes what every member of the department resolves to, so
        it drops the cached resolutions for the whole workspace rather than for
        one person.
        """
        from aexy.models.app_definitions import (
            SYSTEM_APP_BUNDLES,
            validate_app_access_config,
        )
        from aexy.services.app_access_service import invalidate_app_settings_cache

        dept = await self._get(workspace_id, dept_id)
        payload = data.model_dump(exclude_unset=True)

        app_config: dict | None = None
        slug: str | None = dept.access_profile_slug

        if "app_config" in payload and payload["app_config"] is not None:
            app_config = payload["app_config"]
            is_valid, error = validate_app_access_config({"apps": app_config})
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid access profile: {error}",
                )
            # An explicit config keeps whatever slug was sent as its label, so
            # "Business, tweaked" stays recognisable in the UI.
            if "profile_slug" in payload:
                slug = payload["profile_slug"] or None
        elif "profile_slug" in payload:
            slug = payload["profile_slug"] or None
            if slug is None:
                # Clearing the profile: members fall back to their role bundle,
                # and API enforcement for them switches back off. Explicit,
                # because a department nobody configured shouldn't enforce a
                # default nobody chose.
                app_config = {}
            else:
                bundle = SYSTEM_APP_BUNDLES.get(slug)
                if bundle is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Unknown access profile {slug!r}. Expected one of: "
                            + ", ".join(sorted(SYSTEM_APP_BUNDLES))
                        ),
                    )
                # Deep-copied: SYSTEM_APP_BUNDLES is a module-level dict, and
                # handing its nested dicts to a row would let a later edit to
                # one department rewrite the bundle for the whole process.
                app_config = {
                    app_id: {
                        "enabled": bool(cfg.get("enabled", False)),
                        "modules": dict(cfg.get("modules") or {}),
                    }
                    for app_id, cfg in bundle["apps"].items()
                }

        if app_config is not None:
            dept.app_config = app_config
        dept.access_profile_slug = slug
        if "default_persona" in payload:
            dept.default_persona = payload["default_persona"] or None

        await self.db.flush()
        await self.db.refresh(dept)
        await invalidate_app_settings_cache(workspace_id)

        counts = await self._member_counts(workspace_id)
        return self._to_profile_response(dept, counts.get(dept_id, 0))

    @staticmethod
    def _to_profile_response(
        dept: Department, member_count: int
    ) -> DepartmentAccessProfileResponse:
        app_config = dept.app_config or {}
        return DepartmentAccessProfileResponse(
            department_id=str(dept.id),
            department_name=dept.name,
            access_profile_slug=dept.access_profile_slug,
            app_config=app_config,
            default_persona=dept.default_persona,
            enabled_app_ids=sorted(
                app_id
                for app_id, cfg in app_config.items()
                if isinstance(cfg, dict) and cfg.get("enabled")
            ),
            member_count=member_count,
        )

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
        members_by_dept = await self._members_by_department(workspace_id)

        nodes: dict[str, DepartmentNode] = {}
        for d in depts:
            base = self._to_response(d, counts.get(d.id, 0))
            nodes[d.id] = DepartmentNode(
                **base.model_dump(),
                children=[],
                members=members_by_dept.get(d.id, []),
            )

        roots: list[DepartmentNode] = []
        for d in depts:
            node = nodes[d.id]
            if d.parent_id and d.parent_id in nodes:
                nodes[d.parent_id].children.append(node)
            else:
                roots.append(node)
        return roots

    # ---------------------------------------------------------------- members

    async def _reporting_lines(self, workspace_id: str) -> tuple[dict[str, str | None], dict[str, str]]:
        """``(developer_id -> manager_id, developer_id -> display name)``.

        `manager_id` lives on `workspace_members`, not on the department row, so
        resolving a person's manager is a second lookup however you slice it. Doing
        it once per chart keeps `_members_by_department` to three queries total.
        """
        rows = (
            await self.db.execute(
                select(WorkspaceMember, Developer)
                .join(Developer, Developer.id == WorkspaceMember.developer_id)
                .where(WorkspaceMember.workspace_id == workspace_id)
            )
        ).all()
        managers = {wm.developer_id: wm.manager_id for wm, _ in rows}
        names = {dev.id: (dev.name or dev.email or "") for _, dev in rows}
        return managers, names

    def _to_member_summary(
        self,
        m: DepartmentMember,
        dev: Developer,
        managers: dict[str, str | None],
        names: dict[str, str],
        seats: dict[tuple[str, str], DepartmentPosition] | None = None,
    ) -> MemberSummary:
        manager_id = managers.get(dev.id)
        # (department_id, developer_id) -> the seat they hold there. Optional
        # because the org chart draws reporting lines and has no use for seats.
        seat = (seats or {}).get((m.department_id, dev.id))
        return MemberSummary(
            id=m.id,
            developer_id=dev.id,
            name=dev.name,
            email=dev.email,
            avatar_url=getattr(dev, "avatar_url", None),
            role_in_department=m.role_in_department,
            is_primary=m.is_primary,
            allocation_percent=m.allocation_percent,
            position_id=seat.id if seat else None,
            position_title=seat.title if seat else None,
            manager_id=manager_id,
            manager_name=names.get(manager_id) if manager_id else None,
        )

    async def _members_by_department(self, workspace_id: str) -> dict[str, list[MemberSummary]]:
        """Every department's members in one pass, for the org chart."""
        rows = (
            await self.db.execute(
                select(DepartmentMember, Developer)
                .join(Developer, Developer.id == DepartmentMember.developer_id)
                .join(Department, Department.id == DepartmentMember.department_id)
                .where(Department.workspace_id == workspace_id)
                .order_by(DepartmentMember.role_in_department, Developer.name)
            )
        ).all()
        managers, names = await self._reporting_lines(workspace_id)

        out: dict[str, list[MemberSummary]] = {}
        for m, dev in rows:
            out.setdefault(m.department_id, []).append(
                self._to_member_summary(m, dev, managers, names)
            )
        return out

    async def _members_for(self, dept_id: str) -> list[MemberSummary]:
        rows = (
            await self.db.execute(
                select(DepartmentMember, Developer, Department)
                .join(Developer, Developer.id == DepartmentMember.developer_id)
                .join(Department, Department.id == DepartmentMember.department_id)
                .where(DepartmentMember.department_id == dept_id)
                .order_by(DepartmentMember.role_in_department, Developer.name)
            )
        ).all()
        if not rows:
            return []

        managers, names = await self._reporting_lines(rows[0][2].workspace_id)
        seats = await self._seats_by_holder(dept_id)
        return [self._to_member_summary(m, dev, managers, names, seats) for m, dev, _ in rows]

    # -------------------------------------------------------------------- seats

    async def _seats_by_holder(
        self, dept_id: str
    ) -> dict[tuple[str, str], DepartmentPosition]:
        """``(department_id, developer_id) -> the seat that person holds``.

        A person holds at most one seat per department — ``_assign_position``
        vacates the others — but the schema cannot say so, so this takes the
        earliest-created seat when history has left more than one behind.
        """
        rows = (
            await self.db.execute(
                select(DepartmentPosition)
                .where(
                    DepartmentPosition.department_id == dept_id,
                    DepartmentPosition.filled_by_id.isnot(None),
                )
                .order_by(DepartmentPosition.created_at, DepartmentPosition.id)
            )
        ).scalars().all()
        out: dict[tuple[str, str], DepartmentPosition] = {}
        for seat in rows:
            out.setdefault((dept_id, seat.filled_by_id), seat)
        return out

    async def _assign_position(
        self, workspace_id: str, dept_id: str, developer_id: str, position_id: str | None
    ) -> None:
        """Place ``developer_id`` in a seat, or vacate the one they hold.

        The seat carries the link (``filled_by_id``), so placing someone is a
        write to the position row rather than to their membership. Vacating sets
        the seat back to ``open`` — the point of a headcount seat is that it can
        be refilled, and a seat left ``filled`` by someone who has moved on is
        both wrong and permanently unusable.

        A title is not exclusive: naming a seat someone else already holds means
        "the same title for this person too". An open seat with that title is
        reused first; failing that a new seat is created, so headcount only
        grows when a person actually holds the extra seat. (This used to 409,
        which made a shared title like "SDE I" impossible to hand out twice
        without pre-creating a second seat by hand.)
        """
        held = (
            await self.db.execute(
                select(DepartmentPosition).where(
                    DepartmentPosition.department_id == dept_id,
                    DepartmentPosition.filled_by_id == developer_id,
                )
            )
        ).scalars().all()

        target: DepartmentPosition | None = None
        if position_id:
            target = (
                await self.db.execute(
                    select(DepartmentPosition).where(
                        DepartmentPosition.id == position_id,
                        DepartmentPosition.department_id == dept_id,
                        DepartmentPosition.workspace_id == workspace_id,
                    )
                )
            ).scalar_one_or_none()
            if target is None:
                # Scoped to the department on purpose: a seat belongs to one
                # department, so accepting another department's id would place
                # someone in a seat that isn't on the roster they're being added to.
                raise HTTPException(status_code=404, detail="Position not found in this department")
            if target.filled_by_id and target.filled_by_id != developer_id:
                open_same_title = (
                    await self.db.execute(
                        select(DepartmentPosition)
                        .where(
                            DepartmentPosition.department_id == dept_id,
                            DepartmentPosition.workspace_id == workspace_id,
                            DepartmentPosition.title == target.title,
                            DepartmentPosition.filled_by_id.is_(None),
                        )
                        .order_by(DepartmentPosition.created_at, DepartmentPosition.id)
                    )
                ).scalars().first()
                if open_same_title is not None:
                    target = open_same_title
                else:
                    target = DepartmentPosition(
                        id=str(uuid4()),
                        workspace_id=workspace_id,
                        department_id=dept_id,
                        title=target.title,
                    )
                    self.db.add(target)

        for seat in held:
            if target is not None and seat.id == target.id:
                continue
            seat.filled_by_id = None
            seat.status = PositionStatus.OPEN.value

        if target is not None:
            target.filled_by_id = developer_id
            target.status = PositionStatus.FILLED.value

        await self.db.flush()

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
        if data.position_id:
            await self._assign_position(
                workspace_id, dept_id, data.developer_id, data.position_id
            )
        # Joining a department can change what this person can see and reach, so
        # their cached resolution has to go — otherwise a new joiner is placed in
        # Sales and still can't open CRM for up to the cache TTL.
        await self._invalidate_member_access(workspace_id, data.developer_id)
        dev = await self.db.get(Developer, data.developer_id)
        seat = (await self._seats_by_holder(dept_id)).get((dept_id, data.developer_id))
        return MemberSummary(
            id=member.id,
            developer_id=data.developer_id,
            name=dev.name if dev else None,
            email=dev.email if dev else None,
            avatar_url=getattr(dev, "avatar_url", None) if dev else None,
            role_in_department=member.role_in_department,
            is_primary=member.is_primary,
            allocation_percent=member.allocation_percent,
            position_id=seat.id if seat else None,
            position_title=seat.title if seat else None,
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
        # The seat lives on the position row, not on the membership, so it has to
        # come out before the setattr loop — otherwise this writes a column that
        # DepartmentMember does not have.
        seat_change = "position_id" in payload
        position_id = payload.pop("position_id", None)
        if payload.get("is_primary") is True:
            await self._clear_primary(workspace_id, member.developer_id, keep_member_id=member_id)
        for key, value in payload.items():
            setattr(member, key, value)
        await self.db.flush()
        if seat_change:
            await self._assign_position(
                workspace_id, dept_id, member.developer_id, position_id
            )
        # Changing which department is primary changes the suggested sidebar view.
        await self._invalidate_member_access(workspace_id, member.developer_id)

        dev = await self.db.get(Developer, member.developer_id)
        seat = (await self._seats_by_holder(dept_id)).get((dept_id, member.developer_id))
        return MemberSummary(
            id=member.id,
            developer_id=member.developer_id,
            name=dev.name if dev else None,
            email=dev.email if dev else None,
            avatar_url=getattr(dev, "avatar_url", None) if dev else None,
            role_in_department=member.role_in_department,
            is_primary=member.is_primary,
            allocation_percent=member.allocation_percent,
            position_id=seat.id if seat else None,
            position_title=seat.title if seat else None,
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
        developer_id = member.developer_id
        # Free their seat first: a seat still "Filled" by someone who is no longer
        # in the department reads as taken and can never be offered to anyone else.
        await self._assign_position(workspace_id, dept_id, developer_id, None)
        await self.db.delete(member)
        await self.db.flush()
        # Leaving a department can take access away; that must bite immediately
        # rather than at the end of a cache window.
        await self._invalidate_member_access(workspace_id, developer_id)

    @staticmethod
    async def _invalidate_member_access(workspace_id: str, developer_id: str) -> None:
        """Drop this member's cached access resolution across all workers.

        Imported lazily: app_access_service imports the organization models, and
        importing it at module scope here closes the loop.
        """
        from aexy.services.app_access_service import (
            clear_effective_access_cache,
            invalidate_app_settings_cache,
        )

        clear_effective_access_cache(workspace_id, developer_id)
        # The pub/sub channel is workspace-grained, so other workers clear the
        # whole workspace. Membership changes are rare enough that re-resolving a
        # workspace's members is cheaper than a second channel would be.
        await invalidate_app_settings_cache(workspace_id)

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

    # ---------------------------------------------------------------- functions

    async def function_catalog(self, workspace_id: str) -> FunctionCatalog:
        """The function picker's contents for this workspace.

        Three things merged: the declared registry, whatever custom ``x_`` keys
        this workspace already uses (so they keep appearing and don't have to be
        retyped), and — for each option — who has claimed it and which desk
        queues route to it. That last part is the answer to "does this field
        matter", which the old free-text box could not give.
        """
        departments = (
            await self.db.execute(
                select(Department).where(
                    Department.workspace_id == workspace_id,
                    Department.function_key.isnot(None),
                )
            )
        ).scalars().all()

        claimed: dict[str, Department] = {}
        for dept in departments:
            if key := canonical_function_key(dept.function_key):
                claimed.setdefault(key, dept)

        # Stakeholder -> function, from the workspace's own taxonomy. seed=False:
        # rendering a picker must not bring a desk into existence.
        from aexy.services.service_desk_taxonomy import load_taxonomy

        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        routes: dict[str, list[str]] = {}
        for slug, key in taxonomy.internal_function_keys.items():
            routes.setdefault(key, []).append(slug)

        options = [
            FunctionOption(
                key=spec.key,
                label=spec.label,
                description=spec.description,
                routes_stakeholders=sorted(routes.get(spec.key, [])),
            )
            for spec in FUNCTIONS
        ]
        # Custom and pre-registry keys the workspace already holds. Listed after
        # the standard set, labelled from the department that uses them.
        for key, dept in sorted(claimed.items()):
            if key in FUNCTIONS_BY_KEY:
                continue
            options.append(
                FunctionOption(
                    key=key,
                    label=dept.name,
                    description="",
                    is_custom=True,
                    routes_stakeholders=sorted(routes.get(key, [])),
                )
            )

        for option in options:
            if dept := claimed.get(option.key):
                option.claimed_by_department_id = dept.id
                option.claimed_by_department_name = dept.name

        return FunctionCatalog(
            options=options,
            custom_prefix=CUSTOM_PREFIX,
            unclaimed_stakeholder_functions=sorted(
                key for key in routes if key not in claimed
            ),
        )

    # ---------------------------------------------------------------- positions

    @staticmethod
    def _to_position_response(
        pos: DepartmentPosition, holders: dict[str, str]
    ) -> PositionResponse:
        return PositionResponse(
            id=pos.id,
            department_id=pos.department_id,
            title=pos.title,
            status=pos.status,
            filled_by_id=pos.filled_by_id,
            filled_by_name=holders.get(pos.filled_by_id) if pos.filled_by_id else None,
            created_at=pos.created_at,
        )

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
            # A seat created with a holder is filled, whatever the default says —
            # otherwise it would be offered to someone else while occupied.
            status=PositionStatus.FILLED.value if data.filled_by_id else data.status,
            filled_by_id=data.filled_by_id,
        )
        self.db.add(pos)
        await self.db.flush()
        await self.db.refresh(pos)
        holder = await self.db.get(Developer, pos.filled_by_id) if pos.filled_by_id else None
        return self._to_position_response(
            pos,
            {pos.filled_by_id: (holder.name or holder.email or "")} if holder else {},
        )

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
