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
import { common, createLowlight } from "lowlight";
import { EditorToolbar } from "./EditorToolbar";
import { debounce } from "@/lib/utils";
import { Check, Cloud, Smile } from "lucide-react";

const lowlight = createLowlight(common);

// Common emoji options for documents
const EMOJI_OPTIONS = ["📄", "📝", "📋", "📌", "📎", "🎯", "💡", "🚀", "⭐", "🔥", "✨", "📊", "🗂️", "📁", "🏷️", "🔖"];

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
}: DocumentEditorProps) {
  const [localTitle, setLocalTitle] = useState(title);
  const [localIcon, setLocalIcon] = useState(icon || "📄");
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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
          class: "border border-slate-700 p-2",
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: "border border-slate-700 p-2 bg-slate-800 font-semibold",
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
          class: "bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto",
        },
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-10 h-10 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading document...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Document Header */}
      <div className="border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-2 py-2">
          <div className="flex items-start gap-4">
            {/* Icon Picker */}
            <div className="relative">
              <button
                onClick={() => !readOnly && setShowEmojiPicker(!showEmojiPicker)}
                disabled={readOnly}
                className="text-2xl hover:bg-slate-800/50 rounded-lg p-2 transition-colors disabled:cursor-default"
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
                  <div className="absolute left-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 p-3 w-64">
                    <div className="flex items-center gap-2 mb-3 text-sm text-slate-400">
                      <Smile className="h-4 w-4" />
                      <span>Choose an icon</span>
                    </div>
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleIconChange(emoji)}
                          className="text-xl p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Title & Status */}
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={localTitle}
                onChange={handleTitleChange}
                onBlur={handleTitleBlur}
                placeholder="Untitled document"
                disabled={readOnly}
                className="w-full text-3xl font-bold bg-transparent border-none outline-none text-white placeholder-slate-600 focus:placeholder-slate-500 transition-colors"
              />

              {/* Save Status */}
              <div className="flex items-center gap-2 mt-2 h-5">
                {isSaving && (
                  <div className="flex items-center gap-2 text-slate-500 text-sm animate-pulse">
                    <Cloud className="h-4 w-4" />
                    <span>Saving...</span>
                  </div>
                )}
                {showSaved && !isSaving && (
                  <div className="flex items-center gap-2 text-green-500 text-sm animate-fade-in">
                    <Check className="h-4 w-4" />
                    <span>Saved</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Editor Toolbar */}
      {editor && !readOnly && (
        <div className="sticky top-[120px] z-10 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800/50">
          <EditorToolbar editor={editor} onSave={handleManualSave} />
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-8 py-6">
          <EditorContent
            editor={editor}
            className="min-h-[500px] [&_.ProseMirror]:text-slate-200 [&_.ProseMirror]:leading-relaxed [&_.ProseMirror_h1]:text-white [&_.ProseMirror_h2]:text-white [&_.ProseMirror_h3]:text-white [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h1]:text-3xl [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h3]:text-xl [&_.ProseMirror_h1]:mt-8 [&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h2]:mt-6 [&_.ProseMirror_h2]:mb-3 [&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_p]:my-3 [&_.ProseMirror_ul]:my-3 [&_.ProseMirror_ol]:my-3 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary-500 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-slate-400"
          />
        </div>
      </div>
    </div>
  );
}
