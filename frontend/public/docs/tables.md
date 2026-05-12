# Tables

Tables are a workspace-level, Airtable-style data store. Same underlying machinery as CRM (it reuses `CRMObject`, `CRMAttribute`, `CRMRecord`, `CRMList`), but presented as **generic data tables** — not bound to the CRM scope, and usable for project trackers, asset inventories, OKRs, etc.

## Why it shares the CRM models

`CRMObject.object_type` includes a `CUSTOM` variant, and `CRMObject.scope` distinguishes `crm` from `standalone`/`document`/`project`. Tables are `CRMObject` rows with `scope != "crm"` and `object_type = CUSTOM`. Records, attributes, and saved views (`CRMList`) all reuse the CRM tables, which means:

- Custom attribute types — TEXT, NUMBER, SELECT, RECORD_REFERENCE, AI_COMPUTED — all available to tables
- Cross-table references via `RECORD_REFERENCE` attributes
- Saved views with kanban/calendar/timeline/gallery layouts
- The CRM activity / audit log applies to tables too

If you understand CRM (see [crm.md](./crm.md)), you understand 90% of tables. The differences are scope, access control, and the dedicated `/tables` router.

## Router

`api/tables.py` — prefix `/workspaces/{workspace_id}/tables`.

```
# Core
GET    /workspaces/{ws}/tables                                  list (filterable by scope)
POST   /workspaces/{ws}/tables                                  create standalone table
GET    /workspaces/{ws}/tables/{table_id}                       with attributes
PATCH  /workspaces/{ws}/tables/{table_id}                       name/icon/color/visibility/row_access_mode/settings
DELETE /workspaces/{ws}/tables/{table_id}

# Attributes (columns)
POST   /workspaces/{ws}/tables/{table_id}/attributes            add column
PATCH  /workspaces/{ws}/tables/{table_id}/attributes/{attr_id}
DELETE /workspaces/{ws}/tables/{table_id}/attributes/{attr_id}
POST   /workspaces/{ws}/tables/{table_id}/attributes/reorder    attribute_id[] + position[]

# Records (rows)
POST   /workspaces/{ws}/tables/{table_id}/records
GET    /workspaces/{ws}/tables/{table_id}/records               with filters/sorts/pagination
GET    /workspaces/{ws}/tables/{table_id}/records/{record_id}
PATCH  /workspaces/{ws}/tables/{table_id}/records/{record_id}
DELETE /workspaces/{ws}/tables/{table_id}/records/{record_id}
POST   /workspaces/{ws}/tables/{table_id}/records/bulk-delete   record_ids[]

# Sharing & access
GET    /workspaces/{ws}/tables/{table_id}/access                read ACL
POST   /workspaces/{ws}/tables/{table_id}/collaborators
PATCH  /workspaces/{ws}/tables/{table_id}/collaborators/{id}
DELETE /workspaces/{ws}/tables/{table_id}/collaborators/{id}
GET    /workspaces/{ws}/tables/{table_id}/audit                 changes log
```

## Saved views

`api/saved_views.py` — generic saved-view CRUD, shared across `tables`, `sprint_task`, `ticket`, `candidate` entity types:

```
GET    /workspaces/{ws}/saved-views/{entity_type}
POST   /workspaces/{ws}/saved-views/{entity_type}              filters, sorts, visible_attributes, view_type, kanban_settings, …
GET    /workspaces/{ws}/saved-views/{entity_type}/{view_id}
PATCH  /workspaces/{ws}/saved-views/{entity_type}/{view_id}
DELETE /workspaces/{ws}/saved-views/{entity_type}/{view_id}
```

## Field types

The full `attribute_type` enum on `CRMAttribute` (`models/crm.py:324-405`):

