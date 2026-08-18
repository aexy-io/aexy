"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, AlertTriangle, Columns, AlignLeft, RefreshCw } from "lucide-react";

import { ProposedEdit } from "@/lib/api";
import {
  DiffLine,
  collapseUnchanged,
  diffBlocks,
  extractBlocks,
} from "./documentDiff";

type DiffMode = "summary" | "unified" | "side-by-side";

/** One block of a document, styled by its heading level. */
function BlockText({ text, level }: { text: string; level: number }) {
  if (level > 0) {
    return (
      <div
        className="font-semibold text-foreground"
        style={{ fontSize: `${Math.max(0.75, 0.95 - level * 0.05)}rem` }}
      >
        {text}
      </div>
    );
  }
  return <div className="text-xs text-foreground">{text}</div>;
}

function DocumentText({ blocks }: { blocks: { text: string; level: number }[] }) {
  const t = useTranslations("docs.diff");
  if (!blocks.length) {
    return <p className="text-xs text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <div className="space-y-1.5">
      {blocks.map((block, index) => (
        <BlockText key={index} text={block.text} level={block.level} />
      ))}
    </div>
  );
}

/**
 * The unified diff.
 *
 * Colour is not the only signal — every changed line carries a + or − so the
 * view survives a reviewer who cannot distinguish the two greens, and so it
 * still reads when copied out as plain text.
 */
