"use client";

/**
 * The only module that imports the docx engine.
 *
 * Kept separate from `DocxDocumentEditor` so the engine lands in one lazily
 * loaded chunk and nothing else. `@docx-editor.dev/core` is ~5 MB unpacked and
 * pulls HarfBuzz (WASM text shaping), an EMF converter and a TIFF decoder;
 * importing it from anywhere reachable at page load would put all of that in
 * front of every route in the app.
 *
 * Never import this directly — go through `DocxDocumentEditor`, which wraps it
 * in `next/dynamic({ ssr: false })`. The engine touches the DOM at module
 * scope, so a server render of this file throws.
 */

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { DocxEditor, type DocxEditorRef, useDocxEditor } from "@docx-editor.dev/react";
import { reviewModule } from "@docx-editor.dev/pro/react";
import { createBrowserAutomationHost } from "@docx-editor.dev/core/editor";
import "@docx-editor.dev/core/styles/editor.css";
import { applyAexyOps, type AexyDocxOp, type ApplyOpsResult } from "./docxOps";
import { resolveDocxFonts } from "./docxFonts";

/**
 * Licence key for the Pro review module, or undefined.
 *
 * The package never validates this and never touches the network — unlicensed
 * use is permitted for development and evaluation, and production use requires a
 * subscription. So an absent key changes nothing at runtime; it is a compliance
 * value, not a feature switch. Set it before this ships.
 */
const PRO_LICENSE_KEY = process.env.NEXT_PUBLIC_DOCX_EDITOR_LICENSE_KEY;

export type DocxCanvasMode = "edit" | "view" | "suggesting";

export interface DocxEditorCanvasHandle {
  /** Serialize the open document. Null before the engine has mounted. */
  save: () => Promise<ArrayBuffer | null>;
  /**
   * Replay an agent proposal's ops into the open document.
   *
   * In `'suggesting'` mode these land as tracked changes, which is the whole
   * point: the reviewer sees a redline they can accept or reject per change
   * rather than a document that has already been rewritten. Returns what was
   * applied and what could not be, because a partially-replayed proposal shown
   * as if it were complete is the failure worth avoiding.
   */
  applyOps: (ops: readonly AexyDocxOp[]) => ApplyOpsResult;
}

export interface DocxEditorCanvasProps {
  /** DOCX bytes. Identity change remounts the engine, so keep this stable. */
  document: ArrayBuffer;
  /**
   * `'suggesting'` records every edit as a tracked change (`w:ins`/`w:del`)
   * instead of applying it directly — the mode an AI proposal is reviewed in.
   *
   * Changing this after mount flows through to the live editor rather than
   * remounting it, so switching into review keeps the caret, the undo history
   * and any unsaved edits. Only `document` identity remounts the engine.
   */
  mode: DocxCanvasMode;
  title?: string;
  /** Shown in tracked changes and comments as the author of an edit. */
  author?: string;
  /**
   * Who an AI-drafted op is attributed to, when one is replayed.
   *
   * Separate from `author` on purpose. `author` is the person at the keyboard,
   * and using it for a replayed proposal would sign the AI's redline with the
   * name of whoever happened to open the review — the document would then claim
   * a reviewer wrote changes they were in the middle of judging.
   *
   * The workspace decides the label (`ai_author_label`), so a proposal drafted
   * last week adopts today's answer rather than carrying a name on the op.
   */
  aiAuthor?: string;
  locale?: string;
  colorMode?: "light" | "dark" | "system";
  /** Fired on every document mutation. Debounce before saving. */
  onDirty?: () => void;
  /** The chrome's own Save control, so ⌘S and File ▸ Save reach the host. */
  onSaveRequested?: () => void;
  handleRef?: React.RefObject<DocxEditorCanvasHandle | null>;
  className?: string;
}

