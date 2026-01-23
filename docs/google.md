# How to Connect Google to Aexy

## 1. Create a Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Click "Select a project" → "New Project"
3. Name it "Aexy" and click "Create"
4. Select the newly created project

## 2. Enable Required APIs

1. Go to **APIs & Services** → **Library**
2. Enable the following APIs:
   - **Gmail API** - For email sync
   - **Google Calendar API** - For calendar sync
   - **Google People API** - For contact info (optional)

## 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** (or Internal for Workspace)
3. Fill in the app information:
   - App name: "Aexy"
   - User support email: your email
   - Developer contact: your email
4. Click "Save and Continue"

5. Add scopes on the Scopes page:

   **Gmail Scopes:**
   ```
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.modify
   ```

   **Calendar Scopes:**
   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/calendar.events
   ```

   **Profile Scopes:**
   ```
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   ```

6. Add test users (required during development)
7. Click "Save and Continue"

## 4. Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: "Aexy Web Client"
5. Add Authorized redirect URIs:
   ```
   # CRM Google Integration
   http://localhost:8000/api/v1/workspaces/{workspace_id}/integrations/google/callback
   http://localhost:8000/api/v1/auth/google/callback

   # Booking Calendar Integration
   http://localhost:8000/api/v1/booking/calendars/callback/google
   ```
   For production:
   ```
   https://your-domain.com/api/v1/workspaces/{workspace_id}/integrations/google/callback
   https://your-domain.com/api/v1/auth/google/callback
   https://your-domain.com/api/v1/booking/calendars/callback/google
   ```
6. Click "Create"
7. Download the JSON credentials file

## 5. Get Your Credentials

From the OAuth 2.0 Client ID you created:
- Client ID (ends with `.apps.googleusercontent.com`)
- Client Secret

## 6. Add to Backend .env

```bash
# Add to backend/.env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

# For production
# GOOGLE_REDIRECT_URI=https://your-domain.com/api/v1/auth/google/callback
```

## 7. Restart Backend

```bash
docker compose restart backend celery-worker
```

## 8. Connect from CRM

### Option A: During Onboarding
1. Go through CRM onboarding flow
2. At the "Connect" step, click "Connect with Google"
3. Authorize Gmail and Calendar access
4. Continue with onboarding

### Option B: From Settings
1. Go to **CRM → Settings → Integrations**
2. Click "Connect Google Account"
3. Authorize Gmail and Calendar access
4. Enable sync options

---

# Token Management & Refresh

## How Tokens Work

Google uses OAuth 2.0 with token expiration:

1. **Access Token**: Used to make API calls (expires in 1 hour)
2. **Refresh Token**: Used to get new access tokens (long-lived)
3. **ID Token**: Contains user identity info (for sign-in)

## Token Refresh

The backend automatically refreshes tokens:
- Tokens are refreshed 5 minutes before expiry
- If refresh fails, user needs to re-authorize
- Refresh tokens can be revoked by Google if unused for 6 months

## Updating Scopes (Re-authorization Required)

If you need additional scopes:

1. Add scopes in Google Cloud Console
2. Users must re-authorize to grant new permissions
3. Direct them to the connect URL:
   ```
   /crm/settings/integrations
   ```

## Checking Token Status

```bash
# Test if token is valid
curl -X GET "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=YOUR_ACCESS_TOKEN"
```

---

# Gmail Sync

## How Sync Works

1. **Initial Full Sync**: Fetches last N emails (configurable, default 1000)
2. **Incremental Sync**: Uses Gmail History API to fetch only new/changed emails
3. **Periodic Sync**: Celery task runs every 15 minutes

## Synced Data

For each email, we store:
- Gmail ID and Thread ID
- Subject and snippet
- From/To addresses
- Body text (plain text version)
- Labels (Inbox, Sent, etc.)
- Date received
- Read status

## Email to Record Linking

Emails are automatically linked to CRM records by:
1. Matching `from_email` to Person records
2. Matching email domain to Company records
3. Manual linking via UI

## Privacy Controls

Users can configure:
- Which labels to sync (Inbox, Sent, All)
- Auto-create contacts from emails
- AI enrichment from signatures

---

# Calendar Sync

## How Sync Works

1. **Initial Sync**: Fetches events from selected calendars
2. **Incremental Sync**: Uses sync tokens to fetch only changes
3. **Periodic Sync**: Celery task runs every 30 minutes

## Synced Data

For each event, we store:
- Google Event ID and Calendar ID
- Title and description
- Start/end time
- Location (including meeting links)
- Attendees list
- Organizer
- Status (confirmed, tentative, cancelled)

## Event to Record Linking

Events are linked to CRM records by:
1. Matching attendee emails to Person records
2. Manual linking via UI
3. Creating CRM activities from meetings

## Calendar Selection

Users can choose which calendars to sync:
- Primary calendar (default)
- Additional calendars they have access to
- Shared team calendars

---

# AI Contact Enrichment

## How It Works

1. **Signature Extraction**: AI parses email signatures for contact info
2. **Contact Classification**: AI classifies contacts as lead, customer, vendor, etc.
3. **Company Detection**: Extracts company info from email domain and signatures

## Extracted Data

From email signatures, we extract:
- Full name
- Job title
- Company name
- Phone numbers
- LinkedIn URL
- Physical address

## Running Enrichment

Enrichment runs automatically:
- After email sync
- Can be triggered manually from settings

```bash
# Manual trigger via API
curl -X POST http://localhost:8000/api/v1/workspaces/{workspace_id}/integrations/google/enrich \
  -H "Authorization: Bearer YOUR_JWT"
