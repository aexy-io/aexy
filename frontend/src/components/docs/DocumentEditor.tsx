"use client";

import { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
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

const lowlight = createLowlight(common);

interface DocumentEditorProps {
  content: Record<string, unknown>;
  title: string;
  icon?: string | null;
  onSave: (data: { title?: string; content?: Record<string, unknown> }) => void;
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
  const [isSaving, setIsSaving] = useState(false);

  // Update local title when prop changes
  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  // Create debounced save function
  const debouncedSave = useCallback(
    debounce((data: { title?: string; content?: Record<string, unknown> }) => {
      setIsSaving(true);
      onSave(data);
      setTimeout(() => setIsSaving(false), 500);
    }, autoSaveDelay),
    [onSave, autoSaveDelay]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We use CodeBlockLowlight instead
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
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
          class: "rounded-lg max-w-full h-auto",
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
    content: content,
    editable: !readOnly,
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
      onSave({ title: localTitle });
    }
  }, [localTitle, title, onSave]);

  // Manual save
  const handleManualSave = useCallback(() => {
    if (!editor) return;
    onSave({
      title: localTitle,
      content: editor.getJSON() as Record<string, unknown>,
    });
  }, [editor, localTitle, onSave]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Document Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-3">
          {icon && <span className="text-3xl">{icon}</span>}
          <input
            type="text"
            value={localTitle}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            placeholder="Untitled"
            disabled={readOnly}
            className="flex-1 text-3xl font-bold bg-transparent border-none outline-none text-white placeholder-slate-500"
          />
          {isSaving && (
            <span className="text-xs text-slate-500 animate-pulse">Saving...</span>
          )}
        </div>
      </div>

      {/* Editor Toolbar */}
      {editor && !readOnly && (
        <EditorToolbar editor={editor} onSave={handleManualSave} />
      )}

      {/* Bubble Menu */}
      {editor && !readOnly && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-1 p-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl"
        >
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-slate-700 ${
              editor.isActive("bold") ? "bg-slate-700 text-primary-400" : "text-slate-300"
            }`}
          >
            <BoldIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-slate-700 ${
              editor.isActive("italic") ? "bg-slate-700 text-primary-400" : "text-slate-300"
            }`}
          >
            <ItalicIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded hover:bg-slate-700 ${
              editor.isActive("underline") ? "bg-slate-700 text-primary-400" : "text-slate-300"
            }`}
          >
            <UnderlineIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded hover:bg-slate-700 ${
              editor.isActive("strike") ? "bg-slate-700 text-primary-400" : "text-slate-300"
            }`}
          >
            <StrikeIcon className="h-4 w-4" />
          </button>
          <div className="w-px h-4 bg-slate-700 mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`p-1.5 rounded hover:bg-slate-700 ${
              editor.isActive("code") ? "bg-slate-700 text-primary-400" : "text-slate-300"
            }`}
          >
            <CodeIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={`p-1.5 rounded hover:bg-slate-700 ${
              editor.isActive("highlight") ? "bg-slate-700 text-primary-400" : "text-slate-300"
            }`}
          >
            <HighlightIcon className="h-4 w-4" />
          </button>
        </BubbleMenu>
      )}

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

// Simple icon components
function BoldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  );
}

function ItalicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  );
}

function UnderlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3" />
      <line x1="4" y1="21" x2="20" y2="21" />
    </svg>
  );
}

function StrikeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
      <path d="M16 6H8a4 4 0 0 0 0 8" />
      <path d="M8 18h8a4 4 0 0 0 0-8" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function HighlightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
