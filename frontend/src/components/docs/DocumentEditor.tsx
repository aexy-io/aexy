"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import { InlineDatabase } from "./extensions/InlineDatabase";
import { SlashCommands } from "./extensions/SlashCommands";
import { CommentAnchor, anchorIdsInDoc, newAnchorId } from "./extensions/CommentAnchor";
import { DocumentCommentRail, type PendingAnchor } from "./DocumentCommentRail";
import { EditorToolbar } from "./EditorToolbar";
import { DocumentEmptyState } from "./DocumentEmptyState";
import { debounce } from "@/lib/utils";
import { useTemplates } from "@/hooks/useDocuments";
import type { DocumentTemplate } from "@/lib/api";
import {
  Check,
  Cloud,
  Smile,
} from "lucide-react";

const lowlight = createLowlight(common);

// Common emoji options for documents
const EMOJI_OPTIONS = ["📄", "📝", "📋", "📌", "📎", "🎯", "💡", "🚀", "⭐", "🔥", "✨", "📊", "🗂️", "📁", "🏷️", "🔖"];

type EditorMode = "rich" | "markdown";

interface DocumentEditorProps {
  content: Record<string, unknown>;
  title: string;
  icon?: string | null;
  onSave: (data: { title?: string; content?: Record<string, unknown>; icon?: string }) => void;
  onTitleChange?: (title: string) => void;
  isLoading?: boolean;
  readOnly?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
  breadcrumb?: React.ReactNode;
  /** Chromeless embed (macOS app): hide the title/breadcrumb header; the native
   * app shows the title. The toolbar + content still render. */
  embedded?: boolean;
  /** Enables the template empty state. Omitted in the embed, which is a reader. */
  workspaceId?: string | null;
  /** Enables anchored comments. Omitted in the embed, which cannot comment. */
  documentId?: string | null;
}