export default function DocxEditorCanvas({
  document,
  mode,
  title,
  aiAuthor,
  author,
  locale,
  colorMode = "system",
  onDirty,
  onSaveRequested,
  handleRef,
  className,
}: DocxEditorCanvasProps) {
  const editorRef = useRef<DocxEditorRef | null>(null);
  // Set by the bridge below, which is the only place the live editor instance is
  // reachable from.
  const applyOpsRef = useRef<((ops: readonly AexyDocxOp[]) => ApplyOpsResult) | null>(
    null
  );
  // Read through a ref inside the bridge, so changing the label does not tear
  // down and rebuild the automation host — which would re-subscribe to document
  // changes for a string.
  const aiAuthorRef = useRef(aiAuthor);
  aiAuthorRef.current = aiAuthor;

  // Registered unconditionally: without it the engine renders revisions as a
  // final-state projection — an existing redline in an uploaded document would
  // be invisible rather than merely un-editable — and `'suggesting'` mode is not
  // reachable at all. Memoised because `modules` is sampled at mount and a new
  // array identity each render would be a remount per keystroke.
  const modules = useMemo(
    () => [reviewModule(PRO_LICENSE_KEY ? { licenseKey: PRO_LICENSE_KEY } : undefined)],
    []
  );

  // The parent owns saving but cannot reach the engine — it deliberately does
  // not import it. This is the one seam across the lazy boundary.
  useImperativeHandle(
    handleRef as React.RefObject<DocxEditorCanvasHandle>,
    () => ({
      save: async () => {
        const editor = editorRef.current;
        if (!editor) return null;
        return editor.save();
      },
      applyOps: (ops) => {
        const apply = applyOpsRef.current;
        if (!apply) {
          return {
            applied: 0,
            skipped: ops.map((op, index) => ({
              index,
              kind: op.kind,
              reason: "the editor is not ready",
            })),
          };
        }
        return apply(ops);
      },
    }),
    []
  );

  // `onChange` reports revision deltas, not bytes. Serializing here on every
  // keystroke would re-zip the whole document per character; the parent
  // debounces and then asks for bytes once.
  const handleChange = useCallback(() => {
    onDirty?.();
  }, [onDirty]);

  // ⌘S is muscle memory in a Word editor, and the browser's own Save-page
  // dialog appearing over a document is a jarring way to find out it is not
  // wired up.
  useEffect(() => {
    if (!onSaveRequested) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSaveRequested();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSaveRequested]);

  return (
    <DocxEditor
      ref={editorRef}
      document={document}
      mode={mode}
      modules={modules}
      // Decides layout FIDELITY, not appearance. Without a resolver the engine
      // measures with a fixed-width approximation, so wrap points and page
      // breaks are estimated; with it, they match Word. Sampled at mount
      // alongside `document`, so this identity must stay stable — it is a
      // module-level function, not a closure.
      fonts={resolveDocxFonts}
      title={title}
      author={author}
      locale={locale}
      colorMode={colorMode}
      onChange={handleChange}
      // Replaces File ▸ Save, whose default downloads the bytes. Here the
      // document lives in the workspace, so a download is the wrong outcome.
      onSave={onSaveRequested}
      className={className}
    >
      <OpsBridge applyRef={applyOpsRef} authorRef={aiAuthorRef} />
    </DocxEditor>
  );
}

/**
 * Renders nothing; exists to reach the live editor.
 *
 * `useDocxEditor()` reads the instance from the nearest `DocxEditor.Root`, and
 * the all-in-one `DocxEditor` renders that Root internally — so a child is
 * inside the context while the parent component is not. This is what lets the
 * ops bridge exist without migrating the whole canvas to the compound API.
 */
function OpsBridge({
  applyRef,
  authorRef,
}: {
  applyRef: React.RefObject<((ops: readonly AexyDocxOp[]) => ApplyOpsResult) | null>;
  authorRef: React.RefObject<string | undefined>;
}) {
  const editor = useDocxEditor();

  useEffect(() => {
    if (!editor) {
      applyRef.current = null;
      return;
    }
    // A host per replay would re-subscribe to changes each time; one per mounted
    // editor, disposed with it, is the lifetime the adapter documents.
    const host = createBrowserAutomationHost(editor);
    // The author is what makes an AI redline say it came from the AI. Without
    // it `applyAexyOps` falls back to a hardcoded default, and the workspace's
    // `ai_author_label` setting — which exists for exactly this — does nothing.
    applyRef.current = (ops) =>
      applyAexyOps(host, ops, { author: authorRef.current });
    return () => {
      applyRef.current = null;
      host.dispose();
    };
  }, [editor, applyRef]);

  return null;
}
