# How to Connect Microsoft to Aexy

Aexy uses a **single Azure App Registration** for three things:

1. **Sign-in with Microsoft** — `/api/v1/auth/microsoft/login`
2. **CRM mail + calendar** (Outlook/Exchange via Microsoft Graph) — `/api/v1/auth/microsoft/connect-crm`
3. **Booking calendar provider** — `/api/v1/booking/calendars/callback/microsoft`

All three flows share `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID`. Only the redirect URIs differ.

> Aexy uses **Microsoft Graph** (`https://graph.microsoft.com/v1.0`) and the **v2 OAuth endpoint** (`https://login.microsoftonline.com/{tenant}/oauth2/v2.0`). The legacy **Azure AD Graph** (`graph.windows.net`) is deprecated and is **not** used anywhere in the codebase — no migration is required.

## 1. Register an Azure AD Application

1. Go to https://portal.azure.com/
2. Navigate to **Microsoft Entra ID** (formerly Azure Active Directory) → **App registrations**
3. Click **New registration**
4. Fill in:
   - **Name**: `Aexy`
   - **Supported account types**:
     - For multi-tenant + personal accounts (default, recommended) → "Accounts in any organizational directory and personal Microsoft accounts"
     - For a single org → "Accounts in this organizational directory only"
   - **Redirect URI**: leave blank for now — we'll add both URIs in the next step
5. Click **Register**
6. From the **Overview** page, copy the **Application (client) ID** and **Directory (tenant) ID**

## 2. Add Redirect URIs

In the app you just created, go to **Authentication** → **Add a platform** → **Web**, and add **both** of these redirect URIs:

**For local development:**
```
http://localhost:8000/api/v1/auth/microsoft/callback
http://localhost:8000/api/v1/booking/calendars/callback/microsoft
```

**For production:**
```
https://server.aexy.io/api/v1/auth/microsoft/callback
https://server.aexy.io/api/v1/booking/calendars/callback/microsoft
```

Replace `server.aexy.io` with your own `BACKEND_URL`.

Both URIs must be registered — the first is used by sign-in and CRM, the second by the booking module. If you only register one, the other flow will fail with `AADSTS50011: The redirect URI ... does not match`.

Leave **Access tokens** and **ID tokens** unchecked under "Implicit grant" — Aexy uses the authorization-code flow.

## 3. Configure API Permissions

Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**, and add:

**Required for sign-in:**
```
openid
profile
email
User.Read
offline_access
```

**Additional, required if users will connect CRM (Outlook mail + calendar):**
```
Mail.Read
Mail.Send
Calendars.ReadWrite
```

**For booking-only deployments**, `Calendars.ReadWrite`, `User.Read`, and `offline_access` are sufficient — the broader CRM scopes are only requested when a user clicks "Connect CRM."

Click **Add permissions**. If your tenant requires admin consent, click **Grant admin consent for &lt;tenant&gt;** so end-users aren't prompted individually.

## 4. Create a Client Secret

1. Go to **Certificates & secrets** → **Client secrets** → **New client secret**
2. Add a description (e.g. `aexy-prod`) and an expiration (12 or 24 months)
3. **Copy the secret Value immediately** — it is only displayed once. Do not copy the Secret ID.

## 5. Choose a Tenant ID

`MICROSOFT_TENANT_ID` controls which Microsoft accounts can authenticate. Set it to one of:

| Value | Allows |
|---|---|
| `common` *(default)* | Any Microsoft Entra ID account **and** personal Microsoft accounts |
| `organizations` | Any work/school account (no personal accounts) |
| `consumers` | Personal Microsoft accounts only |
| `<tenant-guid>` | Only accounts in that specific tenant |

Must match the "Supported account types" you chose in step 1.

All three flows (sign-in, CRM, booking) build their authorize and token URLs from `MICROSOFT_TENANT_ID`, so this single setting controls who can authenticate.

## 6. Add to Backend Environment

```bash
# backend/.env (local development)
MICROSOFT_CLIENT_ID=your_application_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret_value
MICROSOFT_TENANT_ID=common
MICROSOFT_AUTH_REDIRECT_URI=http://localhost:8000/api/v1/auth/microsoft/callback
MICROSOFT_REDIRECT_URI=http://localhost:8000/api/v1/booking/calendars/callback/microsoft
```

For production (see `.env.prod.example`):

```bash
MICROSOFT_AUTH_REDIRECT_URI=https://server.aexy.io/api/v1/auth/microsoft/callback
MICROSOFT_REDIRECT_URI=https://server.aexy.io/api/v1/booking/calendars/callback/microsoft
```

`MICROSOFT_AUTH_REDIRECT_URI` is used by sign-in + CRM. `MICROSOFT_REDIRECT_URI` is used by the booking calendar flow. Both values must match URIs registered in step 2 exactly (scheme, host, port, path).

## 7. Restart the Backend

```bash
docker compose restart backend
```

If you run the Temporal worker out-of-process, restart it too so it picks up the new env vars.

## 8. Connect from the App

**Sign in with Microsoft:** click "Sign in with Microsoft" on the login page. Backend route: `GET /api/v1/auth/microsoft/login`.

**Connect CRM (Outlook mail + calendar):** in the CRM, choose "Connect Microsoft." Backend route: `GET /api/v1/auth/microsoft/connect-crm` — requests the additional `Mail.Read`, `Mail.Send`, and `Calendars.ReadWrite` scopes.

