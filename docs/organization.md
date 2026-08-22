# Organization

Departments, the people in them, the reporting tree, and the app access that
follows from where someone sits. Three routes — `/organization`,
`/organization/departments`, `/organization/directory` — over
`api/organization.py` (19 endpoints) and `api/teams.py` (5).

## Departments are not teams

Both exist, they are different things, and confusing them is the main way to
get lost here.

| | Department | Team |
|---|---|---|
| Model | `departments`, `department_members`, `department_positions` | `teams`, `team_members` |
| Shape | A **tree** — every department has an optional parent | A **flat set** |
| Answers | "where does this person sit, and who do they report to" | "who works on this together" |
| Grants app access | **Yes**, via an access profile | No |
| Owns on-call | No | **Yes** — rotations are team-scoped |

A person is normally in exactly one department and any number of teams.

## Access profiles

This is the part with consequences. A department carries a
`DepartmentAccessProfile` — a named bundle of app access, resolved from
`SYSTEM_APP_BUNDLES`. Put somebody in Engineering and they get the engineering
bundle; move them to Sales and their sidebar changes.

    GET  /departments/{id}/access-profile
    PUT  /departments/{id}/access-profile
    GET  /access-profiles

This is why `frontend/src/config/appDefinitions.ts` and
`backend/src/aexy/models/app_definitions.py` must agree: the resolver reads the
backend copy, the sidebar reads the frontend one, and a disagreement means the
nav offers apps the API refuses — or hides apps the user can reach by typing
the URL. `scripts/dump_app_catalog.py` regenerates the fixture that holds the
two together; `test_app_catalog_fixture.py` and `appCatalogParity.test.ts`
enforce it from either side.

## The org chart

`GET /org-chart` returns `DepartmentNode`s — the tree, pre-nested, rather than
a flat list for the client to assemble. `POST /departments/{id}/reparent` moves
a subtree; it moves the children with it, and it re-resolves access for
everyone underneath, which is the expensive part.

## Positions

`department_positions` describes a *seat* rather than a person —
title, `PositionStatus`, and the department it belongs to. A vacant position is
a real row, which is what lets Hiring open a requisition against it and what
makes headcount reporting possible before anyone is hired.

## Directory

`GET /people` returns `PersonSummary` — the workspace-wide list behind
`/organization/directory`. It is the "everybody" view; `/insights/developers`
is the narrower one, showing only people with engineering activity in a period.

## Common pitfalls

- **Reparenting changes access.** Moving a department under a different parent
  can change what its members can open. It is not a cosmetic drag.
- **Deleting a department with children** is refused, not cascaded. Reparent
  the children first.
- **A person with no department has no profile-derived access** and falls back
  to their role. That is a valid state, and it is why some users see a
  different sidebar than their colleagues.
- **Team membership does not imply department membership.** On-call reads
  teams; app access reads departments. A rotation and a sidebar can disagree
  entirely and both be correct.
