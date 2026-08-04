"""App access resolution and management service.

This service decides which apps and modules a workspace member can see and
reach.

Resolution order, lowest precedence first:

1. **Workspace app settings** — the owner's on/off switch. A module the
   workspace has turned off is off for everybody, admins included.
2. **Department profile** — the union of the access profiles of every
   department the person belongs to. This is the baseline, and it is what makes
   access department-centric: a salesperson's departments decide they see CRM,
   not the fact that their legacy workspace role happens to read "member".
3. **Role fallback** — used *only* when none of the person's departments carries
   a profile (including when they are in no department at all). Before
   departments owned this, role was the baseline for everyone, which is why
   every "member" resolved to the Engineering bundle regardless of their job.
4. **Member override** — an explicit, per-app grant or revoke, stored as a
   *delta* so that everything not mentioned keeps inheriting. Overrides used to
   be stored as a full snapshot of every app, which meant that toggling one app
   for one person silently froze all their other apps forever.

Two separate questions come out of this, and conflating them is what made
admins unable to ever see a shorter sidebar:

* ``enabled`` — should this app be in your navigation?
* ``can_access`` — should the API let you in? Admins and owners are always
  allowed to reach an app that the workspace has enabled, whatever their
  profile says, because they have to be able to administer it. And an app that
  reached ``role_fallback`` — nobody configured it for this person — stays
  reachable: enforcement follows configuration rather than preceding it, so
  adopting this model can't retroactively lock anyone out of an app they use
  today. See the comment at that branch.

Every app also carries a ``source`` explaining which layer decided it, so both
the admin UI and a support conversation can answer "why can this person see
that?" without re-deriving the chain by hand.
"""

import logging
import time
from datetime import datetime, timezone
from typing import TypedDict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from aexy.models.organization import Department, DepartmentMember
from aexy.models.workspace import WorkspaceMember, Workspace
from aexy.models.role import CustomRole
from aexy.models.app_access import (
    AppAccessTemplate,
    AppAccessLog,
    AppAccessLogAction,
    AppAccessRequest,
    AppAccessRequestStatus,
)
from aexy.models.app_definitions import (
    APP_CATALOG,
    SYSTEM_APP_BUNDLES,
    ROLE_DEFAULT_APP_ACCESS,
    get_default_app_access_for_role,
    validate_app_access_config,
)
from aexy.models.permissions import ROLE_TEMPLATES

logger = logging.getLogger(__name__)

# Which layer decided an app's `enabled` value. Surfaced to the admin UI.
SOURCE_WORKSPACE_DISABLED = "workspace_disabled"
SOURCE_DEPARTMENT = "department"
SOURCE_ROLE_FALLBACK = "role_fallback"
SOURCE_MEMBER_TEMPLATE = "member_template"
SOURCE_MEMBER_OVERRIDE = "member_override"

# Storage version for WorkspaceMember.app_permissions. Version 1 was a full
# snapshot of every app; version 2 stores only deltas. Version 1 rows are still
# read (see _read_member_overrides) — a v1 snapshot *is* an explicit decision
# about every app, so it keeps behaving exactly as it did until it is either
# rewritten through this service or converted by
# scripts/convert_member_access_to_deltas.py.
MEMBER_ACCESS_VERSION = 2


# In-process TTL cache for workspace app_settings: the app-toggle guard runs
# on nearly every request across ~15 routers, and the settings change rarely.
# One entry per workspace; staleness is bounded by the TTL. Writers of
# workspace.settings["app_settings"] should call clear_app_settings_cache().
_APP_SETTINGS_TTL_SECONDS = 30.0
_app_settings_cache: dict[str, tuple[float, dict]] = {}


# Resolved per-member access, cached for the same reason: now that the API
# guard enforces member access (not just the workspace toggle), resolution runs
# on nearly every guarded request and costs several queries — member, workspace,
# department memberships. Keyed (workspace_id, developer_id); shorter TTL than
# app_settings because revoking someone's access should bite promptly.
_EFFECTIVE_ACCESS_TTL_SECONDS = 15.0
_effective_access_cache: dict[tuple[str, str], tuple[float, "AppAccessStatus"]] = {}


def clear_app_settings_cache(workspace_id: str | None = None) -> None:
    """Drop this process's cached app_settings for one workspace (or all).

    Local-only — used by the cross-process subscriber and by tests. Writers
    should call `invalidate_app_settings_cache` so other workers are notified.
    """
    if workspace_id is None:
        _app_settings_cache.clear()
    else:
        _app_settings_cache.pop(str(workspace_id), None)


def clear_effective_access_cache(
    workspace_id: str | None = None, developer_id: str | None = None
) -> None:
    """Drop cached resolved access — for one member, one workspace, or all.

    Local-only, like `clear_app_settings_cache`. Anything that changes a
    department profile, a member's override, a role or a membership must clear
    this, or the change won't be visible until the TTL lapses.
    """
    if workspace_id is None:
        _effective_access_cache.clear()
        return
    workspace_id = str(workspace_id)
    if developer_id is not None:
        _effective_access_cache.pop((workspace_id, str(developer_id)), None)
        return
    for key in [k for k in _effective_access_cache if k[0] == workspace_id]:
        _effective_access_cache.pop(key, None)


