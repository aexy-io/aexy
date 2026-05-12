# Forms

Forms in Aexy are a general-purpose data-collection layer that can produce **tickets**, **CRM records**, **deals**, or just `FormSubmission` rows. The same form definition powers both authenticated internal use and public anonymous submission.

## Pieces

- **Form** — definition (fields, theme, routing, automations)
- **FormField** — typed column on the form
- **FormSubmission** — one user's response
- **TicketForm** — a specialized Form sized for support intake (lives in `models/ticketing.py`)
- **Visual builder** — the schema + preview API that powers the drag-drop editor

## Routers

| Router | Prefix | Use |
|---|---|---|
| `api/forms.py` | `/workspaces/{ws}/forms` | Authenticated CRUD |
| `api/public_forms.py` | `/public/forms` | Anonymous submission |
| `api/ticket_forms.py` | `/workspaces/{ws}/ticket-forms` | Ticketing-specific forms (see [tickets-and-projects.md](./tickets-and-projects.md)) |
| `api/visual_builder.py` | — | Schema, validation, preview for the visual builder |
| `api/question_bank.py` | `/workspaces/{ws}/question-bank` | Reusable questions |

## Form model (`models/forms.py`)

| Field | Note |
|---|---|
| `workspace_id`, `name`, `slug` | Identity |
| `description` | Help text shown at the top of the form |
| `template_type` | `bug_report` / `feature_request` / `support` / `contact` / `lead_capture` / `feedback` / `custom` |
| `public_url_token` | Unique — drives the `/public/forms/{token}` route |
| `is_active` | |
| `auth_mode` | `anonymous` / `email_verification` (OTP) |
| `require_email` | |
| `theme` (JSONB) | Full visual customization (see below) |
| `success_message`, `redirect_url` | Post-submit UX |
| `auto_create_ticket`, `default_team_id`, `ticket_assignment_mode` | Ticket routing |
| `auto_create_record`, `crm_object_id` | CRM routing |
| `auto_create_deal`, `deal_pipeline_id` | Deal creation |
| `trigger_automations` | Whether to fire workspace automations on submit |
| `destinations` (JSONB) | External sync (GitHub, Jira, Linear) |
| `conditional_rules` (JSONB) | Show/hide/require logic |
| `submission_count` | Cached |

### Theme JSONB

The theme is fully structured — frontend reads it and applies element-by-element:

```json
{
  "preset": "light|dark|minimal|modern|colorful|corporate|null",
  "global": {
    "primary_color": "#...",
    "secondary_color": "#...",
    "background_color": "#...",
    "font_family": "...",
    "border_radius": "...",
    "spacing": "compact|normal|relaxed"
  },
  "elements": {
    "form": { "background_color": "...", "padding": "...", "max_width": "...", "shadow": "..." },
    "header": { "text": "...", "text_color": "...", "font_size": "...", "font_weight": "...", "alignment": "left|center|right", "logo_url": "...", "logo_position": "..." },
    "labels": { "text_color": "...", "font_size": "...", "required_indicator_color": "..." },
    "inputs": { "background_color": "...", "border_color": "...", "text_color": "...", "focus_border_color": "...", "border_radius": "..." },
    "buttons": { "primary": { "...": "..." }, "secondary": { "...": "..." } },
    "errors": { "text_color": "...", "background_color": "...", "border_color": "...", "icon_color": "..." },
    "help_text": { "text_color": "...", "font_size": "..." }
  },
  "custom_css": "..."
}
```

A `preset` is a named bundle of `global`+`elements` values; setting a preset and then overriding specific fields is the common pattern.

### Conditional rules JSONB

```json
[
  { "field_key": "...", "operator": "equals|contains|...", "value": "...", "action": "show|hide|require" }
]
```

Evaluated client-side as the user types. The server still treats every defined field as authoritative — conditional `hide` is a UX nicety, not a validation guarantee.

## FormField

| Field | Note |
|---|---|
| `form_id`, `name`, `field_key` | Identity |
| `field_type` | `text` / `textarea` / `email` / `phone` / `number` / `url` / `select` / `multiselect` / `checkbox` / `radio` / `file` / `date` / `datetime` / `hidden` |
| `placeholder`, `default_value`, `help_text` | UX |
| `is_required` | |
| `validation_rules` (JSONB) | `{validation_type, min_length, max_length, pattern, custom_message, allowed_file_types, max_file_size_mb}` |
| `options` | For `select`/`radio` |
| `position`, `is_visible`, `width` | Layout |
| `crm_attribute_id` | Map to a CRM attribute for record creation |
| `external_mappings` (JSONB) | `{github, jira, linear}` field mappings |

## FormSubmission

