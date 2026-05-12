# Frontend Conventions

How the Next.js app is organized and how to add to it without fighting the patterns.

## App Router layout

```
frontend/src/app/
├── (app)/        # Protected routes — require a JWT in localStorage["token"]
│   ├── dashboard/
│   ├── crm/
│   ├── sprints/
│   └── ...
├── (admin)/      # Platform admin only
├── auth/         # Sign-in, callback handlers
├── public/       # Anonymous-accessible shares (forms, project pages)
├── embed/        # iframe-friendly embeds
└── layout.tsx    # Root layout — wires providers + locale
```

Route groups (`(app)`, `(admin)`, `(auth)`) are Next.js layout boundaries — they don't appear in the URL. A page at `app/(app)/crm/page.tsx` is reachable as `/crm`.

Auth check happens in the `(app)` layout. If the JWT is missing or expired, it redirects to `/auth/login`.

## Data fetching: React Query

All server state goes through `@tanstack/react-query`. Components don't `fetch` directly.

```tsx
// frontend/src/hooks/useThings.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { thingsApi } from "@/lib/api";

export function useThings(workspaceId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["things", workspaceId],
    queryFn: () => thingsApi.list(workspaceId),
  });
  const create = useMutation({
    mutationFn: (data) => thingsApi.create(workspaceId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["things", workspaceId] }),
  });
  return { things: query.data ?? [], isLoading: query.isLoading, create };
}
```

Conventions:

- **Query keys are arrays**, leading with the resource name. Scope by `workspaceId` so locale/workspace switches don't bleed cache.
- **Invalidate, don't refetch.** `queryClient.invalidateQueries` lets RQ decide whether to refetch based on staleness.
- **Optimistic updates** are fine for fast, low-risk mutations (toggle a star, drag a card) — wrap with `onMutate`/`onError` rollback.
- **One hook per resource.** Keep hooks under `frontend/src/hooks/use<Resource>.ts`.

There are ~71 hooks already — browse them for patterns before inventing a new shape.

## Global client state: Zustand

For UI-state that crosses components — current modal, sidebar collapsed/expanded, locale preference, selected workspace — use a Zustand store under `frontend/src/stores/`.

Stores look like:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type SidebarState = {
  collapsed: boolean;
  toggle: () => void;
};

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    { name: "sidebar" },
  ),
);
```

Don't store **server data** in Zustand — that's React Query's job. The split:

- **Zustand**: UI prefs, in-flight modal state, optimistic local toggles.
- **React Query**: anything that came from the backend.

If you find yourself mirroring a list of records into Zustand, you've drifted — move it back to React Query.

## API client

`frontend/src/lib/api.ts` is generated (~605 KB). **Don't hand-edit it.** When you add or change a backend endpoint:

1. Run the codegen step (whatever the repo's makefile / npm script for it is).
2. Use the new client method from the generated namespace.

If the codegen step is missing for a one-off endpoint, prefer a thin wrapper in `frontend/src/lib/apiExtensions.ts` over patching the generated file.

Base URL comes from `NEXT_PUBLIC_API_URL` (`/api/v1` when behind the nginx proxy in compose; full origin in some dev setups). The auth token is read from `localStorage.getItem("token")` and added as `Authorization: Bearer …`.

## App registry

Every product visible in the sidebar is registered twice:

- `frontend/src/config/appDefinitions.ts` — frontend metadata (icon, label, route)
- `backend/src/aexy/models/app_definitions.py` — backend access gating

These must stay in sync. Adding a new app means updating both files in the same PR. Slugs must match exactly.

Navigation entries live in `frontend/src/config/sidebarLayouts.ts` — separate from app definitions because some apps surface multiple sub-pages in the sidebar.

## Dashboard widgets

Dashboard widgets are also registered in a config file rather than hardcoded into the dashboard component. To add one: register in `frontend/src/config/dashboardWidgets.ts` (or the equivalent — search for the existing widget configs in `frontend/src/config/`), then implement the widget component matching the registered slug.

User dashboard preferences are persisted to the backend via `DashboardPreferences` (see [Analytics docs](../analytics.md)).

## Styling

- TailwindCSS for everything. Avoid CSS modules; avoid `style={{...}}` for layout.
- Use **Radix UI primitives** (`@radix-ui/react-*`) for accessibility-sensitive components — dialogs, dropdowns, popovers, tabs. Wrap them with custom styling rather than building from scratch.
- Icons from `lucide-react`. Stick to one icon set per page for visual coherence.
- `clsx` for conditional classnames. Don't build classname strings by hand.

## Translations

Every user-facing string goes through `useTranslations()` — see [i18n.md](./i18n.md). New components should not have hardcoded English. Use `t("common.cancel")` not `<button>Cancel</button>`.

## Forms

There isn't a single canonical form library across the app — both react-hook-form and home-grown patterns exist. For new forms, prefer **react-hook-form** with Zod resolvers for schema validation. Keep submit handlers thin: validate → call a React Query mutation → handle success/error via toast.

## Loading & error states

Every async surface needs three states:

```tsx
if (query.isLoading) return <SkeletonCard />;
if (query.error) return <ErrorBanner error={query.error} />;
if (!query.data?.length) return <EmptyState />;
return <List items={query.data} />;
```

Skeletons over spinners. Empty states should suggest the next action, not just say "No items".

## Auth-guarded UI

Permissions are enforced server-side, but you should also hide UI that the user can't act on. Pattern: load the user's permissions once at app bootstrap (via a `useCurrentUser()` hook) and check before rendering action buttons:

```tsx
const { hasPermission } = useCurrentUser();
{hasPermission("can_manage_roles") && <Button>Edit role</Button>}
```

Backend still rejects on the action — but a 403 toast is worse UX than the button never appearing.

## Build & dev

```bash
cd frontend
npm install
npm run dev         # :3000
npm run build       # production build
npm run lint        # eslint
npm run test        # vitest unit
npm run test:e2e    # playwright (needs the dev server running)
```

`next.config.js` quirks worth knowing:

- `output: 'standalone'` for the Docker image.
- `ignoreBuildErrors: true` — TypeScript errors don't block builds. **This means tsc green ≠ runtime green.** Run `npm run test` and exercise the page in a browser.
- `images.remotePatterns` allow-lists every host the `<Image>` component is allowed to load from. New external image source = update this list, otherwise images 500 in prod.
- URL rewrite: `/book/:path*` → `/public/book/:path*`. Watch this if you're routing booking-related public pages.

## Common pitfalls

- **Storing server data in Zustand** — drifts immediately, hard to invalidate. Use React Query.
- **Hand-editing `lib/api.ts`** — your edit gets clobbered next codegen run.
- **Forgetting to invalidate queries after a mutation** — stale lists; users hit refresh thinking it's broken.
- **Hardcoding strings instead of `t("...")`** — passes review locally because en is the default; bites you when Hindi falls back to the key path.
- **Building forms without server-side validation as the source of truth** — frontend validation is convenience, the backend's Pydantic schemas are authoritative.
- **Using `<a href>` for in-app navigation** — bypasses Next.js client routing. Use `<Link>` from `next/link`.
- **Putting auth checks only in client code** — anyone can patch the bundle. Backend RBAC is the line of defense.