**Booking calendar:** in **Booking → Settings → Calendars**, click "Connect Microsoft." Backend route: `POST /api/v1/workspaces/{workspace_id}/booking/calendars/connect/microsoft`.

---

# OAuth Endpoints

The backend constructs Microsoft auth URLs against:

```
https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize
https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}/oauth2/v2.0/token
```

## Auth / Sign-in

```
GET  /api/v1/auth/microsoft/login          # Initiates sign-in (basic profile scopes)
GET  /api/v1/auth/microsoft/connect-crm    # Initiates CRM connect (+ Mail/Calendar)
GET  /api/v1/auth/microsoft/callback       # OAuth callback — exchanges code, fetches /me
```

The callback creates or updates a `MicrosoftConnection` row and issues an Aexy JWT.

## Booking Calendar

```
POST /api/v1/workspaces/{workspace_id}/booking/calendars/connect/microsoft  # Get OAuth URL
GET  /api/v1/booking/calendars/callback/microsoft                           # OAuth callback
```

The booking callback persists tokens into `calendar_connections` (`provider = 'microsoft'`).

---

# Token Management & Refresh

Microsoft access tokens are short-lived (typically ~1 hour). Aexy refreshes them automatically before each Graph API call when the stored `token_expires_at` is within the refresh window.

**Important behavior:** Microsoft **rotates refresh tokens** on every refresh — the response contains a new refresh token that replaces the old one. Aexy persists the new refresh token immediately. If the rotated token isn't saved (e.g. crash mid-flight), the next refresh will fail with `invalid_grant` and the user must re-authorize.

Refresh-token lifetime is governed by your tenant's conditional access / refresh-token policies. With default settings:

- A refresh token stays valid as long as it's used at least once every 90 days
- Tokens are revoked when the user changes their password or admin revokes sessions
- An `invalid_grant` response marks the connection as revoked; the UI prompts a reconnect

There is no periodic sync job — Microsoft calendars are read on demand (during booking availability checks) and written on demand (when a booking is confirmed). Outlook mail sync is event-driven from the CRM module.

---

# Database Tables

## `microsoft_connections`

One row per developer who has signed in with or connected Microsoft.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| developer_id | UUID | FK to `developers` (one-to-one) |
| microsoft_id | VARCHAR | Microsoft user object ID |
| microsoft_email | VARCHAR | Connected Microsoft account email |
| microsoft_name | VARCHAR | Display name from Graph `/me` |
| avatar_url | VARCHAR | Profile photo URL (if any) |
| access_token | TEXT | Encrypted access token |
| refresh_token | TEXT | Encrypted refresh token (rotated on every refresh) |
| token_expires_at | TIMESTAMP | Access token expiry |
| scopes | JSONB | Granted Graph scopes |

## `calendar_connections` (booking only)

Stores per-calendar OAuth credentials. Used by both Google and Microsoft.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| provider | VARCHAR | `google` or `microsoft` |
| calendar_id | VARCHAR | Provider calendar ID |
| calendar_name | VARCHAR | Display name |
| account_email | VARCHAR | Connected account email |
| access_token | TEXT | Encrypted access token |
| refresh_token | TEXT | Encrypted refresh token |
| token_expires_at | TIMESTAMP | Access token expiry |
| sync_token | TEXT | Incremental sync cursor (Graph deltaLink) |
| sync_enabled | BOOLEAN | Pull busy times from this calendar |
| create_events | BOOLEAN | Write bookings to this calendar |
| check_conflicts | BOOLEAN | Block on overlaps |

---

# Troubleshooting

### `AADSTS50011: The redirect URI specified in the request does not match`

The redirect URI in the request (driven by `MICROSOFT_AUTH_REDIRECT_URI` or `MICROSOFT_REDIRECT_URI`) is not registered on the Azure app. Match it character-for-character in **Authentication → Redirect URIs**, including scheme (http/https), host, port, and trailing path. Localhost URIs are allowed by Azure without TLS; everything else must be HTTPS.

### `AADSTS65001: The user or administrator has not consented`

A scope was requested that isn't granted. Either:
- Click **Grant admin consent** in **API permissions**, or
- Sign in fresh so the user gets prompted to consent

This is the usual cause when `Mail.Send` or `Calendars.ReadWrite` is added after the user has already connected.

### `AADSTS700016: Application not found in the directory`

`MICROSOFT_CLIENT_ID` is wrong, or `MICROSOFT_TENANT_ID` points to a tenant where the app isn't registered. Verify both against the Azure overview page.

### `invalid_grant` on refresh

Refresh token was revoked or rotated and the new value wasn't persisted. The connection is marked revoked — user must reconnect from the UI.

### Sign-in succeeds but CRM doesn't get mail/calendar access

The user signed in via `/auth/microsoft/login` (basic scopes only). Have them click "Connect CRM" — this triggers `/auth/microsoft/connect-crm` which requests `Mail.Read`, `Mail.Send`, and `Calendars.ReadWrite`.

### Personal Microsoft account can't sign in

`MICROSOFT_TENANT_ID` is set to `organizations` or a specific tenant GUID. Switch to `common` (or `consumers`) and ensure the Azure app's "Supported account types" allows personal accounts.

### Testing the auth URL manually

```bash
# Should redirect to login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize?...
curl -i http://localhost:8000/api/v1/auth/microsoft/login
```

---

# Related Docs

- [Booking](./booking.md) — calendar provider setup specific to booking
- [Google integration](./google.md) — equivalent setup for Google Workspace
