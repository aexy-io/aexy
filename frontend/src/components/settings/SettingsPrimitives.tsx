"use client";

/**
 * Settings-flavoured names for the shared page primitives.
 *
 * These were the originals. They were written for the settings pages, where all
 * 38 of them at the time hand-rolled their own chrome and diverged into four
 * page-title sizes, six competing `max-w-*` values, eighteen copies of the same
 * `bg-card rounded-xl border` block and two unrelated treatments for "loading".
 *
 * The rest of the app had the identical problem at seven times the scale, so the
 * implementations moved to `components/ui/page.tsx` and this file became
 * aliases. Nothing here forks: a change to a shared primitive reaches settings
 * too, which is the point. The 58 files importing these names are left alone
 * rather than churned through a rename that would buy nothing.
 *
 * New code outside settings should import from `@/components/ui/page` directly.
 */

import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import {
  PageShell,
  PageHeader,
  PageSection,
  PageSections,
  PageRow,
  PageRowGroup,
  ChoiceCard,
  PageEmpty,
  PageSkeleton,
  PageSaveBar,
  type Breadcrumb,
  type PageWidth,
} from "@/components/ui/page";

export type SettingsBreadcrumb = Breadcrumb;

interface SettingsPageProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: SettingsBreadcrumb[];
  /**
   * `form` (default) keeps a comfortable reading measure for label/control
   * pairs; `wide` opts out for pages whose content is genuinely a table.
   *
   * The default differs from `PageShell`, which is `wide`. Settings is mostly
   * forms and the rest of the app mostly is not, and changing it here would
   * silently re-lay-out 56 pages.
   */
  width?: Extract<PageWidth, "form" | "wide">;
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
    // `flush`: SettingsShell already supplies the surrounding padding.
    <PageShell width={width} flush>
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        breadcrumbs={breadcrumbs}
      />
      <PageSections>{children}</PageSections>
    </PageShell>
  );
}

export const SettingsSection = PageSection;
export const SettingsRow = PageRow;
export const SettingsRowGroup = PageRowGroup;
export const SettingsChoiceCard = ChoiceCard;
export const SettingsEmptyState = PageEmpty;
export const SettingsSaveBar = PageSaveBar;

/** Settings keeps a header-less skeleton: SettingsShell already draws the title. */
export function SettingsSkeleton({ rows = 3 }: { rows?: number }) {
  return <PageSkeleton rows={rows} header={false} width="form" />;
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
