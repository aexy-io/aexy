"use client";

/**
 * The shared chrome for every page in the app.
 *
 * `AppShell` used to render its children into `<div className="mx-0 p-0">` — no
 * padding, no width, no header, no breadcrumb. Given nothing, all 277 pages
 * invented their own, and the results diverged in every dimension that decides
 * whether software looks finished:
 *
 *   - **41 distinct `<h1>` class strings.** The page-title role alone was
 *     expressed six ways, including 16 pages using `text-gray-900 dark:text-white`
 *     instead of `text-foreground` — which means they do not follow a retheme and
 *     go invisible the moment the palette moves.
 *   - **Seven competing content widths** (`max-w-7xl` on 82 files, `max-w-6xl` on
 *     34, `max-w-4xl` on 31, …), each fighting the shell and leaving a different
 *     dead margin at desktop sizes.
 *   - **119 pages re-declaring `min-h-screen bg-background`** inside a `<main>`
 *     that already scrolls and already has that background.
 *   - **Zero `loading.tsx` files** against 30 `error.tsx`, so every page
 *     hand-rolled its own `animate-pulse` block or showed nothing.
 *
 * This is not a new invention. `components/settings/SettingsPrimitives.tsx`
 * solved exactly this for the 56 settings pages and has been proven across 58
 * files; these are those primitives with the settings-specific assumptions
 * lifted out. That file now re-exports from here, so nothing in settings churns
 * and the two cannot drift.
 *
 * The one deliberate behaviour change: `PageShell` owns the page's width and
 * padding, so pages must not set `max-w-*`, `p-*` or `min-h-screen` themselves.
 * `src/test/appShell.test.ts` enforces the `min-h-screen` half of that today.
 * The `max-w-*` half is not yet a guard: 147 pages still declare their own
 * width, and a rule that fails on all of them fails on every commit. It turns
 * on in the Phase E PR that finishes the last of them — the ESLint
 * `TOKEN_MIGRATED` list is the same idea for colour.
 */

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// --------------------------------------------------------------- breadcrumbs

export interface Breadcrumb {
  label: string;
  href?: string;
}

/**
 * Lets a page override the trail the topbar derives from the pathname.
 *
 * There is exactly one breadcrumb on screen, and it lives in the topbar. When
 * `PageHeader` also rendered its own, `/settings/service-desk/mailboxes` showed
 * two trails that disagreed — the topbar said "Settings › Service Desk ›
 * Mailboxes" from the path while the page said "Settings › Master Data ›
 * Mailboxes" from a mis-keyed translation. Two answers to "where am I" is worse
 * than the none we started with.
 *
 * So a page's `breadcrumbs` prop replaces the derived trail rather than adding a
 * second one. That is what it is for: a route like
 * `/sprints/<id>/<id>/analytics` knows the sprint's name and the path does not.
 */
const BreadcrumbOverrideContext = React.createContext<
  ((trail: Breadcrumb[] | null) => void) | null
>(null);

export function BreadcrumbOverrideProvider({
  onChange,
  children,
}: {
  onChange: (trail: Breadcrumb[] | null) => void;
  children: React.ReactNode;
}) {
  return (
    <BreadcrumbOverrideContext.Provider value={onChange}>
      {children}
    </BreadcrumbOverrideContext.Provider>
  );
}

export function useBreadcrumbOverride(trail: Breadcrumb[] | undefined) {
  const publish = React.useContext(BreadcrumbOverrideContext);
  // Serialised so an inline array literal — which every caller writes — does not
  // republish on every render.
  const key = trail ? JSON.stringify(trail) : null;
  React.useEffect(() => {
    if (!publish) return;
    publish(key ? (JSON.parse(key) as Breadcrumb[]) : null);
    return () => publish(null);
  }, [publish, key]);
}

// ---------------------------------------------------------------- page shell

/**
 * How wide the content column is allowed to get.
 *
 * `form` keeps a comfortable reading measure for label/control pairs. `wide` is
 * for tables and dashboards. `full` opts out entirely — boards, canvases and
 * calendars that manage their own scroll.
 */
export type PageWidth = "form" | "wide" | "full";

const WIDTH: Record<PageWidth, string> = {
  form: "max-w-3xl",
  wide: "max-w-6xl",
  full: "max-w-none",
};