```

---

# API Endpoints

## Connection

```
GET  /workspaces/{workspace_id}/integrations/google/connect    # Get OAuth URL
GET  /workspaces/{workspace_id}/integrations/google/callback   # OAuth callback
GET  /workspaces/{workspace_id}/integrations/google/status     # Connection status
PATCH /workspaces/{workspace_id}/integrations/google/settings  # Update settings
POST /workspaces/{workspace_id}/integrations/google/disconnect # Disconnect
```

## Gmail

```
POST /workspaces/{workspace_id}/integrations/google/gmail/sync          # Trigger sync
GET  /workspaces/{workspace_id}/integrations/google/gmail/emails        # List emails
GET  /workspaces/{workspace_id}/integrations/google/gmail/emails/{id}   # Get email
POST /workspaces/{workspace_id}/integrations/google/gmail/send          # Send email
POST /workspaces/{workspace_id}/integrations/google/gmail/emails/{id}/link  # Link to record
```

## Calendar

```
GET  /workspaces/{workspace_id}/integrations/google/calendar/calendars  # List calendars
POST /workspaces/{workspace_id}/integrations/google/calendar/sync       # Trigger sync
GET  /workspaces/{workspace_id}/integrations/google/calendar/events     # List events
GET  /workspaces/{workspace_id}/integrations/google/calendar/events/{id} # Get event
POST /workspaces/{workspace_id}/integrations/google/calendar/events     # Create event
POST /workspaces/{workspace_id}/integrations/google/calendar/events/{id}/link # Link to record
```

## Enrichment

```
POST /workspaces/{workspace_id}/integrations/google/enrich              # Run enrichment
POST /workspaces/{workspace_id}/integrations/google/records/{id}/enrich # Enrich record
```

---

# Troubleshooting

## "access_denied" Error

1. User denied consent - they need to authorize again
2. App not verified - add user as test user in console
3. Scopes not approved - check consent screen configuration

## "invalid_grant" Error

Refresh token is invalid. Possible causes:
1. User revoked access
2. Token expired (6 months of inactivity)
3. Too many refresh tokens (limit of 50 per user)

Solution: User must re-authorize the app.

## "insufficient_permission" Error

Token doesn't have required scopes:
1. Check granted scopes in `google_integrations` table
2. User needs to re-authorize with additional scopes

## Emails Not Syncing

1. Check Gmail sync is enabled in settings
2. Verify token is valid
3. Check Celery worker is running:
   ```bash
   docker compose logs celery-worker
   ```

## Calendar Events Missing

1. Verify calendar sync is enabled
2. Check which calendars are selected for sync
3. Verify sync token is valid

## Rate Limits

Google API quotas:
- Gmail: 250 quota units/second (varies by operation)
- Calendar: 1,000,000 queries/day

If hitting limits:
- Implement exponential backoff
- Reduce sync frequency
- Use batch requests

## Testing the Integration

```bash
# Check connection status
curl http://localhost:8000/api/v1/workspaces/{workspace_id}/integrations/google/status \
  -H "Authorization: Bearer YOUR_JWT"

# Trigger manual sync
curl -X POST http://localhost:8000/api/v1/workspaces/{workspace_id}/integrations/google/gmail/sync \
  -H "Authorization: Bearer YOUR_JWT"

# List synced emails
curl http://localhost:8000/api/v1/workspaces/{workspace_id}/integrations/google/gmail/emails \
  -H "Authorization: Bearer YOUR_JWT"
