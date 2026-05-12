# Leave Management

A self-contained module for time-off: types, policies, requests, balances, holidays.

## Router

`api/leave.py` — prefix `/workspaces/{workspace_id}/leave`.

```
# Types
GET    /types?include_inactive=...
POST   /types
PUT    /types/{type_id}
DELETE /types/{type_id}

# Policies
GET    /policies
POST   /policies
PUT    /policies/{policy_id}
DELETE /policies/{policy_id}

# Requests
POST   /requests
GET    /requests?status=...&developer_id=...&date_range
GET    /requests/{request_id}
POST   /requests/{request_id}/approve
POST   /requests/{request_id}/reject
POST   /requests/{request_id}/cancel       requester cancels
POST   /requests/{request_id}/withdraw     pending → withdrawn

# Balance
GET    /balance/{developer_id}             yearly per-type breakdown
GET    /balance                            all workspace balances

# Holidays
GET    /holidays?year=...
POST   /holidays
PATCH  /holidays/{holiday_id}
DELETE /holidays/{holiday_id}
```

## Models (`models/leave.py`)

**`LeaveType`** — vacation, sick, parental, comp-off, etc.

| Field | Note |
|---|---|
| `workspace_id`, `name`, `slug` | Identity |
| `description`, `color`, `icon` | Display |
| `is_paid` | |
| `requires_approval` | If false, requests auto-approve |
| `min_notice_days` | Minimum days between request submission and start |
| `allows_half_day` | |
| `is_active`, `sort_order` | |

**`LeavePolicy`** — quota rules for a type, scoped to roles or teams.

| Field | Note |
|---|---|
| `leave_type_id` | Bind |
| `annual_quota` (float) | Days per year |
| `accrual_type` | `UPFRONT` (full quota on Jan 1) / `MONTHLY` / `QUARTERLY` |
| `carry_forward_enabled`, `max_carry_forward_days` | End-of-year handling |
| `applicable_roles`, `applicable_team_ids` (JSONB) | Who this policy applies to — null = everyone |

**`LeaveRequest`**:

| Field | Note |
|---|---|
| `developer_id`, `leave_type_id` | |
| `start_date`, `end_date` | |
| `is_half_day`, `half_day_period` | `first_half` / `second_half` |
| `reason` | |
| `status` | `PENDING` / `APPROVED` / `REJECTED` / `CANCELLED` / `WITHDRAWN` |
| `approved_by_id`, `approved_at` | If approved |
| `rejected_by_id`, `rejected_at`, `rejection_reason` | If rejected |
| `days_requested` | Computed at submission, accounting for half-days and holidays |

**`LeaveBalance`** — denormalized for the dashboard.

| Field | Note |
|---|---|
| `developer_id`, `year`, `leave_type_id` | Key |
| `quota` | From policy |
| `used` | Sum of approved days |
| `carried_forward` | From prior year (if `carry_forward_enabled`) |
| `available` | Computed: `quota + carried_forward - used` |

**`Holiday`** — workspace-wide non-working days.

| Field | Note |
|---|---|
| `workspace_id`, `date`, `name` | |
| `is_optional` | Optional/floating holidays |
| `created_by_id` | |

## Workflow

```
Developer submits LeaveRequest        →  status = PENDING
   ↓
   If LeaveType.requires_approval=false:
      auto-approve
   else:
      Manager reviews:
         POST /requests/{id}/approve  →  status = APPROVED, LeaveBalance updated
         POST /requests/{id}/reject   →  status = REJECTED
   ↓
   Developer can:
      POST /requests/{id}/cancel      →  status = CANCELLED (any state, manager can disallow per policy)
      POST /requests/{id}/withdraw    →  status = WITHDRAWN (PENDING only)
```

`days_requested` is computed at request time using `Holiday` rows in the date range — a 5-business-day request that overlaps two holidays counts as 3 days against the balance.

## Calendar integration

Approved requests block dates on the workspace calendar and surface to the team via `/team-calendar` (see `api/team_calendar.py`). Booking conflicts respect approved leave when scheduling meetings.

## Frontend

`/frontend/src/app/(app)/leave/` — leave calendar, request form, balance tracker, approval inbox, policy manager.

## Common pitfalls

- **Quota mismatches under multiple policies.** A developer matching multiple `LeavePolicy` rows (e.g. role-based + team-based) gets the **most permissive** quota. Be deliberate about overlapping policies.
- **Half-days don't compose across types.** Two half-day requests on the same day of different types succeed (each takes 0.5 from its own balance). If you don't want this, validate on submit.
- **`CANCELLED` vs `WITHDRAWN`.** A `WITHDRAWN` request was pending and never approved — no balance impact. A `CANCELLED` request was approved and is being given back — the balance is credited.
- **Holiday changes don't retroactively re-compute `days_requested`** on already-submitted requests. If you add a holiday mid-cycle, existing requests still show their original day count.
- **Carry-forward happens at year boundary.** It's a daily Temporal activity that runs on Jan 1; if the worker is down, balances don't carry. Re-run the activity manually if a year rollover is missed.
