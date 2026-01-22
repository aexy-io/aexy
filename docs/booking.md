# Booking Module

Aexy's booking module provides calendar scheduling capabilities for teams. Users can create event types, connect calendars, and allow external users to book meetings.

## Features

- **Event Types**: Create meeting types with customizable duration, buffer time, and availability
- **Team Events**: Book meetings with entire teams or rotating hosts
- **Calendar Integration**: Sync with Google Calendar and Microsoft Outlook
- **RSVP System**: Team members can accept/decline meeting invitations
- **Public Booking Pages**: Share booking links for external scheduling

---

## Calendar Integration

### Supported Providers

| Provider | Features |
|----------|----------|
| **Google Calendar** | Read/write events, conflict detection, automatic event creation |
| **Microsoft Outlook** | Read/write events, conflict detection, automatic event creation |

### How It Works

1. User initiates calendar connection from Booking Settings
2. OAuth flow redirects to provider for authorization
3. Backend exchanges auth code for tokens
4. Calendar events are synced for availability checking
5. New bookings automatically create calendar events

---

## Google Calendar Setup

### 1. Create Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Click "Select a project" → "New Project"
3. Name it "Aexy" and click "Create"
4. Select the newly created project

### 2. Enable Google Calendar API

1. Go to **APIs & Services** → **Library**
2. Search for "Google Calendar API"
3. Click "Enable"

### 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** (or Internal for Workspace)
3. Fill in app information:
   - App name: "Aexy"
   - User support email: your email
   - Developer contact: your email
4. Click "Save and Continue"

5. Add scopes:
   ```
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/calendar.events
   ```

6. Add test users (required during development)
7. Click "Save and Continue"

### 4. Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: "Aexy Booking"
5. Add Authorized redirect URIs (backend callback URL):
   ```
   http://localhost:8000/api/v1/booking/calendars/callback/google
   ```
   For production:
   ```
   https://your-api-domain.com/api/v1/booking/calendars/callback/google
   ```
6. Click "Create"
7. Copy Client ID and Client Secret

### 5. Add to Backend Environment

```bash
# Add to backend/.env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
```

### 6. Restart Services

```bash
docker compose restart backend celery-worker
```

---

## Microsoft Calendar Setup

### 1. Register Azure AD Application

1. Go to https://portal.azure.com/
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click "New registration"
4. Fill in:
   - Name: "Aexy Booking"
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: Web - `http://localhost:8000/api/v1/booking/calendars/callback/microsoft`
   - For production: `https://your-api-domain.com/api/v1/booking/calendars/callback/microsoft`
5. Click "Register"

### 2. Configure API Permissions

1. Go to **API permissions** → "Add a permission"
2. Select "Microsoft Graph"
3. Choose "Delegated permissions"
4. Add:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
5. Click "Add permissions"

### 3. Create Client Secret