def clear_workspace_access_caches(workspace_id: str | None = None) -> None:
    """Drop every access-related cache for a workspace (or all of them).

    What the cross-process subscriber calls: one published workspace id should
    invalidate the workspace toggles *and* every member's resolved access, since
    a department profile change affects many members at once and the publisher
    has no reason to know which.
    """
    clear_app_settings_cache(workspace_id)
    clear_effective_access_cache(workspace_id)


async def invalidate_app_settings_cache(workspace_id: str) -> None:
    """Clear the local caches and notify other workers to do the same.

    Call this from anywhere that mutates workspace.settings["app_settings"], a
    department's access profile, or a member's override, so the change takes
    effect immediately across all processes rather than after the TTL lapses.
    """
    clear_workspace_access_caches(workspace_id)
    from aexy.services.app_settings_pubsub import (
        publish_app_settings_invalidation,
    )

    await publish_app_settings_invalidation(str(workspace_id))


class EffectiveAppAccess(TypedDict):
    """Effective app access for a member.

    ``enabled`` answers "put this in their navigation"; ``can_access`` answers
    "let them through the API". They differ only for admins and owners, who can
    always reach a workspace-enabled app so they can administer it, but whose
    sidebar follows their profile like everyone else's.
    """

    app_id: str
    enabled: bool
    can_access: bool
    modules: dict[str, bool]  # module_id -> enabled
    source: str  # one of the SOURCE_* constants
    source_detail: str | None  # e.g. the department or template name


class AccessDepartment(TypedDict):
    """A department that contributed (or could contribute) to the baseline."""

    id: str
    name: str
    is_primary: bool
    has_profile: bool
    access_profile_slug: str | None


class AppAccessStatus(TypedDict):
    """Full access status response."""

    apps: dict[str, EffectiveAppAccess]
    applied_template_id: str | None
    applied_template_name: str | None
    has_custom_overrides: bool
    is_admin: bool
    # Where the baseline came from: "department", "role_fallback" or
    # "member_template". Lets the UI say "from the Sales department" instead of
    # leaving an admin to guess.
    baseline: str
    departments: list[AccessDepartment]
    # Default sidebar view implied by the person's primary department, or None
    # when it implies nothing. A personal choice still wins over this.
    suggested_persona: str | None


def member_access_pinned_to_template(
    template_id: str, actor_id: str | None = None
) -> dict:
    """The ``app_permissions`` payload that pins a member to a template.

    A public seam for callers outside this module — the invite endpoint, which
    has to store the payload before a WorkspaceMember row exists to write it to.
    Without this they would have to reach into
    ``AppAccessService._build_member_permissions``, and a storage format with an
    external caller reaching past the underscore is one that quietly becomes
    impossible to change.
    """
    return {
        "version": MEMBER_ACCESS_VERSION,
        "overrides": {},
        "applied_template_id": str(template_id),
        "custom_overrides": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **({"updated_by": str(actor_id)} if actor_id else {}),
    }


