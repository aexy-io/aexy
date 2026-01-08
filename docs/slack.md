# How to Connect Slack to Aexy

## 1. Create a Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name it "Aexy" and select your workspace
4. Click "Create App"

## 2. Configure OAuth & Permissions

1. Go to **OAuth & Permissions** in the sidebar
2. Under **Redirect URLs**, add:
   ```
   http://localhost:8000/api/v1/slack/callback
   ```
   For production:
   ```
   https://your-domain.com/api/v1/slack/callback
   ```

3. Under **Bot Token Scopes**, add these scopes:

   **Basic Scopes:**
   - `channels:history` - Read channel messages
   - `channels:read` - List channels
   - `chat:write` - Send messages
   - `commands` - Slash commands
   - `users:read` - Read user info
   - `users:read.email` - Read user emails (for auto-mapping)

   **Additional Scopes for Escalation Notifications:**
   - `chat:write.public` - Send messages to channels without joining
   - `groups:read` - List private channels
   - `groups:write` - Post to private channels
   - `im:write` - Send direct messages to users
   - `mpim:write` - Send messages to group DMs

4. Under **User Token Scopes** (optional, for user-level actions):
   - `channels:read`
   - `users:read`

## 3. Set Up Slash Commands

1. Go to **Slash Commands** in the sidebar
2. Click "Create New Command":
   - Command: `/aexy`
   - Request URL: `http://localhost:8000/api/v1/slack/commands`
   - Description: "Aexy tracking commands"

## 4. Enable Events

1. Go to **Event Subscriptions**
2. Turn on "Enable Events"
3. Request URL: `http://localhost:8000/api/v1/slack/events`
4. Subscribe to **bot events**:
   - `message.channels`
   - `message.groups`
   - `app_mention` - When bot is @mentioned
   - `member_joined_channel` - Track channel membership

## 5. Enable Interactivity (for Buttons/Actions)

1. Go to **Interactivity & Shortcuts**
2. Turn on "Interactivity"
3. Request URL: `http://localhost:8000/api/v1/slack/interactions`

## 6. Get Your Credentials

1. Go to **Basic Information**
2. Copy these values:
   - Client ID
   - Client Secret
   - Signing Secret

## 7. Add to Backend .env

```bash
# Add to backend/.env
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_SIGNING_SECRET=your_signing_secret
SLACK_REDIRECT_URI=http://localhost:8000/api/v1/slack/callback

# For production
# SLACK_REDIRECT_URI=https://your-domain.com/api/v1/slack/callback
```

## 8. Restart Backend

```bash
docker compose restart backend celery-worker
```

## 9. Install to Workspace

Navigate to:
```
http://localhost:8000/api/v1/slack/install?organization_id=YOUR_WORKSPACE_ID&installer_id=YOUR_USER_ID
```

---

# Token Management & Refresh

## How Tokens Work

Slack uses OAuth 2.0 with bot tokens that **do not expire** by default. However, if you enable token rotation:

1. **Access Token**: Used to make API calls (expires if rotation enabled)
2. **Refresh Token**: Used to get new access tokens
3. **Bot Token**: The primary token for bot actions (`xoxb-...`)

## Updating Scopes (Re-authorization Required)

If you add new scopes to your Slack app, existing installations need to re-authorize:

1. Update scopes in Slack App settings (OAuth & Permissions)
2. Users must reinstall the app to grant new permissions
3. Direct them to the install URL:
   ```
   http://localhost:8000/api/v1/slack/install?organization_id=WORKSPACE_ID&installer_id=USER_ID
   ```

## Token Rotation (Optional but Recommended)

To enable automatic token rotation for enhanced security:

1. Go to **OAuth & Permissions** in your Slack app
2. Scroll to **Advanced Token Security**
3. Enable **Token Rotation**
4. Backend handles refresh automatically via `slack_service.py`

## Checking Token Status

```bash
# Test if token is valid
curl -X POST https://slack.com/api/auth.test \
  -H "Authorization: Bearer xoxb-your-bot-token"
```

---

# Escalation Notifications Setup

## Channel Configuration

For escalation notifications to work, the Aexy bot must be:

1. **Invited to the target channel** (for private channels)
2. **Has `chat:write.public`** scope (for public channels without joining)

## Notification Channels

Escalation rules can notify via:

1. **Slack Channel**: Posts to a specific channel
2. **Direct Message**: Sends DM to specified users
3. **Email**: Falls back to email if Slack unavailable

## Setting Up Escalation Channels

1. Go to **Settings > Escalation Matrix** in Aexy
2. Create/edit an escalation rule
3. Select notification channels (email, slack, in_app)
4. For Slack notifications:
   - Specify channel ID or use default escalation channel
   - Ensure bot is in the channel

## Default Escalation Channel

Set a default channel for all escalation notifications:

```bash
# In workspace settings or environment
DEFAULT_ESCALATION_SLACK_CHANNEL=#escalations
```

## Message Format

Escalation messages include:
- Ticket number and form name
- Severity level with color coding
- Assignee info (if any)
- Direct link to ticket
- Acknowledge button (interactive)

---

# Troubleshooting

## "missing_scope" Error

The bot token is missing required scopes. Re-install the app after adding scopes.

## "channel_not_found" Error

1. Ensure the channel exists
2. Invite the bot to the channel: `/invite @Aexy`

## "not_in_channel" Error

Bot needs to be in the channel. Either:
- Invite the bot: `/invite @Aexy`
- Use `chat:write.public` scope for public channels

## Token Expired

If using token rotation and token expired:
1. Check `slack_integrations` table for `refresh_token`
2. Call `/api/v1/slack/refresh` to get new token
3. Or have user re-install the app

## Testing the Integration

```bash
# Send a test message
curl -X POST http://localhost:8000/api/v1/slack/test-notification \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"channel": "#general", "message": "Test from Aexy"}'
```
