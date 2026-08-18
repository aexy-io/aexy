"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  AlertCircle,
  BellOff,
  CheckCircle2,
  FileText,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";

import type { ImpactItem } from "@/lib/api";
import { ImpactGuidance } from "./ImpactGuidance";

interface Props {
  item: ImpactItem;
  onDismiss: (documentId: string, reason?: string) => void;
  onUndismiss: (documentId: string) => void;
  onAskForUpdate: (documentId: string, templateCategory: string | null) => void;
  isBusy?: boolean;
}

/**
 * One affected page: what it describes, which of your files touched it, and what
 * in it is now suspect.
 *
 * Two-line layout from the start rather than one flex row. `MergedChanges`
 * carries a note about a row that came to 501px at a 375px viewport and had its
 * action clipped off the edge; this card holds strictly more (paths, a chip,
 * guidance, three actions), so the same row would fail harder.
 */
export function ImpactDocumentCard({
  item,
  onDismiss,
  onUndismiss,
  onAskForUpdate,
  isBusy,
}: Props) {
  const t = useTranslations("docs.impact");
  const [askingWhy, setAskingWhy] = useState(false);
  const [reason, setReason] = useState("");

  const dismissed = item.status === "dismissed";
  const hasScreenshots = item.screenshots.count > 0;
  // Did the server decide this change is one that could invalidate them? Not the
  // same question as "does the page have images".
  const mentionsScreenshots = item.guidance.some(
    (entry) => entry.id === "screenshots"
  );
  const primaryLink = item.links[0];
  // A page can be linked by several paths but only needs one sync mode to decide
  // whether asking for an update is even possible.
  const canAskForUpdate =
    item.links.some((link) => link.sync_mode !== "off") &&
    !item.proposal_id &&
    !dismissed;

  return (
    <li
      data-testid={`impact-card-${item.document_id}`}
      className={`rounded-lg border border-border px-3 py-2.5 ${
        dismissed ? "opacity-60" : ""
      }`}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        {item.document_icon && (
          <span className="shrink-0" aria-hidden>
            {item.document_icon}
          </span>
        )}
        <Link
          href={`/docs/${item.document_id}`}
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
        >
          {item.document_title}
        </Link>

        {item.status === "edited" && (
          <span
            data-testid={`impact-edited-${item.document_id}`}
            className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-success"
          >
            {t("statusEdited")}
          </span>
        )}
      </div>

      {item.links.map((link) => (
        <div key={link.code_link_id} className="mt-1 text-xs">
          <span className="text-muted-foreground">
            {t("describes", { path: link.path, branch: link.branch })}
          </span>
          {link.sync_mode === "off" && (
            <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
              <BellOff className="h-3 w-3" />
              {t("muted")}
            </span>
          )}
          {/* Named, not counted. "FilterBar.tsx changed" tells the author whether
              this is about them; "3 files changed" does not. */}
          <div
            data-testid={`impact-paths-${item.document_id}`}
            className="mt-0.5 font-mono text-[11px] text-muted-foreground"
          >
            {link.matched_paths.slice(0, 3).join(", ")}
            {link.matched_paths.length > 3 &&
              ` ${t("morePaths", { count: link.matched_paths.length - 3 })}`}
          </div>
        </div>
      ))}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {primaryLink?.has_pending_changes ? (
          <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">
            <AlertCircle className="h-3 w-3" />
            {t("behind")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-success" />
            {primaryLink?.last_synced_at
              ? t("inSync", {
                  date: new Date(primaryLink.last_synced_at).toLocaleDateString(),
                })
              : t("neverGenerated")}
          </span>
        )}

        {/* Only when the guidance actually fired. The count is a true fact about
            the page either way, but volunteering "3 screenshots" on a
            backend-only change implies a relevance the server just decided
            against — which is the generic reminder this feature exists instead
            of. The warning on the update button below is different: that is
            about what the *action* would do, not about this change. */}
        {hasScreenshots && mentionsScreenshots && (
          <span
            data-testid={`impact-screenshot-count-${item.document_id}`}
            className="text-[11px] text-muted-foreground"
          >
            {t("screenshotCount", { count: item.screenshots.count })}
          </span>
        )}
      </div>

      <ImpactGuidance guidance={item.guidance} />

      {dismissed && (
        <p
          data-testid={`impact-dismissed-${item.document_id}`}
          // Announced, because the visible feedback for saying "no update
          // needed" is this line appearing and the card fading — neither of
          // which reaches somebody who cannot see it.
          role="status"
          aria-live="polite"
          className="mt-2 text-xs text-muted-foreground"
        >
          {item.dismissed_by_name
            ? t("statusDismissed", { name: item.dismissed_by_name })
            : t("statusDismissedUnknown")}
          {item.dismiss_reason && (
            <span> {t("statusDismissedReason", { reason: item.dismiss_reason })}</span>
          )}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link
          href={`/docs/${item.document_id}`}
          data-testid={`impact-open-${item.document_id}`}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition hover:bg-accent"
        >
          <FileText className="h-3 w-3" />
          {t("open")}
        </Link>

        {item.proposal_id && (
          <Link
            href="/review"
            data-testid={`impact-proposal-${item.document_id}`}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-foreground transition hover:bg-accent"
          >
            <Sparkles className="h-3 w-3" />
            {t("seeProposal")}
          </Link>
        )}

        {canAskForUpdate && (
          <>
            {/* Demoted to a text link on a page with screenshots. A generated
                update rewrites the prose from source and drops every image —
                `markdown_to_tiptap` has no image case at all — so on exactly the
                pages this feature is about, this is the dangerous button. */}
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                onAskForUpdate(
                  item.document_id,
                  primaryLink?.template_category ?? null
                )
              }
              data-testid={`impact-ask-update-${item.document_id}`}
              title={
                hasScreenshots
                  ? t("askUpdateImageWarning", { count: item.screenshots.count })
                  : undefined
              }
              className={
                hasScreenshots
                  ? "text-xs text-muted-foreground underline decoration-dotted transition hover:text-foreground disabled:opacity-50"
                  : "inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-foreground transition hover:bg-accent disabled:opacity-50"
              }
            >
              {!hasScreenshots && <Sparkles className="h-3 w-3" />}
              {t("askUpdate")}
            </button>

            {hasScreenshots && (
              <span
                data-testid={`impact-image-warning-${item.document_id}`}
                className="w-full text-[11px] text-warning"
              >
                {t("askUpdateImageWarning", { count: item.screenshots.count })}
              </span>
            )}
          </>
        )}

        {dismissed ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onUndismiss(item.document_id)}
            data-testid={`impact-undo-${item.document_id}`}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            <Undo2 className="h-3 w-3" />
            {t("undo")}
          </button>
        ) : (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setAskingWhy((open) => !open)}
            aria-expanded={askingWhy}
            aria-controls={`dismiss-panel-${item.document_id}`}
            data-testid={`impact-dismiss-${item.document_id}`}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            {t("noUpdateNeeded")}
          </button>
        )}
      </div>

      {askingWhy && !dismissed && (
        <div
          id={`dismiss-panel-${item.document_id}`}
          className="mt-2 rounded border border-border bg-muted/30 p-2"
        >
          <label
            htmlFor={`reason-${item.document_id}`}
            className="text-[11px] text-muted-foreground"
          >
            {t("dismissReasonLabel")}
          </label>
          {/* autoFocus: the field is revealed by a click, so focus has to follow
              it — otherwise a keyboard user tabs straight past the input they
              just asked for. */}
          <input
            id={`reason-${item.document_id}`}
            data-testid={`impact-reason-${item.document_id}`}
            autoFocus
            value={reason}
            maxLength={280}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {/* Says plainly what this does not do. Dismissing here is per pull
                request; the page keeps its own out-of-date badge, and claiming
                otherwise would make the sidebar dot a lie. */}
            {t("noUpdateNeededHint")}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                onDismiss(item.document_id, reason.trim() || undefined);
                setAskingWhy(false);
                setReason("");
              }}
              data-testid={`impact-dismiss-confirm-${item.document_id}`}
              className="rounded bg-foreground px-2 py-1 text-xs font-medium text-background transition hover:opacity-90 disabled:opacity-50"
            >
              {t("noUpdateNeeded")}
            </button>
            <button
              type="button"
              onClick={() => {
                setAskingWhy(false);
                setReason("");
              }}
              className="text-xs text-muted-foreground transition hover:text-foreground"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
