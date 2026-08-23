# Dashboard

The first page every user sees, and the only one they cannot switch off. Two
routes, and the distinction matters:

| Route | What it is |
|---|---|
| `/dashboard` | **My Work** — the personal list: tasks, bugs, stories and form tickets assigned to you, across every workspace. |
| `/dashboard/overview` | The **widget dashboard** — a configurable grid. |

They swapped places. My Work used to live at `/tickets`, under a nav item
called "Tickets", on a page titled "My Work", next to a *different* nav item
also called "My Work" pointing at a thinner version of the same list. It took
over `/dashboard` because "what is on my plate?" is what people open the app to
find out. `/tickets` and `/my-work` are both redirects now; ticket *detail*
pages at `/tickets/{id}` are unmoved.

## The widget grid

`/dashboard/overview` renders from two config files, and neither holds data:

- **`frontend/src/config/dashboardWidgets.ts`** — 84 widget definitions, each
  with an id, a category, a default size, and the app it belongs to.
- **`frontend/src/config/widgetRegistry.tsx`** — maps a widget id to the
  component that renders it. The split exists so the definition list can be
  filtered by app access without importing every widget's code.

A widget whose app the workspace has switched off is not rendered, and not
offered in the picker: `getAccessibleWidgets` filters the definitions against
the resolved app access. Adding a widget means adding to *both* files.

## Presets

`frontend/src/config/dashboardPresets.ts` defines seven starting layouts —
`developer`, `manager`, `product`, `hr`, `support`, `sales`, `admin`. A preset
is the initial grid for someone who has never arranged one; after that their
layout is their own and the preset is not consulted again.

Presets are chosen during onboarding from the role the user picks. Getting this
wrong is recoverable — the picker is on the page — but it decides what the
product looks like on day one, which is most of what a first impression is.

## Adding a widget

1. Add the definition to `DASHBOARD_WIDGETS` in `dashboardWidgets.ts`, with the
   `appId` it belongs to so access filtering works.
2. Add the component to `widgetRegistry.tsx` under the same id.
3. If it needs props from the page rather than fetching its own data, add its
   id to `HOST_PROP_WIDGETS`.
4. Add it to whichever presets should start with it.

## Common pitfalls

- **`/dashboard` is not the widget grid.** A link meaning "the dashboard" in
  the widget sense must say `/dashboard/overview`.
- **A widget with no `appId`** is visible to everyone regardless of workspace
  app access, because "belongs to no app" reads as "not access-controlled".
- **`HOST_PROP_WIDGETS` is opt-in.** A widget not in that set is expected to
  fetch its own data; put a prop-driven one outside it and it renders empty.