| Field | Note |
|---|---|
| `form_id` | Source |
| `status` | `PENDING` / `PROCESSING` / `COMPLETED` / `PARTIALLY_FAILED` / `FAILED` |
| `submitted_by` | Email/name |
| `field_values` (JSONB) | Keyed by `field_key` |
| `created_ticket_id`, `created_record_id`, `created_deal_id` | Downstream artifacts |
| `error_message` | If `*_FAILED` |

`PARTIALLY_FAILED` is a real state — if the form is configured to create both a ticket AND a CRM record, and only the CRM call fails, the submission is partial. The retry endpoint re-attempts the missing pieces.

## Endpoints

```
# Authenticated CRUD
GET    /workspaces/{ws}/forms
POST   /workspaces/{ws}/forms
GET    /workspaces/{ws}/forms/{form_id}                       include_fields=true to embed fields
PATCH  /workspaces/{ws}/forms/{form_id}
DELETE /workspaces/{ws}/forms/{form_id}
POST   /workspaces/{ws}/forms/{form_id}/duplicate             clone with new name

# Fields
POST   /workspaces/{ws}/forms/{form_id}/fields
PATCH  /workspaces/{ws}/forms/{form_id}/fields/{field_id}
DELETE /workspaces/{ws}/forms/{form_id}/fields/{field_id}
POST   /workspaces/{ws}/forms/{form_id}/fields/reorder        field_id[] + position[]

# Submissions
GET    /workspaces/{ws}/forms/{form_id}/submissions           filter by status + date
GET    /workspaces/{ws}/forms/{form_id}/submissions/{id}
PATCH  /workspaces/{ws}/forms/{form_id}/submissions/{id}      update status
DELETE /workspaces/{ws}/forms/{form_id}/submissions/{id}

# Per-form integrations
POST/GET/PATCH/DELETE /workspaces/{ws}/forms/{form_id}/ticket-config
POST/PATCH/DELETE     /workspaces/{ws}/forms/{form_id}/crm-mapping
POST/PATCH/DELETE     /workspaces/{ws}/forms/{form_id}/deal-config
POST/GET/DELETE       /workspaces/{ws}/forms/{form_id}/automation-link

# Public (no auth)
GET  /public/forms/{public_token}                  render
POST /public/forms/{public_token}/submit           submission (rate-limited)
POST /public/forms/{public_token}/verify-email     OTP send for email_verification mode
```

## Public submission flow

1. `GET /public/forms/{public_token}` returns the `PublicFormResponse` — fields filtered to `is_visible=true`, no `external_mappings` exposed, theme included.
2. If `auth_mode = email_verification`: the client sends the email to `/verify-email`, server issues an OTP, user enters it, server verifies.
3. Client posts to `/submit` with `{email, field_values}`.
4. Server creates `FormSubmission` (status `PENDING`), runs validation, dispatches:
   - Ticket creation if configured
   - CRM record creation if configured
   - Deal creation if configured
   - External sync (GitHub/Jira/Linear) per `destinations`
   - Automations matching `FORM_SUBMITTED` trigger
5. Response returns `{submission_id, status, thank_you_page}` — either renders `success_message` or redirects to `redirect_url`.

Each downstream step that fails updates submission status to `PARTIALLY_FAILED` (or `FAILED` if everything failed), recording details on `error_message`.

## Visual builder

`api/visual_builder.py` exposes schema introspection used by the drag-drop editor:

```
GET  /workspaces/{ws}/visual-builder/schema      JSON-schema describing all field types
POST /workspaces/{ws}/visual-builder/validate    validate a form JSON against schema
POST /workspaces/{ws}/visual-builder/preview     render a form definition without persisting
```

Question bank (`api/question_bank.py`) is a reusable library of pre-defined form fields — useful when the same "Severity (low/medium/high/critical)" select shows up in dozens of forms.

## Frontend

`/frontend/src/app/(app)/forms/` — form builder UI, field editor, submission inbox, theme customizer, conditional-logic designer.

Public render lives in `/frontend/src/app/public/forms/[token]/page.tsx`.

## Common pitfalls

- **`external_mappings` exposed to anonymous users.** `PublicFormResponse` filters them out — never call the authenticated form endpoint from the public flow.
- **Conditional rules are not validation.** A `hide` action removes the field from the UI but not from the schema; server-side, the field is still allowed in the submission. Don't rely on conditional rules to enforce data shape — use `is_required` + `validation_rules`.
- **`auto_create_ticket=true` without `default_team_id`.** Submissions create unassigned tickets, which sit in the inbox until someone routes them. Either set a default team or rely on `ticket_assignment_mode = oncall`.
- **`PARTIALLY_FAILED` is silent.** Submissions still respond 200 because the form was accepted. Surface the partial-failure state in the submission inbox so admins notice the CRM record didn't get created.
- **Public form rate limits.** The submission endpoint is aggressively rate-limited per IP. For internal batch imports use the authenticated path.
- **Theme JSONB is open-ended.** Frontend renders unknown keys gracefully but stores them. Don't sneak app state into `theme` — it'll surface in the public payload.