export function DocumentEditor({
  content,
  title,
  icon,
  onSave,
  onTitleChange,
  isLoading = false,
  readOnly = false,
  autoSave = true,
  autoSaveDelay = 1000,
  breadcrumb,
  embedded = false,
  workspaceId,
  documentId,
}: DocumentEditorProps) {
  const [localTitle, setLocalTitle] = useState(title);
  const [localIcon, setLocalIcon] = useState(icon || "📄");
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const [markdownContent, setMarkdownContent] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
  // Which anchors the document still carries. Read from the editor rather than the
  // saved content so a thread whose text was just deleted becomes unanchored
  // immediately, not after the next save.
  const [liveAnchorIds, setLiveAnchorIds] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Commenting needs a document to attach to and a reader who may write.
  const commentsEnabled = Boolean(workspaceId && documentId && !readOnly);
  const { createTemplate } = useTemplates(workspaceId ?? null);

  // Use ref for initial content to prevent editor recreation
  const initialContentRef = useRef(content);
  const onSaveRef = useRef(onSave);

  // Keep onSave ref updated
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Update local title when prop changes
  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  // Update local icon when prop changes
  useEffect(() => {
    setLocalIcon(icon || "📄");
  }, [icon]);


  // Escape closes the emoji picker. Audit caught the picker staying
  // open through multiple intermediate actions because only the
  // backdrop click and the toggle button were wired.
  useEffect(() => {
    if (!showEmojiPicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowEmojiPicker(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showEmojiPicker]);

  // Create stable debounced save function
  const debouncedSave = useMemo(
    () =>
      debounce((data: { title?: string; content?: Record<string, unknown>; icon?: string }) => {
        setIsSaving(true);
        onSaveRef.current(data);
        setTimeout(() => {
          setIsSaving(false);
          setShowSaved(true);
          setTimeout(() => setShowSaved(false), 2000);
        }, 500);
      }, autoSaveDelay),
    [autoSaveDelay]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing your document...",
        emptyEditorClass: "is-editor-empty",
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary-400 hover:text-primary-300 underline cursor-pointer",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full h-auto my-4",
        },
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: "not-prose pl-0",
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: "flex items-start gap-2",
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "border-collapse table-auto w-full",
        },
      }),
      TableRow,
      TableCell.configure({
        HTMLAttributes: {
          class: "border border-border p-2",
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: "border border-border p-2 bg-muted font-semibold",
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Typography,
      Underline,
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: "bg-background rounded-lg p-4 font-mono text-sm overflow-x-auto",
        },
      }),
      Markdown.configure({
        html: true,
        tightLists: true,
        bulletListMarker: "-",
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      InlineDatabase,
      SlashCommands,
      CommentAnchor,
    ],
    content: initialContentRef.current,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // `max-w-none` was the audit's reading-measure finding —
        // paragraphs ran ~140cpl on a 1440 viewport. Cap at max-w-3xl
        // (~672px, ~65cpl) and centre inside the editor canvas. The
        // arbitrary-variant `[&_ul]:list-disc` etc. is used instead of
        // the typography-plugin `prose-ul:` modifier because the
        // outer ProseMirror class also has a long inline className
        // (DocumentEditor.tsx:411) where Tailwind's preflight reset
        // would otherwise win the cascade and strip bullets.
        class:
          "prose dark:prose-invert max-w-3xl mx-auto focus:outline-none min-h-[500px] px-4 py-2 prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1",
      },
    },
    onUpdate: ({ editor }) => {
      setLiveAnchorIds(anchorIdsInDoc(editor.getJSON()));
      if (autoSave && !readOnly) {
        debouncedSave({ content: editor.getJSON() as Record<string, unknown> });
      }
    },
  });

  // Seed the live anchor set from the document as loaded. Without this every
  // thread reads as unanchored until the first keystroke fires `onUpdate`.
  useEffect(() => {
    if (editor) setLiveAnchorIds(anchorIdsInDoc(editor.getJSON()));
  }, [editor]);

  // Handle title change
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setLocalTitle(newTitle);
      onTitleChange?.(newTitle);
      if (autoSave) {
        debouncedSave({ title: newTitle });
      }
    },
    [onTitleChange, autoSave, debouncedSave]
  );

  // Handle title blur (save immediately)
  const handleTitleBlur = useCallback(() => {
    if (localTitle !== title) {
      onSaveRef.current({ title: localTitle });
    }
  }, [localTitle, title]);

  // Handle icon change
  const handleIconChange = useCallback(
    (newIcon: string) => {
      setLocalIcon(newIcon);
      setShowEmojiPicker(false);
      if (autoSave) {
        debouncedSave({ icon: newIcon });
      }
    },
    [autoSave, debouncedSave]
  );

  /**
   * Fill an empty document from a template chosen in the empty state.
   *
   * Saved in one call rather than three: title, icon and content land together so
   * a refresh mid-way cannot leave a document carrying a template's title with
   * none of its content. The title is only taken when there is nothing to
   * overwrite — somebody who named the document first meant that name.
   */
  const handleApplyTemplate = useCallback(
    (template: DocumentTemplate) => {
      if (!editor) return;
      const content = template.content_template as Record<string, unknown>;
      editor.commands.setContent(content);

      const untitled = !localTitle.trim() || localTitle === "Untitled";
      const nextTitle = untitled ? template.name : localTitle;
      const nextIcon = template.icon || localIcon;
      setLocalTitle(nextTitle);
      setLocalIcon(nextIcon);
      onTitleChange?.(nextTitle);
      onSaveRef.current({ title: nextTitle, icon: nextIcon, content });
      editor.commands.focus("end");
    },
    [editor, localTitle, localIcon, onTitleChange]
  );

  /**
   * Turn this document into a workspace template.
   *
   * Named from the document's own title so the picker shows something
   * recognisable, and prompted rather than silent because a template name is
   * read by everybody else in the workspace. `prompt` matches how this editor
   * already asks for a link URL — a modal for one text field would be the only
   * one in the component.
   */
  const handleSaveAsTemplate = useCallback(async () => {
    if (!editor || !workspaceId) return;
    const name = window.prompt("Template name", localTitle || "Untitled template");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createTemplate.mutateAsync({
        name: trimmed,
        category: "custom",
        content_template: editor.getJSON() as Record<string, unknown>,
        // `prompt_template` is NOT NULL and feeds the AI generation path, so a
        // template saved by hand still needs something usable there.
        prompt_template: `Write a document following the "${trimmed}" template.\n\n{context}`,
        variables: [],
        icon: localIcon,
      });
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 2500);
    } catch (error) {
      console.error("Failed to save template:", error);
    }
  }, [editor, workspaceId, localTitle, localIcon, createTemplate]);

  /**
   * Start a thread on the current selection.
   *
   * The mark goes in immediately so the rail has something to align to while the
   * comment is still being typed; cancelling takes it back out. The id is generated
   * here because the mark has to carry it before the comment row exists.
   */
  const handleComment = useCallback(() => {
    if (!editor || editor.state.selection.empty) return;
    const { from, to } = editor.state.selection;
    const quoted = editor.state.doc.textBetween(from, to, " ").trim();
    if (!quoted) return;
    const anchorId = newAnchorId();
    editor.chain().focus().setCommentAnchor(anchorId).run();
    setPendingAnchor({ anchorId, quotedText: quoted.slice(0, 2000) });
    setActiveAnchorId(anchorId);
  }, [editor]);

  const handleRemoveAnchor = useCallback(
    (anchorId: string) => {
      editor?.commands.unsetCommentAnchor(anchorId);
      setActiveAnchorId((current) => (current === anchorId ? null : current));
    },
    [editor],
  );

  // Clicking a highlight focuses its thread. Delegated from the container rather
  // than bound per mark: the marks are ProseMirror's DOM to create and destroy, and
  // attaching listeners to them would leak on every edit.
  const handleContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const mark = (event.target as HTMLElement).closest?.("[data-comment-anchor]");
    const anchorId = mark?.getAttribute("data-comment-anchor");
    if (anchorId) setActiveAnchorId(anchorId);
  }, []);

  // `handleManualSave` removed — autoSave covers every change path
  // (rich/markdown), the dual-affordance was an audit finding. If a
  // future force-save UX is needed, prefer keyboard (Mod+S) over a
  // toolbar button.

  // Toggle editor mode
  const handleModeToggle = useCallback(() => {
    if (!editor) return;

    if (editorMode === "rich") {
      // Markdown has no way to express a comment anchor, and coming back calls
      // `setContent`, which rebuilds the document from that Markdown — so every
      // highlight is dropped on the return trip. The threads themselves are safe
      // (they are rows, keyed by an id, holding the text they were written
      // against) and reappear as "no longer in the document", but that is a
      // surprise worth asking about rather than discovering.
      const anchors = anchorIdsInDoc(editor.getJSON());
      if (anchors.length > 0) {
        const proceed = window.confirm(
          `Markdown cannot carry comment highlights, so switching will unpin ${
            anchors.length === 1 ? "1 comment thread" : `${anchors.length} comment threads`
          } from the text. The comments are kept, with the passage they were written about.`,
        );
        if (!proceed) return;
      }
      // Switching to markdown mode - extract markdown from editor
      try {
        const markdown = editor.storage.markdown.getMarkdown();
        setMarkdownContent(markdown);
        setEditorMode("markdown");
      } catch (error) {
        console.error("Failed to extract markdown:", error);
      }
    } else {
      // Switching to rich mode - parse markdown back into editor
      try {
        editor.commands.setContent(markdownContent);
        setLiveAnchorIds(anchorIdsInDoc(editor.getJSON()));
        setPendingAnchor(null);
        setActiveAnchorId(null);
        setEditorMode("rich");
      } catch (error) {
        console.error("Failed to parse markdown:", error);
        // Keep the markdown content and stay in markdown mode
        // so the user doesn't lose their work
      }
    }
  }, [editor, editorMode, markdownContent]);

  // Handle markdown content change
  const handleMarkdownChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setMarkdownContent(newContent);

      if (autoSave && !readOnly && editor) {
        // Update editor content in background for save
        editor.commands.setContent(newContent);
        debouncedSave({ content: editor.getJSON() as Record<string, unknown> });
      }
    },
    [autoSave, readOnly, editor, debouncedSave]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background animate-pulse">
        <div className="sticky top-0 z-10 border-b border-border p-4">
          <div className="h-6 w-48 bg-accent rounded mb-2" />
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-8 bg-accent rounded" />
            ))}
          </div>
        </div>
        <div className="flex-1 max-w-3xl mx-auto w-full p-8 space-y-4">
          <div className="h-8 w-3/4 bg-accent rounded" />
          <div className="h-4 w-full bg-accent rounded" />
          <div className="h-4 w-5/6 bg-accent rounded" />
          <div className="h-4 w-full bg-accent rounded" />
          <div className="h-4 w-2/3 bg-accent rounded" />
          <div className="h-32 w-full bg-accent rounded-lg mt-4" />
          <div className="h-4 w-full bg-accent rounded" />
          <div className="h-4 w-4/5 bg-accent rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Document Header + Toolbar (sticky together) */}
      <div className="sticky top-0 z-10">
        {/* Document Header (hidden in chromeless embed — native shows the title) */}
        {!embedded && (
        <div className="border-b border-border/50 bg-background/95 backdrop-blur-xl">
          <div className="px-4 py-2">
            <div className="flex items-center gap-3">
              {/* Icon Picker */}
              <div className="relative">
                <button
                  onClick={() => !readOnly && setShowEmojiPicker(!showEmojiPicker)}
                  disabled={readOnly}
                  className="text-2xl hover:bg-muted/60 rounded-lg p-1.5 transition-all duration-200 disabled:cursor-default hover:scale-105 active:scale-95"
                  title="Change icon"
                >
                  {localIcon}
                </button>

                {showEmojiPicker && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowEmojiPicker(false)}
                    />
                    <div className="absolute left-0 top-full mt-2 bg-muted/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl z-50 p-4 w-72">
                      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                        <Smile className="h-4 w-4" />
                        <span className="font-medium">Choose an icon</span>
                      </div>
                      <div className="grid grid-cols-8 gap-1.5">
                        {EMOJI_OPTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleIconChange(emoji)}
                            className="text-xl p-2 rounded-lg hover:bg-accent/80 transition-all duration-150 hover:scale-110 active:scale-95"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Title & Breadcrumb */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  {/* Breadcrumb */}
                {breadcrumb && (
                  <div className="mt-1">
                    {breadcrumb}
                  </div>
                )}
                  <input
                    type="text"
                    value={localTitle}
                    onChange={handleTitleChange}
                    onBlur={handleTitleBlur}
                    placeholder="Untitled document"
                    disabled={readOnly}
                    className="flex-1 min-w-0 text-xl font-semibold bg-transparent border-none outline-none text-foreground placeholder-muted-foreground/50 focus:placeholder-muted-foreground transition-colors"
                  />

                  {/* Save Status */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isSaving && (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <div className="relative">
                          <Cloud className="h-3.5 w-3.5" />
                          <div className="absolute inset-0 animate-ping">
                            <Cloud className="h-3.5 w-3.5 text-muted-foreground/50" />
                          </div>
                        </div>
                        <span>Saving...</span>
                      </div>
                    )}
                    {showSaved && !isSaving && (
                      <div className="flex items-center gap-1.5 text-success text-xs animate-fade-in">
                        <Check className="h-3.5 w-3.5" />
                        <span>Saved</span>
                      </div>
                    )}
                    {/* Distinct from "Saved": that is the document, this is the
                        template it was just copied into. */}
                    {templateSaved && (
                      <div className="flex items-center gap-1.5 text-success text-xs animate-fade-in">
                        <Check className="h-3.5 w-3.5" />
                        <span>Saved as template</span>
                      </div>
                    )}
                  </div>
                </div>

                
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Editor Toolbar — no manual Save button: autosave handles it.
            Audit found the dual affordance created "is autosave actually
            working?" doubt; aligning with Notion/Linear/Craft we drop
            the Save and surface only the autosave status. */}
        {editor && !readOnly && (
          <div className="bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-lg shadow-black/10">
            <EditorToolbar
              editor={editor}
              editorMode={editorMode}
              onComment={commentsEnabled ? handleComment : undefined}
              onModeToggle={handleModeToggle}
              onSaveAsTemplate={
                workspaceId && !readOnly && !editor?.isEmpty ? handleSaveAsTemplate : undefined
              }
            />
          </div>
        )}

        {/* BubbleMenu intentionally removed.
            `@tiptap/react`'s BubbleMenu wraps Tippy.js, which appends its
            DOM into `document.body` — outside the React tree. On every
            selectionchange Tippy moves nodes around; React's reconciler
            then tries to remove a node from a parent that no longer
            owns it and throws
              `removeChild: The node to be removed is not a child of
               this node`
            in the commit phase. Adding `editorMode === "rich"` to the
            mount condition only fixed the mode-switch race; the
            steady-state selection path still crashed because each
            selection causes BubbleMenu to mount/unmount its Tippy
            instance. Top `EditorToolbar` already exposes Bold / Italic /
            Underline / Code, so the affordance is intact. Commenting
            on a selection landed in that toolbar for the same reason —
            a button needs no floating positioning, so it cannot
            reintroduce this crash — and the thread it opens is an
            absolutely-positioned card inside this component's own tree
            (DocumentCommentRail), never appended to document.body. */}
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-[1400px] gap-6 px-8 py-8">
         <div className="min-w-0 flex-1" ref={contentRef} onClick={handleContentClick}>
          {/* Only while the page is genuinely blank, and only in rich mode —
              `editor.isEmpty` is live, so it clears itself on the first keystroke. */}
          {workspaceId && !readOnly && editorMode === "rich" && editor?.isEmpty && (
            <DocumentEmptyState workspaceId={workspaceId} onApply={handleApplyTemplate} />
          )}
          {editorMode === "rich" ? (
            <EditorContent
              editor={editor}
              className="min-h-[500px] [&_.ProseMirror]:text-foreground [&_.ProseMirror]:leading-relaxed [&_.ProseMirror]:text-[17px] [&_.ProseMirror_h1]:text-foreground [&_.ProseMirror_h2]:text-foreground [&_.ProseMirror_h3]:text-foreground [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h1]:text-3xl [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h3]:text-xl [&_.ProseMirror_h1]:mt-10 [&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h2]:mt-8 [&_.ProseMirror_h2]:mb-3 [&_.ProseMirror_h3]:mt-6 [&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h1]:tracking-tight [&_.ProseMirror_h2]:tracking-tight [&_.ProseMirror_p]:my-4 [&_.ProseMirror_p]:text-foreground [&_.ProseMirror_ul]:my-4 [&_.ProseMirror_ol]:my-4 [&_.ProseMirror_li]:my-1 [&_.ProseMirror_li]:text-foreground [&_.ProseMirror_strong]:text-foreground [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary-500 [&_.ProseMirror_blockquote]:pl-5 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_blockquote]:bg-muted/30 [&_.ProseMirror_blockquote]:py-3 [&_.ProseMirror_blockquote]:pr-4 [&_.ProseMirror_blockquote]:rounded-r-lg [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-primary-400 [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:font-mono"
            />
          ) : (
            <div className="min-h-[500px]">
              <textarea
                value={markdownContent}
                onChange={handleMarkdownChange}
                disabled={readOnly}
                placeholder="Write your content in Markdown..."
                className="w-full min-h-[500px] bg-background/50 border border-border rounded-lg p-4 text-foreground font-mono text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-muted-foreground"
                spellCheck={false}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Tip: Use Markdown syntax for formatting. Click &quot;Rich&quot; to preview and switch back to visual editing.
              </p>
            </div>
          )}
         </div>

          {/* The margin. Hidden below xl, where there is no room for a gutter
              beside a readable measure — the threads are still reachable there
              because the rail reflows under the document (see the sibling block
              below). Only in rich mode: the Markdown textarea has no marks to
              align to. */}
          {commentsEnabled && editorMode === "rich" && (
            <div className="hidden w-[320px] shrink-0 xl:block">
              <DocumentCommentRail
                workspaceId={workspaceId ?? null}
                documentId={documentId!}
                contentRef={contentRef}
                liveAnchorIds={liveAnchorIds}
                pending={pendingAnchor}
                onPendingCancel={() => setPendingAnchor(null)}
                onPendingCommitted={() => setPendingAnchor(null)}
                activeAnchorId={activeAnchorId}
                onActiveChange={setActiveAnchorId}
                onRemoveAnchor={handleRemoveAnchor}
              />
            </div>
          )}
        </div>

        {/* Below xl the same threads sit under the document rather than beside it.
            Positioning against a mark needs a gutter to position into, so here they
            are an ordinary list — the anchor still says which passage each is
            about, via its quoted text. */}
        {commentsEnabled && editorMode === "rich" && (
          <div className="px-8 pb-8 xl:hidden">
            <DocumentCommentRail
              positioned={false}
              workspaceId={workspaceId ?? null}
              documentId={documentId!}
              contentRef={contentRef}
              liveAnchorIds={liveAnchorIds}
              pending={pendingAnchor}
              onPendingCancel={() => setPendingAnchor(null)}
              onPendingCommitted={() => setPendingAnchor(null)}
              activeAnchorId={activeAnchorId}
              onActiveChange={setActiveAnchorId}
              onRemoveAnchor={handleRemoveAnchor}
            />
          </div>
        )}
      </div>
    </div>
  );
}