interface PageShellProps {
  width?: PageWidth;
  /**
   * Drop the shell's padding. For a page that is one edge-to-edge surface (a
   * kanban board, the docs editor) rather than a column of sections.
   */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function PageShell({
  width = "wide",
  flush = false,
  className,
  children,
}: PageShellProps) {
  return (
    <div
      data-page-shell={width}
      className={cn(
        "mx-auto w-full",
        WIDTH[width],
        // One padding scale for the whole app. Pages previously ranged over
        // p-4 / p-6 / p-8 / px-6 py-8 / px-4 sm:px-6 lg:px-8 with no rule.
        !flush && "px-4 py-6 sm:px-6 lg:px-8",
        className
      )}
    >
      {children}
    </div>
  );
}

// --------------------------------------------------------------- page header

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Rendered top-right — the page's primary action ("New monitor", "Invite"). */
  actions?: React.ReactNode;
  /**
   * Replaces the topbar's derived trail, for deep or dynamic routes the pathname
   * cannot name (`/sprints/[projectId]/[sprintId]`). Rendered in the topbar, not
   * here — most pages should leave this alone and let the path speak.
   */
  breadcrumbs?: Breadcrumb[];
  /** Small icon chip left of the title. */
  icon?: React.ReactNode;
  /** Extra content below the title block — filters, tabs, a stat row. */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  icon,
  children,
  className,
}: PageHeaderProps) {
  useBreadcrumbOverride(breadcrumbs);

  return (
    <header className={cn("pb-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {/* The single page-title style. Was 41 different class strings. */}
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            {description && (
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        {/*
          `actions` wraps rather than scrolls. The CRM header used a nowrap row
          of five buttons, which put its primary "+ New Object" past the right
          edge at 375px with no way to reach it.
        */}
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

// ------------------------------------------------------------------- section

interface PageSectionProps {
  title?: string;
  description?: string;
  /** Rendered in the section header, right-aligned — usually a small action. */
  actions?: React.ReactNode;
  /** Muted helper text below the body, separated by a rule. */
  footer?: React.ReactNode;
  /** Drop the body padding when the child is a full-bleed table or list. */
  flush?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Sections sit on `bg-surface`, not `bg-card`. In the dark theme `--card` and
 * `--background` resolve to nearly the same value, so a `bg-card` block reads as
 * flat page background with a hairline around it — no elevation at all.
 */
export function PageSection({
  title,
  description,
  actions,
  footer,
  flush = false,
  className,
  children,
}: PageSectionProps) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}>
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && (
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}

      {children != null && <div className={flush ? undefined : "px-5 py-4"}>{children}</div>}

      {footer && (
        <div className="border-t border-border bg-background/40 px-5 py-3 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </section>
  );
}

/** Vertical rhythm between sections. One value, so pages stop picking their own. */
export function PageSections({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("space-y-5 pb-16", className)}>{children}</div>;
}

// ------------------------------------------------------------------ form row

interface PageRowProps {
  label: string;
  description?: string;
  /** Associates the label with the control for screen readers and click-to-focus. */
  htmlFor?: string;
  /** The control. Right-aligned on desktop, stacked under the label on mobile. */
  control?: React.ReactNode;
  /** Full-width content below the label/control pair (validation, previews). */
  children?: React.ReactNode;
  className?: string;
}

export function PageRow({
  label,
  description,
  htmlFor,
  control,
  children,
  className,
}: PageRowProps) {
  return (
    <div
      className={cn(
        // Stacks on mobile so a long label and its control never collide.
        "flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="min-w-0 sm:flex-1">
        <label
          htmlFor={htmlFor}
          className={cn("block text-sm font-medium text-foreground", htmlFor && "cursor-pointer")}
        >
          {label}
        </label>
        {description && (
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{description}</p>
        )}
        {children}
      </div>
      {control && <div className="shrink-0 sm:max-w-xs sm:text-right">{control}</div>}
    </div>
  );
}

/** Hairline between consecutive rows in one section. */
export function PageRowGroup({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>;
}

// -------------------------------------------------------------- choice card

interface ChoiceCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Extra content shown inside the card (a preview, a badge row). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The selectable-card pattern that was copy-pasted into the theme picker, the
 * sidebar-layout picker, the plans grid and the access-template list.
 *
 * A real `<button>` with `aria-pressed`, so it is keyboard-reachable and
 * announced as a toggle — the hand-rolled copies were mostly divs.
 */
export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  disabled = false,
  children,
  className,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "relative flex w-full flex-col rounded-lg border p-4 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-primary bg-primary/10"
          : // `hover:border-border-strong` here for a long time. There is no
            // such utility — the `border-theme` colour group generated
            // `border-border-theme-strong`, so the hover state silently did
            // nothing in seven files. `border-neutral` is a real token.
            "border-border bg-background/40 hover:border-neutral hover:bg-background/70",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 rounded-full bg-primary p-1">
          <Check className="h-3 w-3 text-primary-foreground" aria-hidden />
        </span>
      )}

      <span className="flex items-center gap-3 pr-7">
        {icon && (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              selected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            {icon}
          </span>
        )}
        <span className="text-sm font-medium text-foreground">{title}</span>
      </span>

      {description && <span className="mt-2 text-sm text-muted-foreground">{description}</span>}
      {children}
    </button>
  );
}

// ------------------------------------------------------------ empty / loading

/**
 * The small, in-section empty state — "no rows in this table yet".
 *
 * For a whole page with nothing in it, use `components/EmptyState`: it can carry
 * linked setup steps, integration status and a handbook link, which is what
 * makes an empty module teachable rather than merely blank.
 */
export function PageEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground/60">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * One loading treatment for the whole app, and what every `loading.tsx` renders.
 *
 * Skeleton rows rather than a spinner: a page loads a known shape, so showing
 * that shape avoids the layout jump a centred spinner guarantees. Before this
 * there were 212 files hand-rolling `animate-pulse` and not one `loading.tsx`.
 */
export function PageSkeleton({
  rows = 3,
  header = true,
  width = "wide",
}: {
  rows?: number;
  /** Include a title/description placeholder. Off for a skeleton inside a section. */
  header?: boolean;
  width?: PageWidth;
}) {
  return (
    <PageShell width={width}>
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading…</span>
        {header && (
          <div className="pb-6">
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted/60" />
          </div>
        )}
        <div className="space-y-5">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-56 animate-pulse rounded bg-muted/60" />
              </div>
              <div className="space-y-3 px-5 py-4">
                <div className="h-9 w-full animate-pulse rounded bg-muted/50" />
                <div className="h-9 w-2/3 animate-pulse rounded bg-muted/50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

// ------------------------------------------------------------------ save bar

interface PageSaveBarProps {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  discardLabel?: string;
  dirtyLabel?: string;
}

/**
 * Sticky footer for pages with an explicit save. Appears only when something has
 * changed, so it never covers content the user is still reading.
 */
export function PageSaveBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  discardLabel = "Discard",
  dirtyLabel = "You have unsaved changes",
}: PageSaveBarProps) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-border bg-surface-elevated px-4 py-3 shadow-lg">
      <p className="text-sm text-muted-foreground">{dirtyLabel}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {discardLabel}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