function DiffBody({
  lines,
}: {
  lines: (DiffLine | { type: "gap"; count: number })[];
}) {
  const t = useTranslations("docs.diff");
  if (!lines.length) {
    return (
      <p className="text-xs text-muted-foreground">{t("noWordingChanged")}</p>
    );
  }
  return (
    <div className="space-y-0.5">
      {lines.map((line, index) => {
        if (line.type === "gap") {
          return (
            <div
              key={index}
              data-testid="diff-gap"
              className="text-[11px] text-muted-foreground py-1 pl-4 border-l-2 border-dashed border-border"
            >
              {t("unchangedBlocks", { count: line.count })}
            </div>
          );
        }
        const marker =
          line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";
        const tone =
          line.type === "added"
            ? "bg-success/10 border-success/50"
            : line.type === "removed"
              ? "bg-destructive/10 border-destructive/50"
              : "border-transparent";
        return (
          <div
            key={index}
            data-testid={`diff-line-${line.type}`}
            className={`flex gap-2 px-2 py-0.5 rounded border-l-2 ${tone}`}
          >
            <span
              aria-hidden
              className="font-mono text-xs text-muted-foreground shrink-0 select-none"
            >
              {marker}
            </span>
            <BlockText text={line.text} level={line.level} />
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  proposal: ProposedEdit;
  /** The document as it stands. Without it there is nothing to diff against,
   *  and the review degrades to reading the proposal on its own — which is
   *  what the JSON dump used to be. */
  currentContent?: unknown;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  /** Optional: regenerate against the current document base. Only
   *  meaningful when the proposal is stale — the FE banner caller
   *  is expected to wire this to documentApi.generate, which creates
   *  a fresh proposal that auto-supersedes the stale one. */
  onRegenerate?: () => void;
  isPending?: boolean;
}

/**
 * Diff view for a single proposed edit.
 *
 * UX (per the Part B plan):
 *   - DEFAULT: "section summary" — sections added / removed /
 *     headings changed (cheap, scannable).
 *   - EXPAND: "View full diff" toggles between unified and
 *     side-by-side modes.
 *   - STALE: when `proposal.is_stale` is true, render the merge-
 *     conflict UI — three explicit actions: apply anyway,
 *     regenerate, reject. We currently surface the message + force
 *     the user to opt into Approve; "regenerate" is left as a TODO
 *     follow-up (it'd refire the source's generation pipeline
 *     against the new base content sha).
 */
export function ProposedEditReview({
  proposal,
  currentContent,
  onApprove,
  onReject,
  onRegenerate,
  isPending,
}: Props) {
  const t = useTranslations("docs.diff");
  const [mode, setMode] = useState<DiffMode>("summary");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const currentBlocks = useMemo(
    () => extractBlocks(currentContent),
    [currentContent]
  );
  const proposedBlocks = useMemo(
    () => extractBlocks(proposal.proposed_content),
    [proposal.proposed_content]
  );
  // Null when either document is too long to diff in the browser; the section
  // summary is the better view at that size anyway.
  const diff = useMemo(
    () => diffBlocks(currentBlocks, proposedBlocks),
    [currentBlocks, proposedBlocks]
  );
  const tooLargeMessage = t("tooLarge");
  const [rejectReason, setRejectReason] = useState("");

  const summary = proposal.diff_summary ?? {};
  const sectionsAdded = summary.sections_added ?? [];
  const sectionsRemoved = summary.sections_removed ?? [];
  const headingsChanged = summary.headings_changed ?? [];

  return (
    <div
      data-testid="proposed-edit-review"
      className="border border-border rounded-md bg-background/60 overflow-hidden"
    >
      {proposal.is_stale && (
        <div
          data-testid="stale-conflict-banner"
          className="flex items-start gap-2 px-3 py-2 bg-warning/10 border-b border-warning/30"
        >
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-foreground">
            <div className="font-medium">
              This proposal is out of date with the current document.
            </div>
            <div className="text-muted-foreground">
              The document has been edited since the AI proposed this change.
              Apply anyway if you want to overwrite, or reject and regenerate
              for a fresh proposal that knows about your edits.
            </div>
          </div>
        </div>
      )}

      {/* Diff mode toggle */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/50 text-xs">
        <span className="text-muted-foreground mr-2">Diff:</span>
        <button
          type="button"
          data-testid="diff-mode-summary"
          onClick={() => setMode("summary")}
          className={`px-2 py-0.5 rounded transition ${
            mode === "summary"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Summary
        </button>
        <button
          type="button"
          data-testid="diff-mode-unified"
          onClick={() => setMode("unified")}
          className={`px-2 py-0.5 rounded transition inline-flex items-center gap-1 ${
            mode === "unified"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlignLeft className="h-3 w-3" />
          Unified
        </button>
        <button
          type="button"
          data-testid="diff-mode-side-by-side"
          onClick={() => setMode("side-by-side")}
          className={`px-2 py-0.5 rounded transition inline-flex items-center gap-1 ${
            mode === "side-by-side"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Columns className="h-3 w-3" />
          Side-by-side
        </button>
      </div>

      <div className="p-3">
        {mode === "summary" && (
          <DiffSummary
            sectionsAdded={sectionsAdded}
            sectionsRemoved={sectionsRemoved}
            headingsChanged={headingsChanged}
          />
        )}
        {mode === "unified" && (
          <div data-testid="diff-unified-view" className="max-h-96 overflow-auto">
            {diff ? (
              <DiffBody lines={collapseUnchanged(diff)} />
            ) : (
              <p className="text-xs text-muted-foreground">
                {tooLargeMessage}
              </p>
            )}
          </div>
        )}
        {mode === "side-by-side" && (
          <div
            data-testid="diff-side-by-side-view"
            className="grid grid-cols-2 gap-2"
          >
            <div className="bg-muted/30 rounded p-2 max-h-96 overflow-auto">
              <div className="text-muted-foreground text-xs mb-1">{t("current")}</div>
              <DocumentText blocks={currentBlocks} />
            </div>
            <div className="bg-muted/30 rounded p-2 max-h-96 overflow-auto">
              <div className="text-muted-foreground text-xs mb-1">{t("proposed")}</div>
              <DocumentText blocks={proposedBlocks} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/50 bg-muted/20">
        {/* Regenerate-against-new-base lives only on stale proposals.
            The new proposal supersedes this one via the backend's
            supersede-on-create logic. */}
        {proposal.is_stale && onRegenerate && !showRejectForm && (
          <button
            type="button"
            data-testid="regenerate-button"
            disabled={isPending}
            onClick={onRegenerate}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-foreground bg-muted border border-border hover:bg-accent rounded disabled:opacity-50"
            title="Re-run the source pipeline against the current document"
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </button>
        )}
        {showRejectForm ? (
          <>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional)"
              data-testid="reject-reason-input"
              className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:border-primary-500"
            />
            <button
              type="button"
              onClick={() => setShowRejectForm(false)}
              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="reject-confirm-button"
              disabled={isPending}
              onClick={() => onReject(rejectReason || undefined)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              Reject
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid="reject-button"
              onClick={() => setShowRejectForm(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
            >
              <X className="h-3 w-3" />
              Reject
            </button>
            <button
              type="button"
              data-testid="approve-button"
              disabled={isPending}
              onClick={onApprove}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              {proposal.is_stale ? "Apply anyway" : "Approve"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DiffSummary({
  sectionsAdded,
  sectionsRemoved,
  headingsChanged,
}: {
  sectionsAdded: string[];
  sectionsRemoved: string[];
  headingsChanged: string[];
}) {
  const empty =
    sectionsAdded.length === 0 &&
    sectionsRemoved.length === 0 &&
    headingsChanged.length === 0;

  if (empty) {
    return (
      <div data-testid="diff-summary-empty" className="text-xs text-muted-foreground">
        No section summary available for this proposal. Switch to Unified or
        Side-by-side to inspect the full content.
      </div>
    );
  }

  return (
    <div data-testid="diff-summary" className="space-y-2 text-xs">
      {sectionsAdded.length > 0 && (
        <SummaryRow label="Adds" items={sectionsAdded} tone="success" />
      )}
      {sectionsRemoved.length > 0 && (
        <SummaryRow label="Removes" items={sectionsRemoved} tone="destructive" />
      )}
      {headingsChanged.length > 0 && (
        <SummaryRow label="Changes" items={headingsChanged} tone="info" />
      )}
    </div>
  );
}

function SummaryRow({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "success" | "destructive" | "info";
}) {
  const toneClasses = {
    success: "text-success",
    destructive: "text-destructive",
    info: "text-foreground",
  }[tone];
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className={`font-medium ${toneClasses}`}>{label}:</span>
      {items.map((it, i) => (
        <span
          key={`${label}-${i}`}
          className="px-1.5 py-0.5 bg-muted/40 rounded text-foreground"
        >
          {it}
        </span>
      ))}
    </div>
  );
}
