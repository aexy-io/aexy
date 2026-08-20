"""Which model each AI feature runs on, for one workspace.

The read is the interesting half. A configuration page that showed only what is
*stored* could not tell its reader that an admin changed provider at
``/settings/ai`` and half their choices are now being ignored — so every row here
carries what it will actually resolve to, where that answer came from, and why a
stored choice is not being used when it is not.

Reads are open to any member because the page renders read-only for them, and
because hiding a control was never access control. Writes are admin: spend and
output consistency are workspace properties, and there is no honest way to
reconcile four people's opinions about which model a shared document is edited
with.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.llm.base import LLMConfig
from aexy.llm.features import AI_CATEGORIES, AI_FEATURES, is_dormant
from aexy.llm.model_catalog import catalog_for, normalise_model
from aexy.llm.gateway import get_llm_gateway
from aexy.llm.resolution import (
    LLMNotConfigured,
    platform_config,
    resolve_many,
)
from aexy.models.ai_model_override import OverrideScope, WorkspaceAIModelOverride
from aexy.models.developer import Developer
from aexy.schemas.ai_models import (
    AIModelsResponse,
    CategoryModels,
    FeatureModel,
    ModelChoice,
    ModelOption,
    SetModelRequest,
    WorkspaceDefault,
)
from aexy.services.app_access_service import AppAccessService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/ai-models", tags=["AI model configuration"]
)

_CATEGORY_IDS = {category.id for category in AI_CATEGORIES}
_FEATURE_IDS = {feature.id for feature in AI_FEATURES}


async def _require(
    workspace_id: str, user: Developer, db: AsyncSession, role: str
) -> None:
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(user.id), role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


async def _stored(
    db: AsyncSession, workspace_id: str
) -> dict[tuple[str, str], WorkspaceAIModelOverride]:
    rows = (
        await db.execute(
            select(WorkspaceAIModelOverride).where(
                WorkspaceAIModelOverride.workspace_id == workspace_id
            )
        )
    ).scalars().all()
    return {(row.scope, row.key): row for row in rows}


async def _visible_apps(db: AsyncSession, workspace_id: str) -> set[str] | None:
    """Apps this workspace can reach, or None when that cannot be determined.

    None means show everything rather than nothing: a feature hidden because a
    lookup failed is indistinguishable, to the reader, from a feature that does
    not exist.
    """
    service = AppAccessService(db)
    apps: set[str] = set()
    for feature in AI_FEATURES:
        if feature.app and feature.app not in apps:
            try:
                if await service.check_workspace_app_enabled(workspace_id, feature.app):
                    apps.add(feature.app)
            except Exception:  # noqa: BLE001 - see the docstring
                return None
    return apps


@router.get("", response_model=AIModelsResponse)
async def get_ai_models(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> AIModelsResponse:
    """Every AI feature, what it will run on, and where that came from."""
    await _require(workspace_id, current_user, db, "viewer")

    can_manage = await WorkspaceService(db).check_permission(
        workspace_id, str(current_user.id), "admin"
    )
    stored = await _stored(db, workspace_id)
    visible = await _visible_apps(db, workspace_id)

    try:
        # One read for every feature rather than fifty. `resolve_many` does not
        # raise for a disabled workspace — the page still has to render — so
        # that state is reported separately below.
        gateway = get_llm_gateway()
        batch = await resolve_many(
            workspace_id,
            _FEATURE_IDS,
            base=getattr(gateway.provider, "config", None) if gateway else None,
            # Our session, so a PUT or DELETE that has flushed but not committed
            # sees its own write. Without this the response describes the state
            # before the save, and the page shows a picker that does nothing.
            session=db,
        )
    except LLMNotConfigured:
        # Nothing is configured at all. The page renders "AI is not set up"
        # rather than an empty picker.
        return AIModelsResponse(can_manage=can_manage)

    resolved = batch.features
    default = WorkspaceDefault(
        provider=batch.default.config.provider,
        model=batch.default.config.model,
        source=batch.default.source,
    )

    try:
        from aexy.services.workspace_ai_settings_service import is_ai_enabled

        ai_disabled = not await is_ai_enabled(db, workspace_id)
    except Exception:  # noqa: BLE001 - drives a banner, not a gate
        ai_disabled = False

    def choice(key: tuple[str, str]) -> ModelChoice | None:
        row = stored.get(key)
        return ModelChoice(model=row.model, provider=row.provider) if row else None

    categories: list[CategoryModels] = []
    for category in AI_CATEGORIES:
        features: list[FeatureModel] = []
        for feature in AI_FEATURES:
            if feature.category != category.id:
                continue
            if visible is not None and feature.app and feature.app not in visible:
                continue
            answer = resolved[feature.id]
            features.append(
                FeatureModel(
                    id=feature.id,
                    name=feature.name,
                    description=feature.description,
                    kind=feature.kind,
                    app=feature.app,
                    configurable=feature.configurable,
                    reason_fixed=feature.reason_fixed,
                    # Whether it is off *right now*, which depends on the
                    # deployment's switch — not just whether it is dormant by
                    # default.
                    dormant_reason=is_dormant(feature.id),
                    override=choice(("feature", feature.id)),
                    effective_model=answer.config.model,
                    effective_provider=answer.config.provider,
                    source=answer.source,
                    # Only this feature's own ignored override. A category-level
                    # mismatch is explained once, on the category card below —
                    # echoing it on every feature reads as five problems instead
                    # of one.
                    ignored_reason=(
                        answer.ignored_override
                        if answer.ignored_scope == "feature"
                        else None
                    ),
                )
            )
        if not features:
            # Every feature in this category belongs to an app the workspace does
            # not have. Offering a model for it would be offering a setting with
            # nothing to apply to.
            continue
        stored_category = choice(("category", category.id))
        categories.append(
            CategoryModels(
                id=category.id,
                name=category.name,
                description=category.description,
                override=stored_category,
                ignored_reason=(
                    None
                    if stored_category is None
                    or stored_category.provider == default.provider
                    else (
                        f"{stored_category.model} was chosen for "
                        f"{stored_category.provider}, and this workspace now uses "
                        f"{default.provider}"
                    )
                ),
                features=features,
            )
        )

    return AIModelsResponse(
        workspace_default=default,
        catalog=[
            ModelOption(
                id=entry.id,
                label=entry.label,
                note=entry.note,
                in_use_here=entry.in_use_here,
            )
            for entry in catalog_for(default.provider)
        ],
        categories=categories,
        can_manage=can_manage,
        ai_disabled=ai_disabled,
    )


@router.put("", response_model=AIModelsResponse)
async def set_ai_model(
    workspace_id: str,
    data: SetModelRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> AIModelsResponse:
    """Choose a model for one category or one feature. Admin only."""
    await _require(workspace_id, current_user, db, "admin")

    known = _CATEGORY_IDS if data.scope == OverrideScope.CATEGORY else _FEATURE_IDS
    if data.key not in known:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No such {data.scope}: {data.key}",
        )

    if data.scope == OverrideScope.FEATURE:
        feature = next(f for f in AI_FEATURES if f.id == data.key)
        if not feature.configurable:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=feature.reason_fixed or "That feature's model is fixed.",
            )

    model = normalise_model(data.model)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That does not look like a model identifier.",
        )

    # The provider is the server's to record, never the client's: a model can
    # only be chosen FOR the provider the workspace is actually using, and a
    # stale page naming the pair could store a combination that never applies.
    try:
        provider = (await _base_config(db, workspace_id)).provider
    except LLMNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No AI provider is configured for this workspace, so there is "
                "nothing to choose a model on yet."
            ),
        ) from exc

    existing = (
        await db.execute(
            select(WorkspaceAIModelOverride).where(
                WorkspaceAIModelOverride.workspace_id == workspace_id,
                WorkspaceAIModelOverride.scope == data.scope,
                WorkspaceAIModelOverride.key == data.key,
            )
        )
    ).scalar_one_or_none()

    if existing is None:
        db.add(
            WorkspaceAIModelOverride(
                workspace_id=workspace_id,
                scope=data.scope,
                key=data.key,
                model=model,
                provider=provider,
                updated_by_id=str(current_user.id),
            )
        )
    else:
        existing.model = model
        existing.provider = provider
        existing.updated_by_id = str(current_user.id)

    await db.flush()
    return await get_ai_models(workspace_id, current_user, db)


@router.delete("/{scope}/{key}", response_model=AIModelsResponse)
async def clear_ai_model(
    workspace_id: str,
    scope: str,
    key: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> AIModelsResponse:
    """Stop overriding, and go back to inheriting. Admin only.

    Deletes the row rather than writing whatever is currently effective, so the
    target keeps following its default when an admin changes that later — which
    is what "reset" has to mean for this to be a hierarchy at all.
    """
    await _require(workspace_id, current_user, db, "admin")

    if scope not in OverrideScope.ALL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"scope must be one of {OverrideScope.ALL}",
        )

    await db.execute(
        delete(WorkspaceAIModelOverride).where(
            WorkspaceAIModelOverride.workspace_id == workspace_id,
            WorkspaceAIModelOverride.scope == scope,
            WorkspaceAIModelOverride.key == key,
        )
    )
    await db.flush()
    return await get_ai_models(workspace_id, current_user, db)


async def _base_config(db: AsyncSession, workspace_id: str) -> LLMConfig:
    """The workspace's provider and model before any feature override.

    Uses the workspace's own credential when it has one, otherwise the
    platform's — the same first two steps `resolve_llm` takes, without the
    override lookup that would be circular here.
    """
    from aexy.services.workspace_ai_settings_service import resolve_ai_config

    resolved = await resolve_ai_config(db, workspace_id)
    if resolved.config is not None:
        return resolved.config
    return platform_config()
