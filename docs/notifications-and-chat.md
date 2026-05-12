# Notifications, Chat & Onboarding

Three smaller modules grouped together because they share infrastructure (notifications dispatch chat events, onboarding seeds notifications, chat triggers agent runs).

## Notifications

In-app + web push + email + Slack delivery for events that need a user's attention.

### Router

`api/notifications.py:29` — workspace-scoped.

```
GET    /workspaces/{ws}/notifications                    paginated, unread-only filter
GET    /workspaces/{ws}/notifications/unread-count
GET    /workspaces/{ws}/notifications/poll?since=...     for in-app polling
POST   /workspaces/{ws}/notifications/mark-read
POST   /workspaces/{ws}/notifications/mark-all-read
GET    /workspaces/{ws}/notifications/preferences
PATCH  /workspaces/{ws}/notifications/preferences
POST   /workspaces/{ws}/notifications/web-push/subscribe sub-with-VAPID
DELETE /workspaces/{ws}/notifications/web-push/{id}
```

### Model

**`Notification`**:

| Field | Note |
|---|---|
| `developer_id`, `workspace_id` | Subject |
| `event_type` | A value from `NotificationEventType` enum |
| `is_read` | |
| `data` (JSONB) | Type-specific payload (record IDs, action labels, etc.) |
| `category` | `developer_insights` / `tracking` / `performance_reviews` / `assignments` / `team` / `system` |
| `created_at` | |

### Channels

Per-user, per-category preferences gate delivery:

| Channel | Activity |
|---|---|
| In-app | Always written to the table; UI polls |
| Web push | `send_notification_web_push` Temporal activity, VAPID-signed |
| Email | `send_notification_email` activity |
| Slack | `send_notification_slack` activity (DMs or channel posts) |
| SMS | `send_sms` activity (Twilio, opt-in) |

All four delivery activities have `STANDARD_RETRY` and 2-minute timeouts (`dispatch.py:84-90`).

### Frontend

The notification bell at the top of every authenticated page (`frontend/src/components/NotificationBell.tsx`) polls `unread-count` and `poll?since=...` on a short interval. Click → flyout with the latest 20 notifications. `/notifications` is the full-list page.

## Chat

Real-time team messaging — channels, DMs, threads, mentions, file attachments.

### Router

`api/chat.py:38` — REST for CRUD, WebSocket for live sync.

```
# REST
GET/POST/PATCH/DELETE /workspaces/{ws}/chat/channels
GET                   /workspaces/{ws}/chat/channels/{id}/messages
POST                  /workspaces/{ws}/chat/channels/{id}/messages
PATCH/DELETE          /workspaces/{ws}/chat/messages/{id}
GET/POST              /workspaces/{ws}/chat/topics          threads
GET                   /workspaces/{ws}/chat/inbox           your unread across channels
GET                   /workspaces/{ws}/chat/presence

# WebSocket
WS  /workspaces/{ws}/chat/{channel_id}/ws                   live updates via ChatPubSub
```

### Models

**`Channel`** — public or private. Membership lives in `ChannelMember`.

**`Message`** — text + optional attachments (file IDs referencing `DriveFile` / `FileMetadata`). Supports rich content (markdown + ProseMirror JSON).

**`Topic`** — threaded discussion under a message. Promotes long replies out of the main channel.

### Mentions & agents

`@developer_login` mentions trigger notifications. `@all` triggers the `process_chat_all_mention` Temporal activity (standard retry, 5-minute timeout — `dispatch.py:101`).

Agents can be `@mentioned` in chat. The `process_agent_chat_mention` activity (LLM retry, 10-minute timeout — `dispatch.py:100`) routes the chat context through the named agent and posts its reply back into the channel. The agent uses the CRM/email/enrichment tools described in [ai-agents.md](./ai-agents.md).

### Frontend

`/frontend/src/app/(app)/chat/` — channel list, message pane, thread pane, mention autocomplete (resolves to both members and agents), file-attachment picker.

## Onboarding

User and workspace onboarding flows — gamified, AI-driven step progression.

### Activities

Onboarding lives as a Temporal workflow (`temporal/workflows/onboarding.py`) plus supporting activities:

- `start_user_onboarding(workspace_id, user_id, flow_slug)` — kicks off the workflow for one user
- `process_onboarding_step(progress_id)` — advances the user to the next step
- `check_due_onboarding_steps` — periodic Temporal schedule, fires step transitions that depend on time/conditions

`UserOnboardingProgress` stores the per-user state (current step, started_at, completed_at, decisions). `OnboardingFlow` defines the flow as a graph of steps with conditions.

### Frontend

`/frontend/src/app/(app)/onboarding/` — the step-by-step UI. CRM has its own dedicated onboarding sub-flow at `/crm/onboarding/*`.

## Profile

`api/...` — there is no single `profile.py` router; the `/profile` frontend page composes data from `developers.py`, `intelligence.py`, `career.py`, and `learning.py`.

`/frontend/src/app/(app)/profile/` — career progression view, role visualization, expertise areas, learning paths, recent activity.

## Common pitfalls

- **Web push without VAPID config**: subscribe will succeed but `send_notification_web_push` will silently fail at delivery. Set `WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY` / `WEB_PUSH_VAPID_SUBJECT` and verify in the integration health page.
- **Notification preferences are additive, not subtractive.** A new event type defaults to "all channels enabled" for existing users. If you launch a high-volume new event, plan a default-off rollout.
- **Chat WebSockets and presence**: presence is best-effort — a user closing their tab takes ~30s to disappear from the presence list, depending on idle timeout. Don't gate critical UI on "is user online."
- **`@all` is rate-limited per channel** to discourage abuse. Bursts will land as a single notification with bundled message count.
- **Agent-in-chat needs an API token internally.** The chat agent invocation runs as the workspace and is scoped by `AgentPolicy`. Without a policy, agents have unrestricted tool access — set policies before exposing agents in busy channels.
- **Onboarding state can diverge from current schema.** Flows reference UI steps by slug; renaming a step in `OnboardingFlow.steps` without migrating in-flight `UserOnboardingProgress.current_step_slug` leaves users stuck. Migrate progress rows when you change flow shape.
