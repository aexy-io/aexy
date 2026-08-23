# On-Call

Rotations, schedules, swaps and overrides — who carries the pager for a team
and when. `api/oncall.py` (15 endpoints), `hooks/useOnCall.ts`, components in
`components/oncall/`.

## Mental model

- **Config** — one per team. On-call is **off** until enabled, and a team with
  it off pages nobody. `POST /enable`, `POST /disable`, `PATCH /config`.
- **Schedule** — one interval with one developer on it: start, end, who.
  A rotation is a list of schedules, not a rule; `POST /schedules/bulk`
  generates a run of them.
- **Current** — `GET /current` resolves "who is on right now" for a team,
  and returns the next shift as well, so a UI can say "nobody until Monday"
  instead of just "nobody".
- **Swap request** — a developer asks somebody to take a shift. Pending until
  accepted; accepting rewrites the schedule.
- **Override** — an admin reassigns a shift without asking. Same effect, no
  handshake.

## Everything is team-scoped

There is no workspace-wide rotation, and this is the single most important
thing to know. Every endpoint takes a team id. A workspace with four teams has
four independent rotations that know nothing about each other.

`/oncall` is the roll-up that reads across them — it lists teams, shows each
one's current holder, and links into the per-team editor. Individual rotations
are configured at `/settings/projects/{projectId}/oncall`.

## Google Calendar

`useGoogleCalendarStatus` / `useGoogleCalendarConnect` / `useGoogleCalendars`
push the rotation into a calendar, so a shift shows up where people already
look. Connection is per workspace; the calendar chosen is per team.

## Common pitfalls

- **Enabled is not scheduled.** A team can have on-call enabled and no
  schedules, in which case `GET /current` correctly returns nobody. The
  overview distinguishes "off" from "on with a gap"; alerting should too.
- **Teams, not departments.** Departments grant app access; teams own
  rotations. Someone can be able to *see* on-call and be in no rotation.
- **Swaps mutate the schedule.** Accepting a swap rewrites the row rather than
  layering on it, so the original assignment is not recoverable from the
  schedule alone.
