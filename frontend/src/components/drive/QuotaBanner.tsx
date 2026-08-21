"use client";

import { AlertTriangle, HardDrive } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { type DriveUsage } from "@/lib/api";

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// Three-stop ramp so the meter reads as status, not decoration. Kept in one
// place because the banner and the sidebar meter must agree on what
// "warning" means.
type QuotaLevel = "ok" | "warning" | "full";

function levelFor(percent: number): QuotaLevel {
  if (percent >= 100) return "full";
  if (percent >= 80) return "warning";
  return "ok";
}

const BAR_COLOR: Record<QuotaLevel, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  full: "bg-red-500",
};

const TEXT_COLOR: Record<QuotaLevel, string> = {
  ok: "text-foreground",
  warning: "text-amber-600 dark:text-amber-300",
  full: "text-red-600 dark:text-red-300",
};

/**
 * Storage meter for the Drive sidebar. Shows used / limit, a filled bar and
 * how much room is left — the number people actually want before a big
 * upload. Unlimited plans get the same frame without a bar.
 */
export function StorageMeter({ usage }: { usage: DriveUsage | undefined }) {
  const t = useTranslations("drive.page");
  if (!usage) return null;

  const percent = usage.unlimited
    ? 0
    : Math.min(100, Math.max(0, usage.percent_used));
  const level = levelFor(percent);
  const remaining = Math.max(0, usage.limit_bytes - usage.used_bytes);

  return (
    <div
      data-testid="drive-storage-meter"
      data-quota-level={usage.unlimited ? "unlimited" : level}
      className="rounded-lg border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5" />
          {t("storageHeading")}
        </span>
        <span className={cn("text-xs font-medium tabular-nums", TEXT_COLOR[level])}>
          {usage.unlimited
            ? t("unlimited")
            : t("percentUsed", { percent: percent.toFixed(0) })}
        </span>
      </div>

      {!usage.unlimited && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("storageHeading")}
        >
          <div
            className={cn("h-full rounded-full transition-all", BAR_COLOR[level])}
            style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }}
          />
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">
          {formatBytes(usage.used_bytes)}
        </span>
        {!usage.unlimited && ` ${t("ofLimit", { limit: formatBytes(usage.limit_bytes) })}`}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("filesCount", { count: usage.files_count })}
        {!usage.unlimited && (
          <> · {t("remaining", { size: formatBytes(remaining) })}</>
        )}
      </p>
    </div>
  );
}

export function QuotaBanner({ usage }: { usage: DriveUsage | undefined }) {
  const t = useTranslations("drive.quota");
  if (!usage || usage.unlimited) return null;
  if (usage.percent_used < 80) return null;
  const isFull = usage.percent_used >= 100;
  return (
    <div
      role={isFull ? "alert" : undefined}
      data-testid="drive-quota-banner"
      data-quota-state={isFull ? "full" : "warning"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        isFull
          ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200",
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {isFull ? (
          <>
            <strong>{t("limitReached")}</strong>{" "}
            {t("limitReachedDetail")}
          </>
        ) : (
          t("warning", {
            used: formatBytes(usage.used_bytes),
            limit: formatBytes(usage.limit_bytes),
            percent: usage.percent_used.toFixed(1),
          })
        )}
      </div>
    </div>
  );
}
