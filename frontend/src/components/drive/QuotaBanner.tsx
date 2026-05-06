"use client";

import { AlertTriangle } from "lucide-react";
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
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        isFull
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-200",
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