```
TEXT, TEXTAREA, NUMBER, CURRENCY, DATE, TIMESTAMP, CHECKBOX,
SELECT, MULTI_SELECT, STATUS,
EMAIL, PHONE, URL, LOCATION,
PERSON_NAME, RATING,
RECORD_REFERENCE, USER_REFERENCE,
FILE, AI_COMPUTED
```

`RECORD_REFERENCE` links to another `CRMObject` (table or CRM object) via `config.target_object_id`. Use this to model relations across tables — "Asset.owner → Person", "Task.epic → Epic".

`AI_COMPUTED` stores a prompt + input attribute slugs + model name; values are computed by a Temporal activity and re-computed when inputs change. See [crm.md](./crm.md#custom-objects).

`STATUS` is a `SELECT` variant that renders as colored pills and supports a `category` (similar to sprint task statuses) for downstream analytics.

## View types

`CRMList.view_type`:

| Type | Required config |
|---|---|
| `TABLE` | None — default columnar view |
| `KANBAN` | `kanban_settings.group_by_field` + per-column colors |
| `CALENDAR` | `date_attribute` (and optional `end_date_attribute` for ranges) |
| `TIMELINE` | Same as `CALENDAR` plus `group_by_attribute` for swimlanes |
| `GALLERY` | Visible attributes are rendered as cards; works best with FILE attribute thumbnails |

Filters and sorts are JSONB arrays:

```json
{
  "filters": [{ "attribute": "status", "operator": "in", "value": ["open", "in_progress"], "conjunction": "AND" }],
  "sorts": [{ "attribute": "due_date", "direction": "asc" }]
}
```

Operators: `equals`, `not_equals`, `contains`, `not_contains`, `is_empty`, `is_not_empty`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `between`.

## Access control

Two layers on top of the workspace's role-based permissions:

- **`CRMObject.visibility`** — `public` (any workspace member with the relevant app permission) or `private` (only collaborators).
- **`CRMObject.row_access_mode`** — `none` (all collaborators see all rows), `owner` (only rows you own), `team` (only rows owned by your team).
- **Collaborators** — explicit per-developer `permission_level` (typically `view` / `edit` / `admin`).

Layer order on a request: workspace permission → table visibility → row access mode → record-owner check. All four must pass.

## Audit trail

Every record create/update/delete writes to the per-table audit log. Endpoints expose this at `GET /tables/{table_id}/audit`. The model captures `actor_id`, `action`, `old_value`, `new_value`, `timestamp` — useful when an auditor asks "who changed cell X on row Y on date Z."

The audit writer is a Temporal activity in `temporal/activities/tables.py` invoked from the record-service `update`/`delete` paths, so it's fire-and-forget and won't slow user writes.

## Frontend

`/frontend/src/app/(app)/tables/` — table browser, record list, column config, view switcher, filter/sort UI, sharing panel.

## Common pitfalls

- **Mixing CRM scope with standalone scope.** A table created via `POST /tables` is `scope=standalone` and won't show up in CRM. Don't try to "promote" it by editing scope — re-create as a CRM object via `POST /crm/objects` if that's what you want.
- **`row_access_mode` doesn't apply to admins.** Workspace admins see all rows regardless. Be careful generating "owner-only" reports for admins — they'll see everything.
- **AI_COMPUTED cycles.** If attribute A inputs attribute B and B inputs A, the computation never settles. The Temporal activity has a cycle detector that aborts with an error, but the UI doesn't warn at config time. Validate inputs explicitly.
- **Saved views are global.** A view created from one user's filtered list is visible (and editable) to anyone with table access unless `is_private=true`. Mark personal views private.
- **Bulk-delete is hard-delete.** Unlike `DELETE /records/{id}` which soft-archives via `is_archived=true`, `bulk-delete` removes the rows. The audit log retains the deletion event, but the rows are gone.
- **Cross-table reference rename pain.** Renaming the slug of a target object's primary attribute will break the displayed name of every `RECORD_REFERENCE` value pointing at it. Re-run the display-name cache rebuild after primary-attribute changes.