1. Go to **Certificates & secrets**
2. Click "New client secret"
3. Add description and expiration
4. Copy the secret value immediately (it won't be shown again)

### 4. Get Application ID

From the **Overview** page, copy:
- Application (client) ID

### 5. Add to Backend Environment

```bash
# Add to backend/.env
MICROSOFT_CLIENT_ID=your_application_id
MICROSOFT_CLIENT_SECRET=your_client_secret
```

### 6. Restart Services

```bash
docker compose restart backend celery-worker
```

---

## Connecting Calendars (User Flow)

### From Booking Settings

1. Navigate to **Booking** → **Calendars** in the app
2. Click "Connect Calendar"
3. Choose provider (Google or Microsoft)
4. Authorize in the provider's OAuth popup
5. Return to Aexy with calendar connected

### Calendar Settings

Once connected, configure:
- **Primary Calendar**: Which calendar to use by default
- **Sync Enabled**: Toggle calendar sync on/off
- **Check Conflicts**: Use this calendar for availability checking
- **Create Events**: Automatically create events for new bookings

---

## Team Booking

### Assignment Types

| Type | Behavior |
|------|----------|
| **Round Robin** | Rotates between team members for each booking |
| **Collective** | Books whichever team member is available |
| **All Hands** | Books entire team - all members attend the meeting |

### All Hands Meetings

When `ALL_HANDS` assignment type is used:
1. All team members are added as attendees
2. Each attendee receives an RSVP invitation
3. Attendees can accept or decline
4. Meeting status depends on attendee responses

### Custom Team Selection

Booking links support multiple team selection modes:

1. **Event Type Members**: Members assigned to the event type
   ```
   /book/{workspace}/{event-slug}
   ```

2. **Workspace Team**: All members of a specific team
   ```
   /book/{workspace}/{event-slug}/team/{team-slug}
   ```

3. **Custom Members**: Specific user IDs via query params
   ```
   /book/{workspace}/{event-slug}/team/{team-slug}?members=id1,id2,id3
   ```

---

## RSVP System

### How It Works

1. When a booking is created with multiple attendees (ALL_HANDS mode):
   - Each attendee gets a unique `response_token`
   - Notification sent with RSVP link

2. Attendee clicks RSVP link:
   - Views booking details
   - Can accept or decline

3. Status updates:
   - `pending` - No response yet
   - `confirmed` - Attendee accepted
   - `declined` - Attendee declined

### RSVP Page

Public RSVP page at `/rsvp/{token}` shows:
- Event details (name, date, time, duration)
- Organizer information
- Invitee details
- Accept/Decline buttons

---

## Team Calendar View

The Team Calendar (`/booking/team-calendar`) provides a visual overview of team availability:

### Features

- **Week View**: Navigate between weeks
- **Member Availability**: See each team member's available/busy times
- **Overlapping Slots**: Highlighted times when all members are free
- **Existing Bookings**: View scheduled meetings
- **Quick Book**: Click slots to initiate booking

### Filtering Options

- Select specific team event type
- Filter by workspace team
- View all assigned members

---

## Public Booking URLs

### URL Patterns

| Pattern | Description |
|---------|-------------|
| `/book/{workspace}` | Workspace landing - lists all event types |
| `/book/{workspace}/{event}` | Book specific event type |
| `/book/{workspace}/{event}/team/{team}` | Book with specific team |

### Examples

```
# Workspace landing page
https://app.aexy.io/book/acme-corp

# Standard booking
https://app.aexy.io/book/acme-corp/30-min-meeting

# Team-specific booking
https://app.aexy.io/book/acme-corp/team-consultation/team/engineering

# Custom team members
https://app.aexy.io/book/acme-corp/team-consultation/team/engineering?members=user1,user2
```

---

## API Endpoints

### Calendar Connections

```
GET  /workspaces/{id}/booking/calendars                    # List connected calendars
GET  /workspaces/{id}/booking/calendars/connect/{provider} # Get OAuth URL
POST /workspaces/{id}/booking/calendars/connect/google     # Exchange Google auth code
POST /workspaces/{id}/booking/calendars/connect/microsoft  # Exchange Microsoft auth code
GET  /workspaces/{id}/booking/calendars/{calendar_id}      # Get calendar details
PATCH /workspaces/{id}/booking/calendars/{calendar_id}     # Update calendar settings
DELETE /workspaces/{id}/booking/calendars/{calendar_id}    # Disconnect calendar
POST /workspaces/{id}/booking/calendars/{calendar_id}/sync # Force sync
```

### Event Types

```
GET  /workspaces/{id}/booking/event-types                  # List event types
POST /workspaces/{id}/booking/event-types                  # Create event type
GET  /workspaces/{id}/booking/event-types/{event_id}       # Get event type
PATCH /workspaces/{id}/booking/event-types/{event_id}      # Update event type
DELETE /workspaces/{id}/booking/event-types/{event_id}     # Delete event type
```

### Bookings

```
GET  /workspaces/{id}/booking/bookings                     # List bookings
GET  /workspaces/{id}/booking/bookings/{booking_id}        # Get booking details
PATCH /workspaces/{id}/booking/bookings/{booking_id}       # Update booking
DELETE /workspaces/{id}/booking/bookings/{booking_id}      # Cancel booking
```

### Team Availability

```
GET /workspaces/{id}/booking/availability/team/{event_type_id}  # Team availability
GET /workspaces/{id}/booking/availability/team-calendar         # Team calendar data
```

### RSVP

```
GET  /booking/rsvp/{token}          # Get booking details for RSVP
POST /booking/rsvp/{token}/respond  # Submit RSVP response (accept/decline)
```

### Public Booking

```
GET  /public/book/{workspace}                              # List public event types
GET  /public/book/{workspace}/{event}/slots                # Get available slots
POST /public/book/{workspace}/{event}/book                 # Create booking
GET  /public/book/{workspace}/team/{team_id}               # Get team info
GET  /public/book/{workspace}/teams                        # List workspace teams
```

---

## Database Tables

### booking_event_types

Stores event type configurations.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces |
| owner_id | UUID | FK to developers |
| name | VARCHAR | Event type name |
| slug | VARCHAR | URL-friendly identifier |
| description | TEXT | Event description |
| duration_minutes | INTEGER | Meeting duration |
| buffer_before | INTEGER | Buffer time before meeting |
| buffer_after | INTEGER | Buffer time after meeting |
| is_team_event | BOOLEAN | Team event flag |
| team_id | UUID | Optional FK to teams |
| is_active | BOOLEAN | Published status |

### calendar_connections

Stores OAuth tokens for calendar providers.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to developers |
| workspace_id | UUID | FK to workspaces |
| provider | VARCHAR | google/microsoft |
| calendar_id | VARCHAR | Provider's calendar ID |
| calendar_name | VARCHAR | Display name |
| account_email | VARCHAR | Connected account email |
| access_token | TEXT | Encrypted access token |
| refresh_token | TEXT | Encrypted refresh token |
| token_expires_at | TIMESTAMP | Token expiration |
| is_primary | BOOLEAN | Primary calendar flag |
| sync_enabled | BOOLEAN | Sync toggle |
| check_conflicts | BOOLEAN | Use for availability |
| create_events | BOOLEAN | Auto-create events |

### bookings

Stores booking records.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces |
| event_type_id | UUID | FK to event types |
| host_id | UUID | Primary host (FK to developers) |
| invitee_name | VARCHAR | Booker's name |
| invitee_email | VARCHAR | Booker's email |
| start_time | TIMESTAMP | Meeting start |
| end_time | TIMESTAMP | Meeting end |
| timezone | VARCHAR | Booking timezone |
| status | VARCHAR | confirmed/cancelled/pending |
| notes | TEXT | Additional notes |
| meeting_url | VARCHAR | Video conference link |

### booking_attendees

Stores team meeting attendees with RSVP status.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| booking_id | UUID | FK to bookings |
| user_id | UUID | FK to developers |
| status | VARCHAR | pending/confirmed/declined |
| response_token | VARCHAR | Unique RSVP token |
| responded_at | TIMESTAMP | Response timestamp |

---

## Troubleshooting

### "Method Not Allowed" on Calendar Connect

Ensure you're using the correct HTTP method:
- `GET /calendars/connect/{provider}` - Returns OAuth URL
- `POST /calendars/connect/{provider}` - Exchanges auth code

### "redirect_uri_mismatch" Error

The redirect URI in Google/Microsoft console must exactly match the backend callback URL:

For Google:
```
http://localhost:8000/api/v1/booking/calendars/callback/google
https://your-api-domain.com/api/v1/booking/calendars/callback/google
```

For Microsoft:
```
http://localhost:8000/api/v1/booking/calendars/callback/microsoft
https://your-api-domain.com/api/v1/booking/calendars/callback/microsoft
```

### Calendar Not Syncing

1. Check calendar connection status in settings
2. Verify token hasn't expired
3. Check Celery worker is running:
   ```bash
   docker compose logs celery-worker
   ```

### Team Availability Not Showing

1. Ensure team members have connected calendars
2. Verify "Check Conflicts" is enabled for their calendars
3. Check team members are assigned to the event type

### RSVP Token Invalid

Tokens are single-use and expire after response. Users who need to change their response should contact the organizer.

---

## Frontend Pages

| Path | Description |
|------|-------------|
| `/booking` | Booking dashboard |
| `/booking/event-types` | Manage event types |
| `/booking/bookings` | View all bookings |
| `/booking/calendars` | Calendar connections |
| `/booking/calendars/callback` | OAuth callback handler |
| `/booking/team-calendar` | Team availability view |
| `/book/{workspace}` | Public workspace landing |
| `/book/{workspace}/{event}` | Public booking page |
| `/rsvp/{token}` | Public RSVP page |

---

## File Structure

```
frontend/src/
├── app/
│   ├── (app)/booking/
│   │   ├── page.tsx                    # Booking dashboard
│   │   ├── event-types/page.tsx        # Event types list
│   │   ├── bookings/page.tsx           # Bookings list
│   │   ├── calendars/
│   │   │   ├── page.tsx                # Calendar settings
│   │   │   └── callback/page.tsx       # OAuth callback
│   │   └── team-calendar/page.tsx      # Team calendar view
│   └── public/
│       ├── book/
│       │   ├── [workspaceSlug]/
│       │   │   ├── page.tsx            # Workspace landing
│       │   │   └── [eventSlug]/
│       │   │       ├── page.tsx        # Public booking
│       │   │       └── team/
│       │   │           └── [teamId]/page.tsx  # Team booking
│       └── rsvp/
│           └── [token]/page.tsx        # RSVP response page
├── components/booking/
│   ├── EventTypeCard.tsx               # Event type display
│   ├── BookingCard.tsx                 # Booking display
│   └── TeamCalendarView.tsx            # Team calendar component
└── lib/
    └── booking-api.ts                  # Booking API client

backend/src/aexy/
├── models/booking/
│   ├── event_type.py                   # EventType model
│   ├── booking.py                      # Booking model
│   ├── booking_attendee.py             # BookingAttendee model
│   ├── calendar_connection.py          # CalendarConnection model
│   └── team_event_member.py            # TeamEventMember model
├── services/booking/
│   ├── booking_service.py              # Booking logic
│   ├── availability_service.py         # Availability calculation
│   ├── calendar_sync_service.py        # Calendar sync
│   └── notification_service.py         # Email notifications
├── api/booking/
│   ├── event_types.py                  # Event type endpoints
│   ├── bookings.py                     # Booking endpoints
│   ├── calendars.py                    # Calendar endpoints
│   ├── availability.py                 # Availability endpoints
│   ├── rsvp.py                         # RSVP endpoints
│   └── public.py                       # Public booking endpoints
└── schemas/booking/
    ├── event_type.py                   # Event type schemas
    ├── booking.py                      # Booking schemas
    ├── calendar.py                     # Calendar schemas
    └── team_availability.py            # Team availability schemas
```