```

---

# Database Tables

## google_integrations

Stores OAuth tokens and sync settings per workspace.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces |
| google_email | VARCHAR | Connected Google account |
| access_token | TEXT | Encrypted access token |
| refresh_token | TEXT | Encrypted refresh token |
| token_expiry | TIMESTAMP | Token expiration time |
| granted_scopes | JSONB | List of authorized scopes |
| gmail_sync_enabled | BOOLEAN | Gmail sync toggle |
| calendar_sync_enabled | BOOLEAN | Calendar sync toggle |
| gmail_history_id | VARCHAR | For incremental Gmail sync |
| calendar_sync_token | TEXT | For incremental calendar sync |

## synced_emails

Stores synced Gmail messages.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces |
| gmail_id | VARCHAR | Gmail message ID |
| gmail_thread_id | VARCHAR | Gmail thread ID |
| subject | TEXT | Email subject |
| from_email | VARCHAR | Sender email |
| from_name | VARCHAR | Sender name |
| to_emails | JSONB | Recipients |
| snippet | TEXT | Email preview |
| body_text | TEXT | Plain text body |
| labels | JSONB | Gmail labels |
| is_read | BOOLEAN | Read status |
| gmail_date | TIMESTAMP | Original email date |

## synced_calendar_events

Stores synced Google Calendar events.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces |
| google_event_id | VARCHAR | Google event ID |
| google_calendar_id | VARCHAR | Calendar ID |
| title | TEXT | Event title |
| description | TEXT | Event description |
| location | TEXT | Location/meeting link |
| start_time | TIMESTAMP | Event start |
| end_time | TIMESTAMP | Event end |
| is_all_day | BOOLEAN | All-day flag |
| attendees | JSONB | List of attendees |
| organizer_email | VARCHAR | Organizer email |
| status | VARCHAR | confirmed/tentative/cancelled |

---

# Frontend Components

## CRM Homepage (`/crm`)

The CRM homepage displays:
- **Google Integration Banner**: Shows connection status, prompts to connect if not connected
- **Quick Access Cards**: Links to Inbox, Calendar, Activities, and Integrations
- **Standard Objects**: Companies, People, Deals
- **Custom Objects**: User-created object types

## Inbox Page (`/crm/inbox`)

Email inbox view for synced Gmail messages:

**Features:**
- Email list with unread indicators
- Email detail panel with full content
- Reply functionality (sends via Gmail API)
- Link email to CRM record action
- Search and filter emails
- Manual sync trigger

**Components:**
- `EmailListItem`: Displays email preview in list
- `EmailDetail`: Full email view with actions
- `LinkToRecordModal`: Modal to link email to Person/Company

## Calendar Page (`/crm/calendar`)

Calendar view for synced Google Calendar events:

**Features:**
- Month view with event cards
- Day view for detailed event list
- Event detail modal
- Navigation (today, prev/next month)
- View mode toggle (month/week/day)
- Manual sync trigger

**Components:**
- `MonthView`: Calendar grid with events
- `DayView`: List of events for selected day
- `EventCard`: Event display (compact and full)
- `EventDetailModal`: Full event details

## Integration Settings (`/crm/settings/integrations`)

Settings page for managing Google integration:

**Features:**
- Connection status display
- Gmail sync enable/disable and manual sync
- Calendar sync enable/disable and manual sync
- AI enrichment trigger
- Disconnect functionality

## Onboarding Connect Step (`/crm/onboarding/connect`)

Step in CRM onboarding flow for Google connection:

**Features:**
- Benefits explanation (email sync, calendar, AI enrichment)
- Privacy settings toggles
- "Connect with Google" OAuth button
- Skip option (connect later in settings)

---

# React Hooks

## `useGoogleIntegrationStatus(workspaceId)`

Returns Google integration connection status.

```typescript
const { status, isLoading, error, refresh } = useGoogleIntegrationStatus(workspaceId);
// status: { is_connected, gmail_sync_enabled, calendar_sync_enabled, google_email, ... }
```

## `useGoogleIntegrationConnect(workspaceId)`

Handles OAuth connect/disconnect flow.

```typescript
const { connect, disconnect, isConnecting, isDisconnecting } = useGoogleIntegrationConnect(workspaceId);
// connect(["gmail", "calendar"]) - redirects to Google OAuth
// disconnect() - removes integration
```

## `useGoogleEmails(workspaceId)`

Manages synced emails.

```typescript
const { emails, isLoading, isSyncing, error, refresh, sync, getEmail, sendEmail, linkToRecord } = useGoogleEmails(workspaceId);
```

## `useGoogleCalendarEvents(workspaceId)`

Manages synced calendar events.

```typescript
const { events, calendars, isLoading, isSyncing, error, refresh, sync, getEvent, createEvent, linkToRecord } = useGoogleCalendarEvents(workspaceId);
```

---

# File Structure

```
frontend/src/
├── app/crm/
│   ├── page.tsx                    # CRM homepage with Google banner
│   ├── inbox/
│   │   └── page.tsx                # Email inbox view
│   ├── calendar/
│   │   └── page.tsx                # Calendar view
│   ├── settings/
│   │   └── integrations/
│   │       └── page.tsx            # Integration settings
│   └── onboarding/
│       └── connect/
│           └── page.tsx            # Google connect onboarding step
├── hooks/
│   └── useGoogleIntegration.ts     # Google integration hooks
└── lib/
    └── api.ts                      # googleIntegrationApi methods

backend/src/aexy/
├── models/
│   └── google_integration.py       # GoogleIntegration, SyncedEmail, SyncedCalendarEvent
├── services/
│   ├── google_auth_service.py      # OAuth token management
│   ├── gmail_sync_service.py       # Gmail sync logic
│   ├── calendar_sync_service.py    # Calendar sync logic
│   └── contact_enrichment_service.py # AI contact extraction
├── api/
│   └── google_integration.py       # API routes
├── schemas/
│   └── google_integration.py       # Pydantic schemas
└── processing/
    └── google_sync_tasks.py        # Celery background tasks
```
