"use client";

/**
 * A Word document, opened where an Aexy document is opened.
 *
 * Owns everything except the engine itself: fetching bytes, debounced saving,
 * and what happens when two people save the same document. The engine is behind
 * `next/dynamic({ ssr: false })` because it is ~5 MB with a WASM text shaper and
 * touches the DOM at module scope — see `DocxEditorCanvas`.
 *
 * Conflict handling is the part worth reading. This editor holds the whole
 * document in memory, so it cannot merge: a save that lands on top of someone
 * else's would discard their work entirely, not just the overlapping part. So
 * every save carries the sha it was based on, a 409 stops autosave dead, and the
 * only way forward is an explicit reload that the person chooses. Retrying is
 * never the right answer here.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Cloud, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { documentApi, type ProposedEdit } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { useDocsAiSettings } from "@/hooks/useDocsAiSettings";
import { DocxProposalsBanner } from "./DocxProposalsBanner";
import type { DocxCanvasMode, DocxEditorCanvasHandle } from "./DocxEditorCanvas";
import type { ApplyOpsResult } from "./docxOps";

const DocxEditorCanvas = dynamic(() => import("./DocxEditorCanvas"), {
  // The engine reads `window` while its module initialises, so a server render
  // throws rather than degrading.
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center p-12">
      <Spinner />
    </div>
  ),
});

/** Long enough that a sentence is one save, short enough to feel automatic. */
const AUTOSAVE_DELAY_MS = 1500;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export interface DocxDocumentEditorProps {
  workspaceId: string;
  documentId: string;
  title: string;
  mode?: DocxCanvasMode;
  /** Author name recorded on tracked changes and comments. */
  author?: string;
  locale?: string;
  /** Chromeless embed (macOS app): the native shell renders its own header. */
  embedded?: boolean;
  breadcrumb?: React.ReactNode;
}

