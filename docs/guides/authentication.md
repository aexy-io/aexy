# Authentication & Permissions

How Aexy verifies who you are, which workspace you're operating in, and what you're allowed to do.

## TL;DR

- Bearer JWTs in the `Authorization: Bearer <token>` header, issued by `/auth/<provider>/callback`.
- Sign-in providers: **GitHub**, **Google**, **Microsoft** — each lives in `backend/src/aexy/api/auth.py`.
- Tokens carry only `sub` (developer ID); workspace is **always a path parameter** (`/workspaces/{workspace_id}/...`) — no subdomain or tenant header.
- Authorization is per-workspace RBAC backed by `CustomRole` + a `PERMISSIONS` catalog. Endpoints call `PermissionService.check_permission(workspace_id, developer_id, "can_X")` to gate access.
- Long-lived programmatic access uses `aexy_…` API tokens (`api_tokens.py` + `ApiTokenService`).
- Three public surfaces — forms, projects, tables — bypass auth via share tokens.

## JWT lifecycle

Token issuance (`backend/src/aexy/api/auth.py:102-110`):

```python
def create_access_token(developer_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode = {"sub": developer_id, "exp": expire, "type": "access"}
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
```

Validation happens in two dependencies in `backend/src/aexy/api/developers.py`:

| Dep | Returns | When |
|---|---|---|
| `get_current_developer_id` (`developers.py:33-69`) | `str` developer UUID | When you only need the ID. Cheaper — no extra DB read. |
| `get_current_developer` (`developers.py:72-85`) | `Developer` ORM object | When you need the user record. Raises 404 if the row is gone. |

Both raise HTTP 401 on missing/invalid/expired tokens.

### Frontend storage