def union_app_configs(configs: list[dict]) -> dict:
    """Merge access profiles by *union of grants*.

    An app is enabled if any profile enables it; its modules are the union of
    the modules granted by the profiles that enable it. Someone in both Sales
    and Support gets Sales' apps plus Support's, which is the only reading that
    doesn't punish people for wearing two hats.

    A contributing profile with an empty ``modules`` dict means "all modules of
    this app", so it dominates the union — matching
    ``AppAccessTemplate.is_module_enabled``.
    """
    merged: dict[str, dict] = {}

    for config in configs:
        for app_id, app_config in (config or {}).items():
            if not isinstance(app_config, dict) or not app_config.get("enabled"):
                continue
            modules = app_config.get("modules") or {}
            existing = merged.get(app_id)
            if existing is None:
                merged[app_id] = {"enabled": True, "modules": dict(modules)}
                continue
            if not existing["modules"] or not modules:
                # Either side meaning "all modules" wins.
                existing["modules"] = {}
                continue
            for module_id, granted in modules.items():
                existing["modules"][module_id] = (
                    existing["modules"].get(module_id, False) or bool(granted)
                )

    return merged


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
        use_cache: bool = True,
    ) -> AppAccessStatus:
        """
        Get effective app access for a member.

        Resolution order (see the module docstring for the reasoning):

        1. Baseline — the union of the person's department profiles, or their
           role bundle if none of their departments carries one, or a
           member-level template when one has been pinned to them.
        2. Member override deltas — explicit per-app grants and revokes.
        3. Workspace app settings — a module the workspace has turned off is off
           for everyone, admins included.

        Admins get ``can_access`` on every workspace-enabled app but keep a
        profile-shaped ``enabled``, so they can administer everything without
        being forced to navigate everything.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            use_cache: Read/write the short-lived resolution cache. Pass False
                when resolving in order to *write* access, so a decision is
                never based on a value that another worker has already changed.

        Returns:
            AppAccessStatus with resolved access for all apps
        """
        cache_key = (str(workspace_id), str(developer_id))
        now = time.monotonic()
        if use_cache:
            cached = _effective_access_cache.get(cache_key)
            if cached is not None and now - cached[0] < _EFFECTIVE_ACCESS_TTL_SECONDS:
                return cached[1]

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

        overrides, applied_template_id, has_custom_overrides = (
            self._read_member_overrides(member)
        )

        # --- Baseline -------------------------------------------------------
        departments = await self._get_member_departments(workspace_id, developer_id)
        profiled = [d for d in departments if d.app_config]

        applied_template_name: str | None = None
        baseline_detail: str | None = None

        if applied_template_id:
            # A template pinned to this individual replaces the department
            # baseline: "treat this person as an exception" is a legitimate
            # admin decision, and it stays visible as one in the response.
            template = await self._get_template(applied_template_id)
            if template:
                applied_template_name = template.name
                baseline_config = dict(template.app_config or {})
                baseline_source = SOURCE_MEMBER_TEMPLATE
                baseline_detail = template.name
            else:
                # Template was deleted out from under the member. Fall through
                # rather than resolving to nothing, which would lock them out.
                logger.warning(
                    "Member %s in workspace %s pins missing access template %s; "
                    "falling back to department/role baseline",
                    developer_id, workspace_id, applied_template_id,
                )
                applied_template_id = None
                baseline_config, baseline_source, baseline_detail = (
                    self._baseline_from_departments_or_role(member, profiled)
                )
        else:
            baseline_config, baseline_source, baseline_detail = (
                self._baseline_from_departments_or_role(member, profiled)
            )

        # --- Per-app resolution ---------------------------------------------
        apps: dict[str, EffectiveAppAccess] = {}

        for app_id, app_definition in APP_CATALOG.items():
            base_app = baseline_config.get(app_id) or {}
            enabled = bool(base_app.get("enabled", False))
            base_modules = base_app.get("modules") or {}
            source = baseline_source
            source_detail = baseline_detail

            override = overrides.get(app_id) or {}
            # Tracked separately from `source`, which describes the app as a
            # whole: only this decides enforcement. A module-only override makes
            # the app "overridden" for display purposes without anybody having
            # decided whether the app itself is on, and treating that as a
            # decision would revoke API reach as a side effect of tweaking one
            # sub-page.
            enabled_is_configured = baseline_source != SOURCE_ROLE_FALLBACK

            if "enabled" in override:
                enabled = bool(override["enabled"])
                source = SOURCE_MEMBER_OVERRIDE
                source_detail = None
                enabled_is_configured = True

            # Resolve modules. An absent module inherits "on": the bundles list
            # their modules exhaustively, so this only matters when APP_CATALOG
            # gains a module, and a new module quietly disappearing for everyone
            # is worse than it quietly appearing.
            modules: dict[str, bool] = {}
            override_modules = override.get("modules") or {}
            for module_id in app_definition.get("modules", {}):
                if module_id in override_modules:
                    modules[module_id] = bool(override_modules[module_id])
                    source = SOURCE_MEMBER_OVERRIDE
                    source_detail = None
                elif base_modules:
                    modules[module_id] = bool(base_modules.get(module_id, True))
                else:
                    modules[module_id] = True

            # Admins can reach anything the workspace has enabled, but their
            # navigation still follows the profile above.
            can_access = enabled or is_admin

            if not enabled_is_configured:
                # Nothing and nobody decided this app for this person: their
                # departments carry no profile and no admin has overridden its
                # `enabled`, so the value above is a *default* — the role bundle
                # — not a decision. Enforcing a default would lock people out of
                # apps they use today: before member access was enforced at all, a
                # salesperson whose role read "member" was hidden from CRM in the
                # sidebar while the CRM API answered them perfectly well. Turning
                # that guess into a 403 retroactively would break exactly the
                # setups this work exists to fix.
                #
                # So the navigation still follows the role bundle (no worse than
                # before), while reach stays open until somebody configures a
                # profile or writes an explicit override. Enforcement follows
                # configuration rather than preceding it.
                can_access = True

            # Workspace-level disable beats everything, including admin reach —
            # that is what "this workspace does not use this module" has to mean.
            if not workspace_app_settings.get(app_id, True):
                enabled = False
                can_access = False
                source = SOURCE_WORKSPACE_DISABLED
                source_detail = None
                modules = {module_id: False for module_id in modules}

            apps[app_id] = {
                "app_id": app_id,
                "enabled": enabled,
                "can_access": can_access,
                "modules": modules,
                "source": source,
                "source_detail": source_detail,
            }

        status: AppAccessStatus = {
            "apps": apps,
            "applied_template_id": applied_template_id,
            "applied_template_name": applied_template_name,
            "has_custom_overrides": has_custom_overrides,
            "is_admin": is_admin,
            "baseline": baseline_source,
            "departments": [
                {
                    "id": str(d.id),
                    "name": d.name,
                    "is_primary": bool(getattr(d, "_is_primary", False)),
                    "has_profile": bool(d.app_config),
                    "access_profile_slug": d.access_profile_slug,
                }
                for d in departments
            ],
            "suggested_persona": self._suggested_persona(departments),
        }

        if use_cache:
            _effective_access_cache[cache_key] = (now, status)
        return status

    def _baseline_from_departments_or_role(
        self,
        member: WorkspaceMember,
        profiled_departments: list[Department],
    ) -> tuple[dict, str, str | None]:
        """Resolve the baseline: department profiles if any, else the role bundle.

        The role fallback is not a lesser path — it is what every workspace that
        hasn't adopted department profiles keeps using, so it has to behave
        exactly as it did before.
        """
        if profiled_departments:
            baseline = union_app_configs(
                [d.app_config for d in profiled_departments]
            )
            if len(profiled_departments) == 1:
                detail = profiled_departments[0].name
            else:
                detail = ", ".join(d.name for d in profiled_departments)
            return baseline, SOURCE_DEPARTMENT, detail

        role_template_id = self._get_role_template_id(member)
        return (
            dict(get_default_app_access_for_role(role_template_id)),
            SOURCE_ROLE_FALLBACK,
            ROLE_TEMPLATES.get(role_template_id, {}).get("name", role_template_id),
        )

    def _read_member_overrides(
        self, member: WorkspaceMember
    ) -> tuple[dict, str | None, bool]:
        """Read a member's overrides, tolerating all three storage generations.

        Returns ``(overrides, applied_template_id, has_custom_overrides)`` where
        ``overrides`` maps app_id -> {"enabled"?: bool, "modules"?: {...}} and an
        absent app means "inherit".

        - v2 stores deltas under ``overrides``.
        - v1 stored a snapshot of every app under ``apps``. Read as a full set of
          deltas, which reproduces the old behaviour exactly: such a member stays
          pinned to what an admin last saw, and keeps ignoring later department
          changes until the row is rewritten or converted.
        - The oldest format was a flat ``{app_id: bool}``.
        """
        perms = member.app_permissions or {}
        if not perms:
            return {}, None, False

        applied_template_id = perms.get("applied_template_id")

        if perms.get("version") == MEMBER_ACCESS_VERSION or "overrides" in perms:
            overrides = perms.get("overrides") or {}
            return (
                {k: v for k, v in overrides.items() if isinstance(v, dict)},
                applied_template_id,
                bool(overrides),
            )

        snapshot = perms.get("apps") or {}
        if snapshot:
            return (
                {k: v for k, v in snapshot.items() if isinstance(v, dict)},
                applied_template_id,
                bool(perms.get("custom_overrides", True)),
            )

        # Oldest format: {"hiring": true, "tracking": false}
        flat = {
            app_id: {"enabled": enabled}
            for app_id, enabled in perms.items()
            if isinstance(enabled, bool)
        }
        return flat, applied_template_id, bool(flat)

    async def _get_member_departments(
        self, workspace_id: str, developer_id: str
    ) -> list[Department]:
        """Departments this person belongs to, primary first.

        ``_is_primary`` is stashed on each returned Department so callers can
        pick the persona-defining one without a second query. It is a transient
        attribute, not a column.
        """
        stmt = (
            select(Department, DepartmentMember.is_primary)
            .join(DepartmentMember, DepartmentMember.department_id == Department.id)
            .where(
                and_(
                    DepartmentMember.workspace_id == workspace_id,
                    DepartmentMember.developer_id == developer_id,
                    Department.is_active == True,  # noqa: E712
                )
            )
            .order_by(DepartmentMember.is_primary.desc(), Department.name)
        )
        result = await self.db.execute(stmt)
        departments: list[Department] = []
        for department, is_primary in result.all():
            department._is_primary = bool(is_primary)
            departments.append(department)
        return departments

    @staticmethod
    def _suggested_persona(departments: list[Department]) -> str | None:
        """The sidebar view implied by the person's primary department.

        Only the primary department gets a say: someone in Sales and Support
        needs one navigation, and averaging two personas produces neither.
        """
        for department in departments:
            if getattr(department, "_is_primary", False) and department.default_persona:
                return department.default_persona
        for department in departments:
            if department.default_persona:
                return department.default_persona
        return None

    async def check_app_access(
        self,
        workspace_id: str,
        developer_id: str,
        app_id: str,
    ) -> bool:
        """
        Check whether a member may *reach* an app — the enforcement question.

        Reads ``can_access``, not ``enabled``: an admin whose profile doesn't put
        CRM in their sidebar must still be able to open CRM to administer it.
        Use ``get_effective_access`` directly when you want the navigation answer.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            app_id: App ID to check

        Returns:
            True if member may reach the app
        """
        access = await self.get_effective_access(workspace_id, developer_id)
        app_access = access["apps"].get(app_id)
        if not app_access:
            # Unknown app id: not in the catalogue, so there is nothing to
            # enforce. Guards validate their app id at import time.
            return False
        return app_access["can_access"]

    async def check_workspace_app_enabled(
        self,
        workspace_id: str,
        app_id: str,
    ) -> bool:
        """Whether an app is enabled at the WORKSPACE level (the admin module toggle).

        This deliberately ignores per-role defaults and per-member overrides — it
        reflects only the workspace-wide on/off switch stored in
        ``workspace.settings["app_settings"]``. Used to enforce "disable a module
        for the workspace" without over-restricting based on role bundles.

        Defaults to True (enabled) when the app has no explicit setting.

        The settings lookup is served from a short in-process TTL cache — this
        check runs on nearly every guarded request.
        """
        key = str(workspace_id)
        now = time.monotonic()
        cached = _app_settings_cache.get(key)
        if cached is not None and now - cached[0] < _APP_SETTINGS_TTL_SECONDS:
            app_settings = cached[1]
        else:
            workspace = await self._get_workspace(workspace_id)
            app_settings = {}
            if workspace and workspace.settings:
                app_settings = workspace.settings.get("app_settings", {}) or {}
            _app_settings_cache[key] = (now, app_settings)
        return app_settings.get(app_id, True)

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
            True if member may reach the module
        """
        access = await self.get_effective_access(workspace_id, developer_id)
        app_access = access["apps"].get(app_id)
        if not app_access or not app_access["can_access"]:
            return False

        # If app has no modules, access is granted via app enabled
        if not app_access["modules"]:
            return True

        # Admins reach every module of an app they can reach, for the same
        # reason they reach every app: they have to be able to administer it.
        if access["is_admin"]:
            return True

        return app_access["modules"].get(module_id, False)

    async def update_member_access(
        self,
        workspace_id: str,
        developer_id: str,
        app_config: dict,
        applied_template_id: str | None = None,
        reasons: dict[str, str] | None = None,
        actor_id: str | None = None,
    ) -> WorkspaceMember:
        """
        Update a member's app access, stored as a delta against their baseline.

        Callers hand in a full picture of the apps they are deciding about (which
        is what an admin UI naturally produces), and this diffs it against the
        member's baseline and persists only the differences. That distinction is
        the whole point: the previous implementation stored the full picture, so
        the moment an admin toggled one app for one person that person stopped
        inheriting anything — no later department change ever reached them again.

        Apps absent from ``app_config`` are left inheriting rather than revoked,
        so a partial write is a partial write.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            app_config: Desired access {app_id: {enabled, modules}}
            applied_template_id: Pin this member to a template as their baseline
            reasons: Optional per-app note explaining an override, kept for audit
            actor_id: Developer making the change, recorded on the row

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

        baseline = await self._resolve_baseline(
            workspace_id, developer_id, applied_template_id
        )
        overrides = self._diff_against_baseline(app_config, baseline)

        member.app_permissions = self._build_member_permissions(
            overrides,
            applied_template_id=applied_template_id,
            reasons=reasons,
            actor_id=actor_id,
        )

        await self.db.commit()
        await self.db.refresh(member)
        await invalidate_app_settings_cache(workspace_id)
        return member

    async def set_member_overrides(
        self,
        workspace_id: str,
        developer_id: str,
        overrides: dict,
        reasons: dict[str, str] | None = None,
        actor_id: str | None = None,
    ) -> WorkspaceMember:
        """Write per-app override deltas directly.

        The three-state path: an app present with ``{"enabled": true/false}`` is
        a grant or a revoke, and an app simply absent from ``overrides`` inherits.
        Prefer this over ``update_member_access`` when the UI is expressing
        intent per app rather than submitting a whole grid.
        """
        member = await self._get_workspace_member(workspace_id, developer_id)
        if not member:
            raise ValueError("Member not found")

        cleaned: dict[str, dict] = {}
        for app_id, override in (overrides or {}).items():
            if app_id not in APP_CATALOG:
                raise ValueError(f"Unknown app: {app_id}")
            if not isinstance(override, dict):
                raise ValueError(f"Override for {app_id} must be an object")
            entry: dict = {}
            if "enabled" in override and override["enabled"] is not None:
                entry["enabled"] = bool(override["enabled"])
            modules = override.get("modules") or {}
            known_modules = APP_CATALOG[app_id].get("modules", {})
            module_entry = {
                module_id: bool(value)
                for module_id, value in modules.items()
                if module_id in known_modules and value is not None
            }
            if module_entry:
                entry["modules"] = module_entry
            if entry:
                cleaned[app_id] = entry

        existing = member.app_permissions or {}
        member.app_permissions = self._build_member_permissions(
            cleaned,
            applied_template_id=existing.get("applied_template_id"),
            reasons=reasons,
            actor_id=actor_id,
        )

        await self.db.commit()
        await self.db.refresh(member)
        await invalidate_app_settings_cache(workspace_id)
        return member

    @staticmethod
    def _build_member_permissions(
        overrides: dict,
        applied_template_id: str | None,
        reasons: dict[str, str] | None,
        actor_id: str | None,
    ) -> dict | None:
        """Build the v2 app_permissions payload, or None when nothing is set.

        Returning None rather than an empty envelope matters: NULL is what the
        resolver reads as "this member has never been overridden", and leaving
        behind `{"overrides": {}}` would look identical in behaviour but make
        every "has custom overrides" report wrong.
        """
        if not overrides and not applied_template_id:
            return None
        payload: dict = {
            "version": MEMBER_ACCESS_VERSION,
            "overrides": overrides,
            "applied_template_id": applied_template_id,
            "custom_overrides": bool(overrides),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if actor_id:
            payload["updated_by"] = str(actor_id)
        kept_reasons = {
            app_id: reason
            for app_id, reason in (reasons or {}).items()
            if app_id in overrides and reason
        }
        if kept_reasons:
            payload["reasons"] = kept_reasons
        return payload

    async def preview_access(
        self,
        workspace_id: str,
        department_ids: list[str],
        access_template_id: str | None = None,
        role: str = "member",
    ) -> tuple[dict, str, str | None, str | None]:
        """Resolve what a hypothetical member would get, for the invite screen.

        Deliberately shares the same union/fallback code as real resolution: a
        preview that agrees with the invite screen but disagrees with what the
        person actually receives is worse than no preview.

        Returns ``(app_config, baseline, baseline_detail, suggested_persona)``.
        """
        if access_template_id:
            template = await self._get_template(access_template_id)
            if template is None:
                raise ValueError("Template not found")
            if template.workspace_id and str(template.workspace_id) != str(workspace_id):
                raise ValueError("Template does not belong to this workspace")
            return (
                dict(template.app_config or {}),
                SOURCE_MEMBER_TEMPLATE,
                template.name,
                None,
            )

        departments: list[Department] = []
        if department_ids:
            stmt = select(Department).where(
                and_(
                    Department.workspace_id == workspace_id,
                    Department.id.in_(department_ids),
                    Department.is_active == True,  # noqa: E712
                )
            )
            departments = list((await self.db.execute(stmt)).scalars().all())
            # The first named department is treated as the primary one, matching
            # what accepting an invite does: the first department someone lands
            # in becomes their primary.
            for index, department in enumerate(departments):
                department._is_primary = index == 0

        profiled = [d for d in departments if d.app_config]
        persona = self._suggested_persona(departments)

        if profiled:
            detail = ", ".join(d.name for d in profiled)
            return (
                union_app_configs([d.app_config for d in profiled]),
                SOURCE_DEPARTMENT,
                detail,
                persona,
            )

        return (
            dict(get_default_app_access_for_role(role or "member")),
            SOURCE_ROLE_FALLBACK,
            ROLE_TEMPLATES.get(role, {}).get("name", role),
            persona,
        )

    async def _resolve_baseline(
        self,
        workspace_id: str,
        developer_id: str,
        applied_template_id: str | None = None,
    ) -> dict:
        """The access a member would have with no overrides of their own.

        What deltas are measured against, and what the invite screen previews.
        """
        if applied_template_id:
            template = await self._get_template(applied_template_id)
            if template:
                return dict(template.app_config or {})

        member = await self._get_workspace_member(workspace_id, developer_id)
        if not member:
            return {}

        departments = await self._get_member_departments(workspace_id, developer_id)
        profiled = [d for d in departments if d.app_config]
        baseline, _source, _detail = self._baseline_from_departments_or_role(
            member, profiled
        )
        return baseline

    @staticmethod
    def _diff_against_baseline(app_config: dict, baseline: dict) -> dict:
        """Reduce a desired full config to the deltas that differ from baseline."""
        overrides: dict[str, dict] = {}

        for app_id, desired in (app_config or {}).items():
            if app_id not in APP_CATALOG or not isinstance(desired, dict):
                continue

            base_app = baseline.get(app_id) or {}
            base_enabled = bool(base_app.get("enabled", False))
            base_modules = base_app.get("modules") or {}

            entry: dict = {}
            desired_enabled = bool(desired.get("enabled", False))
            if desired_enabled != base_enabled:
                entry["enabled"] = desired_enabled

            desired_modules = desired.get("modules") or {}
            module_entry: dict[str, bool] = {}
            for module_id, value in desired_modules.items():
                if module_id not in APP_CATALOG[app_id].get("modules", {}):
                    continue
                # Absent from the baseline's module map means inherited-on — the
                # same default the resolver applies.
                base_value = bool(base_modules.get(module_id, True)) if base_modules else True
                if bool(value) != base_value:
                    module_entry[module_id] = bool(value)
            if module_entry:
                entry["modules"] = module_entry

            if entry:
                overrides[app_id] = entry

        return overrides

    async def apply_template_to_member(
        self,
        workspace_id: str,
        developer_id: str,
        template_id: str,
        actor_id: str | None = None,
    ) -> WorkspaceMember:
        """
        Pin an app access template to a member as their baseline.

        A member-level template replaces the department baseline for that one
        person — "this individual is an exception" — and stays visible as such in
        the resolution trace.

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID
            template_id: Template ID to apply
            actor_id: Developer making the change, recorded on the row

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

        # Pin the template as this member's baseline, with no deltas on top. The
        # template's config is deliberately *not* copied onto the member: an
        # edit to the template should reach everyone pinned to it, which a
        # snapshot would have prevented.
        member.app_permissions = self._build_member_permissions(
            {},
            applied_template_id=str(template.id),
            reasons=None,
            actor_id=actor_id,
        )

        await self.db.commit()
        await self.db.refresh(member)
        await invalidate_app_settings_cache(workspace_id)
        return member

    async def bulk_apply_template(
        self,
        workspace_id: str,
        developer_ids: list[str],
        template_id: str,
        actor_id: str | None = None,
    ) -> list[WorkspaceMember]:
        """
        Pin an app access template to multiple members as their baseline.

        Args:
            workspace_id: Workspace ID
            developer_ids: List of developer IDs
            template_id: Template ID to apply
            actor_id: Developer making the change, recorded on each row

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

        for member in members:
            # A fresh dict per member: sharing one object across rows means
            # SQLAlchemy sees the same instance and a later in-place edit to one
            # member's permissions would silently follow the others.
            member.app_permissions = self._build_member_permissions(
                {},
                applied_template_id=str(template.id),
                reasons=None,
                actor_id=actor_id,
            )

        await self.db.commit()

        # Refresh all
        for member in members:
            await self.db.refresh(member)

        await invalidate_app_settings_cache(workspace_id)
        return members

    async def reset_member_to_inherited(
        self,
        workspace_id: str,
        developer_id: str,
    ) -> WorkspaceMember:
        """
        Drop every override so the member inherits again.

        What they inherit is their department profile if they have one, and their
        role bundle otherwise — so this is "stop treating this person as a special
        case", not "give them the role defaults".

        Args:
            workspace_id: Workspace ID
            developer_id: Developer ID

        Returns:
            Updated WorkspaceMember
        """
        member = await self._get_workspace_member(workspace_id, developer_id)
        if not member:
            raise ValueError("Member not found")

        # NULL is what the resolver reads as "never overridden".
        member.app_permissions = None

        await self.db.commit()
        await self.db.refresh(member)
        await invalidate_app_settings_cache(workspace_id)
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

            primary_department = next(
                (d for d in access["departments"] if d["is_primary"]),
                next(iter(access["departments"]), None),
            )

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
                # Where this row's access comes from, so the matrix can show
                # "Sales profile" or "no department — using role defaults"
                # instead of leaving an admin to infer it from the ticks.
                "baseline": access["baseline"],
                "department_id": primary_department["id"] if primary_department else None,
                "department_name": (
                    primary_department["name"] if primary_department else None
                ),
                "department_count": len(access["departments"]),
                "apps": app_summary,
            })

        return matrix

    # Helper methods
    async def _get_workspace_member(
        self, workspace_id: str, developer_id: str
    ) -> WorkspaceMember | None:
        """Get an *active* workspace member record.

        Filters on `status == "active"` at the helper level because
        most callers only check `if not member` and would otherwise
        configure / apply permissions for removed members. The one
        callsite that already double-checks status (around line 88)
        keeps working — it just falls into the `not member` branch
        sooner.
        """
        stmt = (
            select(WorkspaceMember)
            .options(selectinload(WorkspaceMember.custom_role))
            .where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                    WorkspaceMember.status == "active",
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
        apps: dict[str, EffectiveAppAccess] = {}
        for app_id in APP_CATALOG:
            apps[app_id] = {
                "app_id": app_id,
                "enabled": False,
                "can_access": False,
                "modules": {},
                "source": SOURCE_ROLE_FALLBACK,
                "source_detail": None,
            }
        return {
            "apps": apps,
            "applied_template_id": None,
            "applied_template_name": None,
            "has_custom_overrides": False,
            "is_admin": False,
            "baseline": SOURCE_ROLE_FALLBACK,
            "departments": [],
            "suggested_persona": None,
        }

    # =========================================================================
    # Access Requests
    # =========================================================================

    async def create_access_request(
        self,
        workspace_id: str,
        requester_id: str,
        app_id: str,
        reason: str | None = None,
    ) -> AppAccessRequest:
        """Create a new app access request and notify workspace admins."""
        from datetime import datetime as dt

        # Validate app exists
        if app_id not in APP_CATALOG:
            raise ValueError(f"Unknown app: {app_id}")

        # Check for existing pending request
        existing = await self.get_pending_request(workspace_id, requester_id, app_id)
        if existing:
            raise ValueError("A pending request already exists for this app")

        request = AppAccessRequest(
            workspace_id=workspace_id,
            requester_id=requester_id,
            app_id=app_id,
            status=AppAccessRequestStatus.PENDING.value,
            reason=reason,
        )
        self.db.add(request)
        await self.db.commit()
        await self.db.refresh(request)

        # Notify workspace admins
        await self._notify_admins_of_request(request)

        return request

    async def list_access_requests(
        self,
        workspace_id: str,
        status_filter: str | None = None,
    ) -> list[AppAccessRequest]:
        """List access requests for a workspace (admin view)."""
        conditions = [AppAccessRequest.workspace_id == workspace_id]
        if status_filter:
            conditions.append(AppAccessRequest.status == status_filter)

        stmt = (
            select(AppAccessRequest)
            .where(and_(*conditions))
            .order_by(AppAccessRequest.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_my_requests(
        self,
        workspace_id: str,
        requester_id: str,
    ) -> list[AppAccessRequest]:
        """Get the current user's access requests."""
        stmt = (
            select(AppAccessRequest)
            .where(
                and_(
                    AppAccessRequest.workspace_id == workspace_id,
                    AppAccessRequest.requester_id == requester_id,
                )
            )
            .order_by(AppAccessRequest.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_pending_request(
        self,
        workspace_id: str,
        requester_id: str,
        app_id: str,
    ) -> AppAccessRequest | None:
        """Check if a pending request exists for a given app."""
        stmt = select(AppAccessRequest).where(
            and_(
                AppAccessRequest.workspace_id == workspace_id,
                AppAccessRequest.requester_id == requester_id,
                AppAccessRequest.app_id == app_id,
                AppAccessRequest.status == AppAccessRequestStatus.PENDING.value,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def review_request(
        self,
        request_id: str,
        reviewer_id: str,
        action: str,
        notes: str | None = None,
    ) -> AppAccessRequest:
        """Approve or reject an access request."""
        from datetime import datetime as dt

        if action not in ("approve", "reject"):
            raise ValueError("Action must be 'approve' or 'reject'")

        stmt = select(AppAccessRequest).where(AppAccessRequest.id == request_id)
        result = await self.db.execute(stmt)
        request = result.scalar_one_or_none()

        if not request:
            raise ValueError("Request not found")

        if request.status != AppAccessRequestStatus.PENDING.value:
            raise ValueError("Only pending requests can be reviewed")

        new_status = (
            AppAccessRequestStatus.APPROVED.value
            if action == "approve"
            else AppAccessRequestStatus.REJECTED.value
        )

        request.status = new_status
        request.reviewed_by_id = reviewer_id
        request.reviewed_at = dt.utcnow()
        request.review_notes = notes

        # If approved, enable the app for the requester
        if action == "approve":
            await self._enable_app_for_member(
                request.workspace_id, request.requester_id, request.app_id
            )

        await self.db.commit()
        await self.db.refresh(request)

        # Notify the requester
        await self._notify_requester_of_review(request)

        return request

    async def withdraw_request(
        self,
        request_id: str,
        requester_id: str,
    ) -> AppAccessRequest:
        """Withdraw a pending request (by the requester)."""
        stmt = select(AppAccessRequest).where(AppAccessRequest.id == request_id)
        result = await self.db.execute(stmt)
        request = result.scalar_one_or_none()

        if not request:
            raise ValueError("Request not found")

        if request.requester_id != requester_id:
            raise ValueError("Only the requester can withdraw their request")

        if request.status != AppAccessRequestStatus.PENDING.value:
            raise ValueError("Only pending requests can be withdrawn")

        request.status = AppAccessRequestStatus.WITHDRAWN.value
        await self.db.commit()
        await self.db.refresh(request)
        return request

    async def _enable_app_for_member(
        self,
        workspace_id: str,
        developer_id: str,
        app_id: str,
    ) -> None:
        """Enable a single app for a member by updating their app_permissions."""
        member = await self._get_workspace_member(workspace_id, developer_id)
        if not member:
            return

        current_perms = member.app_permissions or {}
        apps = current_perms.get("apps", {})
        app_config = apps.get(app_id, {})
        app_config["enabled"] = True

        # Enable all modules by default
        app_def = APP_CATALOG.get(app_id, {})
        modules = app_def.get("modules", {})
        if modules:
            mod_config = app_config.get("modules", {})
            for mod_id in modules:
                mod_config[mod_id] = True
            app_config["modules"] = mod_config

        apps[app_id] = app_config
        current_perms["apps"] = apps
        current_perms["custom_overrides"] = True
        member.app_permissions = current_perms

    async def _notify_admins_of_request(self, request: AppAccessRequest) -> None:
        """Send notification to workspace admins about a new access request."""
        try:
            from aexy.services.notification_service import NotificationService
            from aexy.models.notification import NotificationEventType
            from aexy.services.workspace_service import WorkspaceService

            workspace_service = WorkspaceService(self.db)
            notification_service = NotificationService(self.db)

            admins = await workspace_service.get_members_by_role(
                request.workspace_id, "admin"
            )
            # Also include owners
            owners = await workspace_service.get_members_by_role(
                request.workspace_id, "owner"
            )
            admin_members = {str(m.developer_id): m for m in admins + owners}

            requester_name = request.requester.name if request.requester else "A member"
            app_name = APP_CATALOG.get(request.app_id, {}).get("name", request.app_id)

            for dev_id in admin_members:
                await notification_service.create_notification(
                    recipient_id=dev_id,
                    event_type=NotificationEventType.APP_ACCESS_REQUESTED,
                    title="App Access Request",
                    body=f"{requester_name} requested access to {app_name}",
                    context={
                        "request_id": str(request.id),
                        "app_id": request.app_id,
                        "workspace_id": request.workspace_id,
                        "app_name": app_name,
                        "requester_name": requester_name,
                        "action_url": f"/settings/access?tab=requests",
                    },
                )
        except Exception:
            # Don't fail the request if notification fails
            pass

    async def _notify_requester_of_review(self, request: AppAccessRequest) -> None:
        """Notify the requester when their request is approved or rejected."""
        try:
            from aexy.services.notification_service import NotificationService
            from aexy.models.notification import NotificationEventType

            notification_service = NotificationService(self.db)

            app_name = APP_CATALOG.get(request.app_id, {}).get("name", request.app_id)
            is_approved = request.status == AppAccessRequestStatus.APPROVED.value

            event_type = (
                NotificationEventType.APP_ACCESS_APPROVED
                if is_approved
                else NotificationEventType.APP_ACCESS_REJECTED
            )
            action_word = "approved" if is_approved else "rejected"

            await notification_service.create_notification(
                recipient_id=request.requester_id,
                event_type=event_type,
                title=f"Access Request {action_word.title()}",
                body=f"Your request for access to {app_name} was {action_word}",
                context={
                    "request_id": str(request.id),
                    "app_id": request.app_id,
                    "workspace_id": request.workspace_id,
                    "app_name": app_name,
                    "action_url": f"/{APP_CATALOG.get(request.app_id, {}).get('base_route', 'dashboard')}",
                },
            )
        except Exception:
            pass

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