export function DocxDocumentEditor({
  workspaceId,
  documentId,
  title,
  mode = "edit",
  author,
  locale,
  embedded = false,
  breadcrumb,
}: DocxDocumentEditorProps) {
  const t = useTranslations("docs");
  const queryClient = useQueryClient();
  const canvasHandle = useRef<DocxEditorCanvasHandle | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  // The proposal currently replayed into the editor, if any. While one is open
  // the editor stays in suggesting mode so that *further* edits by the reviewer
  // are also marked up — a reviewer who fixes the agent's wording mid-review
  // should not have that fix land silently as untracked text.
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // Mirrors the conflict state as a ref, because the guards below run inside a
  // debounce callback. `saveState` there is whatever it was when that callback
  // was created: a save scheduled just before the conflict landed would read a
  // stale "dirty", pass the guard, and fire against a base sha already known to
  // be stale — the one thing this component must never do.
  const conflicted = useRef(false);

  // The sha the open copy is based on. Held in a ref, not state: it is read
  // inside the save path and must be the latest value there without the save
  // callback identity changing on every save (which would restart the debounce).
  const baseSha = useRef<string | null>(null);

  const {
    data: source,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["document", documentId, "docx-bytes"],
    queryFn: () => documentApi.getDocxBytes(workspaceId, documentId),
    enabled: Boolean(workspaceId && documentId),
    // Bytes are large and the engine remounts whenever their identity changes,
    // which would throw away the caret mid-edit. Refetch only on purpose.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (source?.sha !== undefined) {
      baseSha.current = source.sha;
    }
  }, [source?.sha]);

  const save = useMutation({
    mutationFn: (bytes: ArrayBuffer) =>
      documentApi.saveDocxBytes(workspaceId, documentId, bytes, baseSha.current),
    onSuccess: (document) => {
      baseSha.current = document.docx_content_sha;
      setSaveState("saved");
      // The row changed (size, sha, editor, version count) but the bytes in
      // this editor are already current, so the byte query is deliberately not
      // invalidated — doing so would remount the engine and lose the caret.
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      queryClient.invalidateQueries({
        queryKey: ["document", documentId, "versions"],
      });
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        // Stop here, and cancel anything already queued. Autosave must not keep
        // firing against a base that is known stale, and this editor cannot
        // merge.
        conflicted.current = true;
        if (timer.current) clearTimeout(timer.current);
        setSaveState("conflict");
        return;
      }
      setSaveState("error");
      toast.error(t("docx.saveFailed"));
    },
  });

  const flush = useCallback(async () => {
    if (!canvasHandle.current) return;
    // A conflict is resolved by reloading, not by saving again.
    if (conflicted.current) return;
    setSaveState("saving");
    const bytes = await canvasHandle.current.save();
    if (!bytes) {
      setSaveState("idle");
      return;
    }
    save.mutate(bytes);
  }, [save]);

  const handleDirty = useCallback(() => {
    if (conflicted.current) return;
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush();
    }, AUTOSAVE_DELAY_MS);
  }, [flush]);

  // A pending debounce holds the only copy of the last few seconds of typing.
  // Without this, navigating away one second after a keystroke loses it
  // silently — the worst kind of loss, because nothing reported a failure.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [saveState]);

  const { data: aiSettings } = useDocsAiSettings();

  const reviewProposal = useCallback(
    (proposal: ProposedEdit): ApplyOpsResult | undefined => {
      const ops = proposal.proposed_ops;
      if (!ops || ops.length === 0) return undefined;
      const result = canvasHandle.current?.applyOps(ops);
      // Marking dirty lets autosave persist the redline, which is deliberate: a
      // saved document with tracked changes in it is an ordinary Word state, and
      // it makes the review resumable — close the tab, come back, the markup is
      // still there. The alternative, holding the redline only in memory, loses
      // a half-finished review to any navigation and hides a pending proposal
      // from everyone else looking at the document.
      if (result && result.applied > 0) handleDirty();
      return result;
    },
    [handleDirty]
  );

  const reload = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    conflicted.current = false;
    setSaveState("idle");
    await refetch();
    queryClient.invalidateQueries({ queryKey: ["document", documentId] });
  }, [documentId, queryClient, refetch]);

  const currentReviewBanner = (
    <DocxProposalsBanner
      workspaceId={workspaceId}
      documentId={documentId}
      onReview={reviewProposal}
      reviewingId={reviewingId}
      onReviewingChange={setReviewingId}
    />
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Spinner />
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{t("docx.loadFailed")}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("docx.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!embedded && (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          <SaveIndicator state={saveState} onReload={() => void reload()} />
        </div>
      )}

      {!embedded && currentReviewBanner}

      {saveState === "conflict" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t("docx.conflict")}</span>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-900 px-2.5 py-1 text-xs font-medium text-amber-50 hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
          >
            <RefreshCw className="h-3 w-3" />
            {t("docx.reload")}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <DocxEditorCanvas
          document={source.bytes}
          // Three states, in priority order. A conflicted copy must not accept
          // more edits that can never be saved; read-only is how that becomes
          // visible rather than surprising. A proposal under review forces
          // suggesting mode so every edit — the agent's and the reviewer's —
          // is marked up.
          mode={
            saveState === "conflict"
              ? "view"
              : reviewingId
                ? "suggesting"
                : mode
          }
          title={title}
          author={author}
          // Not `author`. A replayed AI proposal signed with the reviewer's name
          // would have the document claim they wrote changes they were in the
          // middle of judging. The workspace names the AI; the fallback inside
          // `applyAexyOps` covers a workspace that has not.
          aiAuthor={aiSettings?.ai_author_label}
          locale={locale}
          handleRef={canvasHandle}
          onDirty={handleDirty}
          onSaveRequested={() => void flush()}
          className="h-full"
        />
      </div>
    </div>
  );
}

function SaveIndicator({
  state,
  onReload,
}: {
  state: SaveState;
  onReload: () => void;
}) {
  const t = useTranslations("docs");

  if (state === "conflict") {
    return (
      <button
        type="button"
        onClick={onReload}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        {t("docx.stale")}
      </button>
    );
  }

  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        {t("docx.saveFailed")}
      </span>
    );
  }

  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Cloud className="h-3.5 w-3.5 animate-pulse" />
        {t("docx.saving")}
      </span>
    );
  }

  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        {t("docx.saved")}
      </span>
    );
  }

  if (state === "dirty") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Cloud className="h-3.5 w-3.5" />
        {t("docx.unsaved")}
      </span>
    );
  }

  return null;
}