Browser-side, the JWT lives in `localStorage` under key `token` (not `auth_token` — check `frontend/src/lib/api.ts` if you're wiring auth on a new client). The API client adds `Authorization: Bearer …` to every request.

### Refresh

There is no JWT refresh endpoint. When the token expires, the user re-authenticates with the same OAuth provider. Provider-side refresh tokens (GitHub/Google/Microsoft) are stored per integration row and refreshed automatically by `OAuthTokenService` before each external API call — those are independent of the Aexy JWT.

## OAuth providers

| Provider | Login start | Callback | Connect-CRM variant | Token storage |
|---|---|---|---|---|
| GitHub | `/auth/github/login` | `/auth/github/callback` | (single flow) | `GitHubConnection` |
| Google | `/auth/google/login` | `/auth/google/callback` | `/auth/google/connect-crm` | `GoogleConnection` (sign-in) + `GoogleIntegration` (CRM) |
| Microsoft | `/auth/microsoft/login` | `/auth/microsoft/callback` | `/auth/microsoft/connect-crm` | `MicrosoftConnection` |

The "connect-CRM" variant exists for Google and Microsoft to ask for the additional Gmail/Outlook + Calendar scopes only when the user opts into mail/calendar sync, rather than at sign-in. State is stored in Redis with a 10-minute TTL during the round-trip.

See [google.md](../google.md) and [microsoft.md](../microsoft.md) for provider-specific OAuth setup.

## API tokens (`aexy_…`)

For MCP, the CLI, the VS Code extension, and any external integration that can't run an interactive OAuth flow.

`ApiToken` model (`backend/src/aexy/models/api_token.py:13-39`):

| Field | Note |
|---|---|
| `developer_id` | Tokens are tied to a person — there is no "service account" abstraction. |
| `token_hash` | SHA256 of the secret. The plaintext is shown **once** on creation. |
| `token_prefix` | First 12 chars (`aexy_xxxxxxxx`) for display/audit. |
| `expires_at` | Optional. |
| `last_used_at` | Updated on every use. |
| `is_active` | Soft-disable without deleting. |

Endpoints (`api_tokens.py`):

```
POST   /developers/me/api-tokens   → returns the plaintext token once
GET    /developers/me/api-tokens   → list (prefix only)
DELETE /developers/me/api-tokens/{token_id}
```

Validation (`developers.py:40-49`): if the bearer token starts with `aexy_`, `get_current_developer_id` delegates to `ApiTokenService.validate(token)` instead of JWT decode. This is transparent to endpoint code — the same `Depends(get_current_developer)` works for both.

## Workspaces & multi-tenancy

Everything except sign-in and a couple of platform admin endpoints is scoped to a workspace. The `workspace_id` is **always an explicit URL path parameter** — Aexy does **not** use subdomain routing or a tenant header.

`Workspace` model (`backend/src/aexy/models/workspace.py:23-146`):

| Field | Purpose |
|---|---|
| `id`, `slug` | Unique workspace identifiers |
| `type` | `"internal"` or `"github_linked"` |
| `owner_id` | FK to the founding Developer |
| `plan_id` | Subscription plan |
| `settings` | JSONB feature flags |
| `is_active` | Soft-disable |

Membership is a junction table `WorkspaceMember` (`workspace.py:149-252`):

- `developer_id` + `workspace_id` (unique)
- `role` (legacy string) + `custom_role_id` (FK to `CustomRole`) — modern path
- `permission_overrides` (JSONB) for per-user toggles on top of the role
- `app_permissions` (JSONB) for per-app access (`hiring`, `tracking`, `oncall`, etc.)

A developer can belong to multiple workspaces. Their "current" workspace is stored on the `Developer` record as `current_workspace_id`, which only affects UI defaults — every backend call still proves the workspace via the URL.

## Roles & permissions (RBAC)

The permission system is workspace-scoped, role-based, and additive.

### Roles

`CustomRole` (`backend/src/aexy/models/role.py:26-109`):

- `workspace_id`, `name`, `slug`
- `permissions` — JSONB list of permission slugs the role grants
- `priority` — higher = more authority (used for tie-breaking in role-comparison UI)
- `based_on_template` — one of `admin`, `manager`, `developer`, etc.; templates are the starting point new roles are cloned from
- `is_system=True` — cannot be deleted

Methods: `has_permission(slug)`, `has_any_permission([…])`, `has_all_permissions([…])`.

### The permissions catalog

`backend/src/aexy/models/permissions.py` holds the `PERMISSIONS` dict — the single source of truth for every permission slug, with category + description + which built-in templates grant it by default. New permissions must be added there.

Sample slugs: `can_invite_members`, `can_manage_roles`, `can_create_projects`, `can_view_billing`, `can_view_members`. Browse the full catalog via `GET /workspaces/{workspace_id}/roles/permissions`.

### Checking a permission in an endpoint

The canonical pattern:

```python
from aexy.services.permission_service import PermissionService

@router.delete("/{role_id}")
async def delete_role(
    workspace_id: str,
    role_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    perm = PermissionService(db)
    if not await perm.check_permission(workspace_id, str(current_user.id), "can_manage_roles"):
        raise HTTPException(status_code=403, detail="Permission denied")
    ...
```

There is **no decorator** like `@require_permission("can_X")` — every endpoint that needs an RBAC check calls `PermissionService.check_permission` explicitly. This is verbose but makes the policy auditable per-route.

### App access

`app_access.py` gates which Aexy apps a member can see in the sidebar (hiring, tracking, on-call, …). This is a coarser layer **above** permissions:

- Workspace admins assign per-member `app_permissions` (JSONB on `WorkspaceMember`)
- Built-in templates apply bulk grants (e.g. "Sales template grants CRM + GTM apps only")
- Frontend hides sidebar entries; backend should *also* check for sensitive ops

## Teams

Two routers, easy to confuse:

| Router | Scope | Notes |
|---|---|---|
| `api/teams.py` | Generic | Team-level profiling endpoints (skill coverage, bus factor) — no auth gating on workspace ownership |
| `api/workspace_teams.py` | Workspace-scoped CRUD | Routes under `/workspaces/{workspace_id}/teams`. Uses `verify_workspace_access()` helper for role checks |

`Team` model (`models/team.py:18-82`): `workspace_id`, `name`, `slug`, `type` (`manual` | `repo_based` | `auto_sync`), `source_repository_ids` JSONB for repo-based teams. `TeamMember` joins teams to developers with `role`, `source` (how they joined), `joined_at`.

## Public surfaces

Three routers explicitly allow unauthenticated access:

| Router | Path | Access mechanism |
|---|---|---|
| `public_forms.py` | `/public/forms/{form_id}` | Form has `is_public=true`; visible fields filtered to `is_visible=true` |
| `public_projects.py` | `/public/projects/{slug}` | Public via `public_slug` on the project; optional auth lets logged-in users vote/comment |
| `public_tables.py` | `/public/tables/<share_link>` | `TableShareLink` with token + optional password + permission level (`view`/`edit`); `_verify_share_link()` enforces token expiry, password hash, scope |

These are wired with `Depends(get_optional_current_developer)` or no auth dependency. Treat anything reachable via them as world-readable.

## Repository ownership: a special case

`WorkspaceRepository` (`models/repository.py:198-295`) represents workspace-to-repository adoption. The adopting developer's GitHub token drives sync, so the model also tracks `adopted_by_developer_id`. If that developer becomes inactive, the row is "reclaimable" by another workspace admin — a workspace-level resource pinned to a particular developer's OAuth grant. This is a deliberate departure from the "everything is workspace-scoped, full stop" pattern; see recent migration commits for the reclaim flow.

## Common pitfalls

- **Don't assume `current_workspace_id` on the developer is authoritative** — it's UI preference only. The URL path is the source of truth.
- **Public endpoints can accept tokens** — handle `Depends(get_optional_current_developer)` returning `None`.
- **API tokens are tied to a developer**, so revoking the user revokes their tokens. There's no separate service-account principal.
- **Microsoft tokens rotate**; the new refresh token must persist on every refresh (`OAuthTokenService._refresh_microsoft`). Don't roll your own.
- **`get_current_developer` does a DB read on every request** — prefer `get_current_developer_id` when you only need the ID.
