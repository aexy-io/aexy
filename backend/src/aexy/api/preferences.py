"""Email subscription preferences API routes."""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.preference_service import PreferenceService
from aexy.services.workspace_service import WorkspaceService
from aexy.schemas.email_marketing import (
    SubscriptionCategoryCreate,
    SubscriptionCategoryUpdate,
    SubscriptionCategoryResponse,
    SubscriberResponse,
    PreferenceCenterData,
    PreferenceCenterUpdate,
    SubscriberImportRequest,
    SubscriberImportResponse,
)

# Public routes (token-based, no auth required)
public_router = APIRouter(prefix="/preferences", tags=["preferences-public"])

# Admin routes (workspace-scoped, auth required)
admin_router = APIRouter(prefix="/workspaces/{workspace_id}/subscriptions", tags=["subscriptions"])


async def check_workspace_permission(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, developer_id, required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace",
        )


def get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    if request.client:
        return request.client.host
    return "unknown"


# =============================================================================
# PUBLIC PREFERENCE CENTER ROUTES
# =============================================================================

@public_router.get("/{token}")
async def get_preference_center(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get preference center data for a subscriber.

    This is a public endpoint that uses the subscriber's preference token.
    """
    service = PreferenceService(db)
    data = await service.get_preference_center_data(token)

    if not data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid preference token",
        )

    # Convert categories to response format
    categories_response = [
        SubscriptionCategoryResponse.model_validate(cat)
        for cat in data["categories"]
    ]

    return PreferenceCenterData(
        subscriber_id=data["subscriber_id"],
        email=data["email"],
        status=data["status"],
        categories=categories_response,
        preferences=data["preferences"],
    )


@public_router.post("/{token}")
async def update_preferences(
    token: str,
    data: PreferenceCenterUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Update subscriber preferences.

    This is a public endpoint that uses the subscriber's preference token.
    """
    service = PreferenceService(db)

    if data.unsubscribe_all:
        subscriber = await service.unsubscribe_all(
            token=token,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    else:
        subscriber = await service.update_preferences(
            token=token,
            preferences=data.preferences,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )

    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid preference token",
        )

    return {"status": "updated", "subscriber_id": subscriber.id}


@public_router.post("/{token}/unsubscribe")
async def one_click_unsubscribe(
    token: str,
    request: Request,
    c: str | None = Query(default=None, description="Campaign ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    One-click unsubscribe from all emails.

    This is a public endpoint that uses the subscriber's preference token.
    """
    service = PreferenceService(db)

    subscriber = await service.unsubscribe_all(
        token=token,
        source="link",
        campaign_id=c,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )

    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid preference token",
        )

    return {"status": "unsubscribed", "message": "You have been unsubscribed from all emails."}


@public_router.post("/{token}/resubscribe")
async def resubscribe(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Resubscribe a previously unsubscribed user.

    This is a public endpoint that uses the subscriber's preference token.
    """
    service = PreferenceService(db)

    subscriber = await service.resubscribe(token)

    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid preference token",
        )

    return {"status": "resubscribed", "message": "You have been resubscribed to emails."}


@public_router.get("/{token}/page", response_class=HTMLResponse)
async def preference_center_page(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Render the preference center HTML page.

    This provides a simple HTML interface for managing preferences.
    """
    service = PreferenceService(db)
    data = await service.get_preference_center_data(token)

    if not data:
        return HTMLResponse(
            content="""
            <!DOCTYPE html>
            <html>
            <head><title>Not Found</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>Invalid Link</h1>
                <p>This preference link is invalid or has expired.</p>
            </body>
            </html>
            """,
            status_code=404,
        )

    # Build category checkboxes
    categories_html = ""
    for cat in data["categories"]:
        pref = data["preferences"].get(cat.id, {"is_subscribed": cat.default_subscribed})
        checked = "checked" if pref.get("is_subscribed") else ""
        disabled = "disabled" if cat.required else ""

        categories_html += f"""
        <div class="category">
            <label>
                <input type="checkbox" name="category_{cat.id}" {checked} {disabled}>
                <strong>{cat.name}</strong>
                {f'<span class="required">(Required)</span>' if cat.required else ''}
            </label>
            {f'<p class="description">{cat.description}</p>' if cat.description else ''}
        </div>
        """

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Email Preferences</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * {{ box-sizing: border-box; }}
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background: #f5f5f5;
            }}
            .container {{
                background: white;
                border-radius: 8px;
                padding: 30px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }}
            h1 {{ color: #333; margin-top: 0; }}
            .email {{ color: #666; margin-bottom: 20px; }}
            .category {{
                padding: 15px;
                border: 1px solid #eee;
                border-radius: 6px;
                margin-bottom: 10px;
            }}
            .category label {{
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
            }}
            .category input[type="checkbox"] {{
                width: 20px;
                height: 20px;
            }}
            .description {{
                color: #666;
                font-size: 14px;
                margin: 5px 0 0 30px;
            }}
            .required {{ color: #999; font-size: 12px; }}
            .buttons {{
                margin-top: 20px;
                display: flex;
                gap: 10px;
            }}
            button {{
                padding: 12px 24px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
            }}
            .save {{ background: #007bff; color: white; }}
            .save:hover {{ background: #0056b3; }}
            .unsubscribe {{ background: #dc3545; color: white; }}
            .unsubscribe:hover {{ background: #c82333; }}
            .status {{ padding: 10px; border-radius: 4px; margin-top: 15px; display: none; }}
            .success {{ background: #d4edda; color: #155724; }}
            .error {{ background: #f8d7da; color: #721c24; }}
            .unsubscribed-notice {{
                background: #fff3cd;
                color: #856404;
                padding: 15px;
                border-radius: 6px;
                margin-bottom: 20px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Email Preferences</h1>
            <p class="email">Managing preferences for: <strong>{data['email']}</strong></p>

            {'<div class="unsubscribed-notice">You are currently unsubscribed from all emails. <a href="#" onclick="resubscribe()">Click here to resubscribe</a>.</div>' if data['status'] == 'unsubscribed' else ''}

            <form id="preferencesForm">
                <h3>Email Categories</h3>
                {categories_html if categories_html else '<p>No email categories configured.</p>'}

                <div class="buttons">
                    <button type="submit" class="save">Save Preferences</button>
                    <button type="button" class="unsubscribe" onclick="unsubscribeAll()">Unsubscribe from All</button>
                </div>
            </form>

            <div id="status" class="status"></div>
        </div>

        <script>
            const token = '{token}';

            document.getElementById('preferencesForm').addEventListener('submit', async (e) => {{
                e.preventDefault();
                const preferences = [];

                document.querySelectorAll('.category input[type="checkbox"]').forEach(cb => {{
                    const categoryId = cb.name.replace('category_', '');
                    preferences.push({{
                        category_id: categoryId,
                        is_subscribed: cb.checked
                    }});
                }});

                try {{
                    const response = await fetch(`/preferences/${{token}}`, {{
                        method: 'POST',
                        headers: {{ 'Content-Type': 'application/json' }},
                        body: JSON.stringify({{ preferences, unsubscribe_all: false }})
                    }});

                    if (response.ok) {{
                        showStatus('Preferences saved successfully!', 'success');
                    }} else {{
                        showStatus('Failed to save preferences.', 'error');
                    }}
                }} catch (err) {{
                    showStatus('An error occurred.', 'error');
                }}
            }});

            async function unsubscribeAll() {{
                if (!confirm('Are you sure you want to unsubscribe from all emails?')) return;

                try {{
                    const response = await fetch(`/preferences/${{token}}/unsubscribe`, {{
                        method: 'POST'
                    }});

                    if (response.ok) {{
                        showStatus('You have been unsubscribed from all emails.', 'success');
                        setTimeout(() => location.reload(), 1500);
                    }} else {{
                        showStatus('Failed to unsubscribe.', 'error');
                    }}
                }} catch (err) {{
                    showStatus('An error occurred.', 'error');
                }}
            }}

            async function resubscribe() {{
                try {{
                    const response = await fetch(`/preferences/${{token}}/resubscribe`, {{
                        method: 'POST'
                    }});

                    if (response.ok) {{
                        showStatus('You have been resubscribed!', 'success');
                        setTimeout(() => location.reload(), 1500);
                    }} else {{
                        showStatus('Failed to resubscribe.', 'error');
                    }}
                }} catch (err) {{
                    showStatus('An error occurred.', 'error');
                }}
            }}

            function showStatus(message, type) {{
                const status = document.getElementById('status');
                status.textContent = message;
                status.className = 'status ' + type;
                status.style.display = 'block';
                setTimeout(() => status.style.display = 'none', 5000);
            }}
        </script>
    </body>
    </html>
    """

    return HTMLResponse(content=html_content)


# =============================================================================
# ADMIN CATEGORY ROUTES
# =============================================================================

@admin_router.post("/categories", response_model=SubscriptionCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    workspace_id: str,
    data: SubscriptionCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new subscription category."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = PreferenceService(db)
    category = await service.create_category(workspace_id, data)

    return category


@admin_router.get("/categories", response_model=list[SubscriptionCategoryResponse])
async def list_categories(
    workspace_id: str,
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List all subscription categories for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = PreferenceService(db)
    categories = await service.list_categories(workspace_id, is_active)

    return categories


@admin_router.get("/categories/{category_id}", response_model=SubscriptionCategoryResponse)
async def get_category(
    workspace_id: str,
    category_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a subscription category by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = PreferenceService(db)
    category = await service.get_category(category_id, workspace_id)

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    return category


@admin_router.patch("/categories/{category_id}", response_model=SubscriptionCategoryResponse)
async def update_category(
    workspace_id: str,
    category_id: str,
    data: SubscriptionCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update a subscription category."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = PreferenceService(db)
    category = await service.update_category(category_id, workspace_id, data)

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    return category


@admin_router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    workspace_id: str,
    category_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a subscription category."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = PreferenceService(db)
    deleted = await service.delete_category(category_id, workspace_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )


# =============================================================================
# ADMIN SUBSCRIBER ROUTES
# =============================================================================

@admin_router.get("/subscribers", response_model=list[SubscriberResponse])
async def list_subscribers(
    workspace_id: str,
    status: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List all subscribers for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = PreferenceService(db)
    offset = (page - 1) * page_size
    subscribers, total = await service.list_subscribers(
        workspace_id=workspace_id,
        status=status,
        search=search,
        limit=page_size,
        offset=offset,
    )

    return subscribers


@admin_router.get("/subscribers/{subscriber_id}", response_model=SubscriberResponse)
async def get_subscriber(
    workspace_id: str,
    subscriber_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a subscriber by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = PreferenceService(db)
    subscriber = await service.get_subscriber_by_id(subscriber_id, workspace_id)

    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscriber not found",
        )

    return subscriber


@admin_router.delete("/subscribers/{subscriber_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscriber(
    workspace_id: str,
    subscriber_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a subscriber (GDPR right to erasure)."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = PreferenceService(db)
    deleted = await service.delete_subscriber(subscriber_id, workspace_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscriber not found",
        )


@admin_router.post("/subscribers/import", response_model=SubscriberImportResponse)
async def import_subscribers(
    workspace_id: str,
    data: SubscriberImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Import subscribers in bulk."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = PreferenceService(db)
    result = await service.import_subscribers(
        workspace_id=workspace_id,
        subscribers=data.subscribers,
        category_ids=data.category_ids,
        skip_verification=data.skip_verification,
    )

    return SubscriberImportResponse(**result)


@admin_router.get("/subscribers/export")
async def export_subscribers(
    workspace_id: str,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Export subscribers as JSON."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = PreferenceService(db)
    data = await service.export_subscribers(workspace_id, status)

    return {"subscribers": data, "total": len(data)}


@admin_router.post("/subscribers/{subscriber_id}/unsubscribe")
async def admin_unsubscribe(
    workspace_id: str,
    subscriber_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Admin action to unsubscribe a user."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = PreferenceService(db)
    subscriber = await service.get_subscriber_by_id(subscriber_id, workspace_id)

    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscriber not found",
        )

    result = await service.unsubscribe_all(
        token=subscriber.preference_token,
        source="api",
    )

    return {"status": "unsubscribed", "subscriber_id": result.id}


@admin_router.post("/subscribers/{subscriber_id}/resubscribe")
async def admin_resubscribe(
    workspace_id: str,
    subscriber_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Admin action to resubscribe a user."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = PreferenceService(db)
    subscriber = await service.get_subscriber_by_id(subscriber_id, workspace_id)

    if not subscriber:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscriber not found",
        )

    result = await service.resubscribe(subscriber.preference_token)

    return {"status": "resubscribed", "subscriber_id": result.id}


# =============================================================================
# ADMIN STATS
# =============================================================================

@admin_router.get("/stats")
async def get_subscription_stats(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get subscription statistics for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from sqlalchemy import select, func
    from aexy.models.email_marketing import EmailSubscriber

    # Get counts by status
    result = await db.execute(
        select(
            EmailSubscriber.status,
            func.count(EmailSubscriber.id),
        )
        .where(EmailSubscriber.workspace_id == workspace_id)
        .group_by(EmailSubscriber.status)
    )

    status_counts = {}
    total = 0
    for row in result.all():
        status_counts[row[0]] = row[1]
        total += row[1]

    return {
        "total": total,
        "active": status_counts.get("active", 0),
        "unsubscribed": status_counts.get("unsubscribed", 0),
        "bounced": status_counts.get("bounced", 0),
        "complained": status_counts.get("complained", 0),
    }
