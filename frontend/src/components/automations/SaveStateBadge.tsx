"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2, AlertCircle } from "lucide-react";

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Inline save indicator shown beside the automation name. Both the new-
 *  automation and edit-automation screens render it, so it lives here
 *  rather than being copied into each — a duplicated indicator drifts. */
export function SaveStateBadge({ state }: { state: SaveState }) {
  const t = useTranslations("automations");

  if (state === "idle") return null;

  return (
    <span className="flex items-center gap-1.5 text-xs" role="status" aria-live="polite">
      {state === "saving" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">{t("save.saving")}</span>
        </>
      )}
      {state === "saved" && (
        <>
          <Check className="h-3 w-3 text-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400">{t("save.saved")}</span>
        </>
      )}
      {state === "error" && (
        <>
          <AlertCircle className="h-3 w-3 text-red-500" />
          <span className="text-red-600 dark:text-red-400">{t("save.error")}</span>
        </>
      )}
    </span>
  );
}
