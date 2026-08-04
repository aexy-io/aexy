"use client";

/**
 * What to do before your first campaign — as four steps that know whether they
 * are done.
 *
 * The empty state this replaces listed the same four steps as prose. They were
 * structurally incapable of being links (`EmptyStateStep` has no href field) and
 * were passed no `completed` values, so they rendered identically whether or not
 * the workspace had a domain, a template or a subscriber — and the only button
 * skipped all four and opened the campaign wizard, which would then let someone
 * build a campaign it could not send.
 *
 * The ordering is the module's own claim, restored: a sending domain first,
 * because nothing can go out without one.
 */

import Link from "next/link";
import { AlertTriangle, Check, Clock, Mail, Send, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useEmailMarketingSetup, type StepState } from "@/hooks/useEmailMarketingSetup";
import { cn } from "@/lib/utils";

const STATE_ICON: Record<StepState, React.ReactNode> = {
  done: <Check className="h-3.5 w-3.5" aria-hidden />,
  pending: <Clock className="h-3.5 w-3.5" aria-hidden />,
  todo: null,
};

function Step({
  index,
  state,
  title,
  description,
  href,
  cta,
}: {
  index: number;
  state: StepState;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          state === "done" && "bg-emerald-500/15 text-emerald-500",
          state === "pending" && "bg-amber-500/15 text-amber-500",
          state === "todo" && "bg-muted text-muted-foreground"
        )}
        aria-hidden
      >
        {STATE_ICON[state] ?? index}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            state === "done" ? "text-muted-foreground line-through" : "text-foreground"
          )}
        >
          {title}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>

      {state !== "done" && (
        <Link
          href={href}
          className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          {cta}
        </Link>
      )}
    </li>
  );
}

export function EmailMarketingSetup({ workspaceId }: { workspaceId: string | null }) {
  const t = useTranslations("emailMarketingSetup");
  const setup = useEmailMarketingSetup(workspaceId);

  const blocked = !setup.isReadyToSend;

  return (
    <div className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-5 text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Mail className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {blocked ? t("subtitleBlocked") : t("subtitleReady")}
        </p>
      </div>

      <ul className="divide-y divide-border px-6 py-2">
        <Step
          index={1}
          state={setup.domain.state}
          title={t("steps.domain.title")}
          description={
            setup.domain.state === "pending"
              ? t("steps.domain.pending", {
                  domain: setup.domain.awaitingVerification[0]?.domain ?? "",
                })
              : t("steps.domain.description")
          }
          href="/settings/email-marketing"
          cta={setup.domain.state === "pending" ? t("steps.domain.verify") : t("steps.domain.cta")}
        />
        <Step
          index={2}
          state={setup.provider.state}
          title={t("steps.provider.title")}
          description={
            setup.provider.state === "pending"
              ? t("steps.provider.pending")
              : t("steps.provider.description")
          }
          href="/settings/email-marketing"
          cta={setup.provider.state === "pending" ? t("steps.provider.test") : t("steps.provider.cta")}
        />
        <Step
          index={3}
          state={setup.template.state}
          title={t("steps.template.title")}
          description={t("steps.template.description")}
          href="/email-marketing/templates/new"
          cta={t("steps.template.cta")}
        />
        <Step
          index={4}
          state={setup.audience.state}
          title={t("steps.audience.title")}
          description={t("steps.audience.description")}
          href="/crm/person"
          cta={t("steps.audience.cta")}
        />
      </ul>

      <div className="flex flex-col items-center gap-2 border-t border-border px-6 py-5">
        {blocked ? (
          <>
            <Link
              href="/settings/email-marketing"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {t("primaryBlocked")}
            </Link>
            {/* Drafting while DNS propagates is legitimate — propagation can take
                a day — so this stays available, and says what it will produce. */}
            <Link
              href="/email-marketing/campaigns/new"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t("secondaryBlocked")}
            </Link>
          </>
        ) : (
          <Link
            href="/email-marketing/campaigns/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Send className="h-4 w-4" aria-hidden />
            {t("primaryReady")}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * The banner form, for the wizard and the campaign detail page: same source of
 * truth, no second opinion about whether a sender is ready.
 */
export function SenderNotReadyBanner({
  workspaceId,
  className,
}: {
  workspaceId: string | null;
  className?: string;
}) {
  const t = useTranslations("emailMarketingSetup");
  const setup = useEmailMarketingSetup(workspaceId);

  if (setup.isLoading || setup.isReadyToSend) return null;

  const pending = setup.domain.awaitingVerification[0];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3",
        className
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-foreground">
          {pending ? t("banner.pendingTitle", { domain: pending.domain }) : t("banner.title")}
        </p>
        <p className="mt-0.5 text-muted-foreground">{t("banner.detail")}</p>
      </div>
      <Link
        href="/settings/email-marketing"
        className="shrink-0 self-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        {t("banner.cta")}
      </Link>
    </div>
  );
}
