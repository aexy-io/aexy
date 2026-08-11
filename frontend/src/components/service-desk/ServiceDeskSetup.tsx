"use client";

/**
 * First-run setup for a Service Desk that has no taxonomy yet.
 *
 * Without this a brand-new desk showed an empty queue board: zero columns, no
 * tickets, and nothing explaining that stakeholders and request types are
 * per-workspace rows somebody has to choose. Picking a template here also creates
 * the departments its internal stakeholders route to, which matters more than it
 * looks — row-level visibility resolves through `Department.function_key`, so
 * without them every ticket is invisible to the team that owns it and the desk
 * appears broken rather than unconfigured.
 */

import { useState } from "react";
import { ArrowRight, Building2, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useIndustryTemplates, useServiceDeskMutations } from "@/hooks/useServiceDesk";
import type { IndustryTemplate } from "@/lib/service-desk-api";
import { cn } from "@/lib/utils";

export function ServiceDeskSetup({
  canManage,
  onComplete,
  onDismiss,
}: {
  canManage: boolean;
  /** Lets the parent keep this mounted so the confirmation is actually seen. */
  onComplete?: () => void;
  onDismiss?: () => void;
}) {
  const t = useTranslations("serviceDeskSetup");
  const { data: templates, isLoading } = useIndustryTemplates();
  const { applyIndustryTemplate } = useServiceDeskMutations();

  const [selected, setSelected] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ departments: string[] } | null>(null);

  const apply = async () => {
    if (!selected) return;
    try {
      const result = await applyIndustryTemplate.mutateAsync({
        template_slug: selected,
        // Adopt the template's vocabulary — the whole point of choosing one.
        apply_terminology: true,
        create_departments: true,
      });
      setApplied({ departments: result.departments_created });
      onComplete?.();
      toast.success(t("applied"));
    } catch {
      // the mutation surfaces the error as a toast
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  // Setup done. Point at the org rather than declaring victory: the departments
  // exist but have no heads or members yet, and until they do the visibility
  // rules still resolve to nobody.
  if (applied) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-6 text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="text-base font-semibold text-foreground">{t("done.title")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {applied.departments.length > 0
            ? t("done.withDepartments", { departments: applied.departments.join(", ") })
            : t("done.description")}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/organization/departments"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Building2 className="h-4 w-4" aria-hidden />
            {t("done.completeOrg")}
          </Link>
          <Link
            href="/settings/service-desk/master-data"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
          >
            {t("done.masterData")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => onDismiss?.()}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("done.viewDesk")}
          </button>
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface px-6 py-12 text-center">
        <h2 className="text-base font-semibold text-foreground">{t("notReady.title")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {t("notReady.description")}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(templates ?? []).map((template: IndustryTemplate) => {
          const isSelected = selected === template.slug;
          return (
            <button
              key={template.slug}
              type="button"
              onClick={() => setSelected(template.slug)}
              aria-pressed={isSelected}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface hover:border-border-strong"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{template.name}</span>
                {isSelected && (
                  <span className="rounded-full bg-primary p-0.5">
                    <Check className="h-3 w-3 text-primary-foreground" aria-hidden />
                  </span>
                )}
              </span>
              <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">
                {template.description}
              </span>

              {/* What the choice actually decides, so it isn't a blind pick. */}
              <span className="mt-3 block space-y-1 border-t border-border pt-3">
                <span className="block text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">{t("card.stakeholders")}:</span>{" "}
                  {template.stakeholders.map((s) => s.label).join(" · ")}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">{t("card.requestTypes")}:</span>{" "}
                  {template.request_types.map((r) => r.label).join(" · ")}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">{t("card.vocabulary")}:</span>{" "}
                  {[template.terminology.account, template.terminology.vendor, template.terminology.product]
                    .filter(Boolean)
                    .join(" / ")}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          onClick={apply}
          disabled={!selected || applyIndustryTemplate.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {applyIndustryTemplate.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {t("apply")}
        </button>
        <p className="text-center text-xs text-muted-foreground">{t("changeLater")}</p>
      </div>
    </div>
  );
}
