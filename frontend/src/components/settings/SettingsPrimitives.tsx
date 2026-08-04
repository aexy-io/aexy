"use client";

/**
 * The shared building blocks for every Settings page.
 *
 * Before these existed, all 38 settings pages hand-rolled their own chrome. The
 * results diverged in every dimension that matters to whether an app looks
 * finished: four different page-title sizes (`text-2xl bold`, `text-2xl
 * semibold`, `text-xl semibold`, `text-lg semibold`), six competing per-page
 * `max-w-*` values fighting the shell's own width, eighteen copies of the same
 * `bg-card rounded-xl border` block, and two unrelated treatments for "loading"
 * (17 bespoke skeletons, 22 spinners).
 *
 * One note on colour. `--card` and `--background` are the *same* value in dark
 * mode, so the old `bg-card` sections had no elevation at all — they read as flat
 * page background with a hairline around them. Sections here sit on `bg-surface`,
 * which is genuinely lighter, so the page has an actual visual hierarchy.
 */

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Check, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- page shell

export interface SettingsBreadcrumb {
  label: string;
  href?: string;
}

interface SettingsPageProps {
  title: string;
  description?: string;
  /** Rendered top-right — the page's primary action ("Add repository", "Invite"). */
  actions?: React.ReactNode;
  /**
   * Trail above the title. Sub-pages (`access/logs`, `projects/[id]/oncall`)
   * were unreachable-feeling because only 7 of 38 pages showed where they sat.
   */
  breadcrumbs?: SettingsBreadcrumb[];
  /**
   * `form` (default) keeps a comfortable reading measure for label/control
   * pairs. `wide` opts out for pages whose content is genuinely a table.
   * This replaces per-page `max-w-*`, which fought the shell and left a large
   * dead margin on the right at desktop widths.
   */
  width?: "form" | "wide";
  children: React.ReactNode;
}

export function SettingsPage({
  title,
  description,
  actions,
  breadcrumbs,
  width = "form",
  children,
}: SettingsPageProps) {
  return (
    <div className={cn("mx-auto w-full", width === "form" ? "max-w-3xl" : "max-w-6xl")}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-foreground transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground max-w-prose">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>

      <div className="space-y-5 pb-16">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------- section

interface SettingsSectionProps {
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

export function SettingsSection({
  title,
  description,
  actions,
  footer,
  flush = false,
  className,
  children,
}: SettingsSectionProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-surface",
        className
      )}
    >
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground max-w-prose">{description}</p>
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

// ----------------------------------------------------------------- form row

interface SettingsRowProps {
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

export function SettingsRow({
  label,
  description,
  htmlFor,
  control,
  children,
  className,
}: SettingsRowProps) {
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
          className={cn(
            "block text-sm font-medium text-foreground",
            htmlFor && "cursor-pointer"
          )}
        >
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground max-w-prose">{description}</p>
        )}
        {children}
      </div>
      {control && <div className="shrink-0 sm:max-w-xs sm:text-right">{control}</div>}
    </div>
  );
}

/** Hairline between consecutive rows in one section. */
export function SettingsRowGroup({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>;
}

// -------------------------------------------------------------- choice card

interface SettingsChoiceCardProps {
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
export function SettingsChoiceCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  disabled = false,
  children,
  className,
}: SettingsChoiceCardProps) {
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
          : "border-border bg-background/40 hover:border-border-strong hover:bg-background/70",
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

      {description && (
        <span className="mt-2 text-sm text-muted-foreground">{description}</span>
      )}
      {children}
    </button>
  );
}

// ------------------------------------------------------------ empty / loading

export function SettingsEmptyState({
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
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * One loading treatment for the whole area. Skeleton rows rather than a spinner:
 * settings pages load a known shape, so showing that shape avoids the layout
 * jump a centred spinner guarantees.
 */
export function SettingsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading settings…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface">
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
  );
}

// ------------------------------------------------------------------ save bar

interface SettingsSaveBarProps {
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
 *
 * Pages that persist immediately should use `SettingsAutosaveHint` instead —
 * previously each page invented its own footnote about whether it had saved.
 */
export function SettingsSaveBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  discardLabel = "Discard",
  dirtyLabel = "You have unsaved changes",
}: SettingsSaveBarProps) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface-elevated px-4 py-3 shadow-lg">
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

/**
 * Shown when someone reaches a settings page they may not open.
 *
 * Hiding a page from the sidebar is not access control — the URL still resolves,
 * and before this the page simply rendered and then failed in a dozen small ways
 * as its API calls 403'd. This says plainly what is missing and who can grant it,
 * because "nothing happened" is the worst possible answer to a permissions
 * problem.
 */
export function SettingsAccessDenied({
  title = "You don't have access to this page",
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <section className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {detail ??
            "Ask a workspace owner or admin to grant you access. They can do that from Settings → Organization Roles."}
        </p>
        <Link
          href="/settings"
          className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
        >
          Back to settings
        </Link>
      </section>
    </div>
  );
}

/** The counterpart for autosaving pages: one consistent phrasing. */
export function SettingsAutosaveHint({ children }: { children?: React.ReactNode }) {
  return <>{children ?? "Changes are saved automatically."}</>;
}
