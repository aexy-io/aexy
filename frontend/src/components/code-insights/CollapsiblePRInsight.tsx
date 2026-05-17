"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { PRInsightCard } from "./PRInsightCard";

interface Props {
  prId: string;
  /** Display label shown next to the toggle. Falls back to the i18n key. */
  label?: string;
}

/**
 * Lazy expand-on-click wrapper around `PRInsightCard`.
 *
 * The underlying card lazy-loads via React Query, but it does fire the
 * request as soon as it renders. Wrapping in a collapsed-by-default toggle
 * lets us embed AI insights in busy lists (e.g. sprint-task linked PRs)
 * without firing N requests on page open.
 */
export function CollapsiblePRInsight({ prId, label }: Props) {
  const t = useTranslations("aiInsights");
  const [open, setOpen] = useState(false);
  const buttonLabel = label ?? t("title");

  return (
    <div className="rounded-md border border-border bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Sparkles className="h-3 w-3 text-primary" />
        <span>{buttonLabel}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <PRInsightCard prId={prId} />
        </div>
      )}
    </div>
  );
}
