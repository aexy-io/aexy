"use client";

import { useTranslations, useLocale } from "next-intl";
import { Camera, Terminal, Settings2 } from "lucide-react";

import type { ImpactGuidance as Guidance } from "@/lib/api";

interface Props {
  guidance: Guidance[];
}

/**
 * Turns the server's guidance ids into sentences, in the reader's language.
 *
 * The server sends `{id, params}` and never prose — that separation is the only
 * reason this can be translated at all. The nearest thing in the product that
 * did the opposite is `/review`, whose group headings are server-rendered
 * English and are therefore stuck that way.
 *
 * `route` is rendered as a sub-line of `screenshots` rather than its own bullet.
 * On its own, "your change touched /tickets" tells the author nothing they did
 * not already know — they wrote it. Under a screenshot count it says something
 * specific: that is the screen the images show.
 */
export function ImpactGuidance({ guidance }: Props) {
  const t = useTranslations("docs.impact.guidance");
  const locale = useLocale();

  if (guidance.length === 0) return null;

  // Intl rather than join(", "): a list reads differently in every language, and
  // the whole point of sending params was to let the client decide.
  const list = (items: unknown[]) =>
    new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
      items.map(String)
    );

  const screenshots = guidance.find((entry) => entry.id === "screenshots");
  const route = guidance.find((entry) => entry.id === "route");

  return (
    <ul data-testid="impact-guidance" className="mt-2 space-y-1.5">
      {screenshots && (
        <li
          data-testid="impact-guidance-screenshots"
          className="flex gap-2 text-xs"
        >
          <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="min-w-0">
            <span className="text-foreground">
              {(screenshots.params.headings as string[] | undefined)?.length
                ? t("screenshots", {
                    count: Number(screenshots.params.count ?? 0),
                    headings: list(
                      screenshots.params.headings as string[]
                    ),
                  })
                : /* No heading to name — an image before the first one, which is
                     ordinary in a short page. The shorter sentence rather than a
                     dangling "under". */
                  t("screenshotsNoHeading", {
                    count: Number(screenshots.params.count ?? 0),
                  })}
            </span>

            {route && (
              <span
                data-testid="impact-guidance-route"
                className="mt-0.5 block text-muted-foreground"
              >
                {t("route", {
                  routes: list(route.params.routes as string[]),
                })}
              </span>
            )}

            {(screenshots.params.labels as string[] | undefined)?.length ? (
              <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                {list(screenshots.params.labels as string[])}
              </span>
            ) : null}
          </span>
        </li>
      )}

      {guidance
        .filter((entry) => entry.id === "apiSurface")
        .map((entry) => (
          <li
            key={entry.id}
            data-testid="impact-guidance-apiSurface"
            className="flex gap-2 text-xs"
          >
            <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 text-foreground">
              {t("apiSurface", {
                paths: list((entry.params.paths as string[]) ?? []),
              })}
            </span>
          </li>
        ))}

      {guidance
        .filter((entry) => entry.id === "setup")
        .map((entry) => (
          <li
            key={entry.id}
            data-testid="impact-guidance-setup"
            className="flex gap-2 text-xs"
          >
            <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 text-foreground">
              {t("setup", {
                paths: list((entry.params.paths as string[]) ?? []),
              })}
            </span>
          </li>
        ))}
    </ul>
  );
}
