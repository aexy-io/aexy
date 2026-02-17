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
import { EditorToolbar } from "./EditorToolbar";
import { debounce } from "@/lib/utils";
import { Check, Cloud, Smile } from "lucide-react";

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
}: DocumentEditorProps) {
  const [localTitle, setLocalTitle] = useState(title);
  const [localIcon, setLocalIcon] = useState(icon || "📄");
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const [markdownContent, setMarkdownContent] = useState("");

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
    ],
    content: initialContentRef.current,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-slate max-w-none focus:outline-none min-h-[500px] px-4 py-2",
      },
    },
    onUpdate: ({ editor }) => {
      if (autoSave && !readOnly) {
        debouncedSave({ content: editor.getJSON() as Record<string, unknown> });
      }
    },
  });

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

  // Manual save
  const handleManualSave = useCallback(() => {
    if (!editor) return;
    onSaveRef.current({
      title: localTitle,
      content: editor.getJSON() as Record<string, unknown>,
      icon: localIcon,
    });
  }, [editor, localTitle, localIcon]);

  // Toggle editor mode
  const handleModeToggle = useCallback(() => {
    if (!editor) return;

    if (editorMode === "rich") {
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
      <div className="flex items-center justify-center h-full bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-10 h-10 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading document...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Document Header + Toolbar (sticky together) */}
      <div className="sticky top-0 z-10">
        {/* Document Header */}
        <div className="border-b border-border/50 bg-gradient-to-b from-slate-900 to-slate-900/95 backdrop-blur-xl">
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
                    className="flex-1 min-w-0 text-xl font-semibold bg-transparent border-none outline-none text-foreground placeholder-slate-600 focus:placeholder-muted-foreground transition-colors"
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
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs animate-fade-in">
                        <Check className="h-3.5 w-3.5" />
                        <span>Saved</span>
                      </div>
                    )}
                  </div>
                </div>

                
              </div>
            </div>
          </div>
        </div>

        {/* Editor Toolbar */}
        {editor && !readOnly && (
          <div className="bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-lg shadow-black/10">
            <EditorToolbar
              editor={editor}
              onSave={handleManualSave}
              editorMode={editorMode}
              onModeToggle={handleModeToggle}
            />
          </div>
        )}
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        <div className="px-8 py-8">
          {editorMode === "rich" ? (
            <EditorContent
              editor={editor}
              className="min-h-[500px] [&_.ProseMirror]:text-foreground [&_.ProseMirror]:leading-relaxed [&_.ProseMirror]:text-[17px] [&_.ProseMirror_h1]:text-foreground [&_.ProseMirror_h2]:text-foreground [&_.ProseMirror_h3]:text-foreground [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h1]:text-3xl [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h3]:text-xl [&_.ProseMirror_h1]:mt-10 [&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h2]:mt-8 [&_.ProseMirror_h2]:mb-3 [&_.ProseMirror_h3]:mt-6 [&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h1]:tracking-tight [&_.ProseMirror_h2]:tracking-tight [&_.ProseMirror_p]:my-4 [&_.ProseMirror_ul]:my-4 [&_.ProseMirror_ol]:my-4 [&_.ProseMirror_li]:my-1 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary-500 [&_.ProseMirror_blockquote]:pl-5 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_blockquote]:bg-muted/30 [&_.ProseMirror_blockquote]:py-3 [&_.ProseMirror_blockquote]:pr-4 [&_.ProseMirror_blockquote]:rounded-r-lg [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-primary-400 [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:font-mono"
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
      </div>
    </div>
  );
}
