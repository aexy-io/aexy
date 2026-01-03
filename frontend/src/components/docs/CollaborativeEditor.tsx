"use client";

import { useCallback, useEffect, useState, useRef } from "react";
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
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { common, createLowlight } from "lowlight";
import * as Y from "yjs";
import { EditorToolbar } from "./EditorToolbar";
import { CollaborationAwareness, CollaborationBadge } from "./CollaborationAwareness";
import { useCollaboration, getUserColor } from "@/hooks/useCollaboration";
import { debounce } from "@/lib/utils";

const lowlight = createLowlight(common);

interface CollaborativeEditorProps {
  documentId: string;
  content: Record<string, unknown>;
  title: string;
  icon?: string | null;
  onSave: (data: { title?: string; content?: Record<string, unknown> }) => void;
  onTitleChange?: (title: string) => void;
  isLoading?: boolean;
  readOnly?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
  // Collaboration props
  userId: string;
  userName: string;
  userEmail?: string;
  collaborationEnabled?: boolean;
}

export function CollaborativeEditor({
  documentId,
  content,
  title,
  icon,
  onSave,
  onTitleChange,
  isLoading = false,
  readOnly = false,
  autoSave = true,
  autoSaveDelay = 2000,
  userId,
  userName,
  userEmail,
  collaborationEnabled = true,
}: CollaborativeEditorProps) {
  const [localTitle, setLocalTitle] = useState(title);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const ydocRef = useRef<Y.Doc | null>(null);
  const initialContentSetRef = useRef(false);

  // Initialize Yjs document
  useEffect(() => {
    if (!collaborationEnabled) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    return () => {
      ydoc.destroy();
      ydocRef.current = null;
    };
  }, [collaborationEnabled, documentId]);

  // Collaboration hook
  const {
    isConnected,
    users,
    connectionStatus,
    sendUpdate,
    updateAwareness,
    reconnect,
  } = useCollaboration({
    documentId,
    userId,
    userName,
    userEmail,
    enabled: collaborationEnabled,
    onUpdate: (data) => {
      // Apply updates from other users
      if (ydocRef.current && data) {
        try {
          Y.applyUpdate(ydocRef.current, new Uint8Array(data as ArrayLike<number>));
        } catch (error) {
          console.error("Failed to apply Yjs update:", error);
        }
      }
    },
    onSync: (data) => {
      // Apply sync data
      if (ydocRef.current && data) {
        try {
          Y.applyUpdate(ydocRef.current, new Uint8Array(data as ArrayLike<number>));
        } catch (error) {
          console.error("Failed to apply Yjs sync:", error);
        }
      }
    },
  });

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

  // Get user color
  const userColor = getUserColor(userId);

  // Build extensions based on collaboration mode
  const getExtensions = useCallback(() => {
    const baseExtensions = [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4] },
        history: collaborationEnabled ? false : undefined, // Disable history when collaborating (Yjs handles it)
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
        HTMLAttributes: { class: "not-prose pl-0" },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: "flex items-start gap-2" },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: "border-collapse table-auto w-full" },
      }),
      TableRow,
      TableCell.configure({
        HTMLAttributes: { class: "border border-slate-700 p-2" },
      }),
      TableHeader.configure({
        HTMLAttributes: { class: "border border-slate-700 p-2 bg-slate-800 font-semibold" },
      }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Underline,
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: "bg-slate-900 rounded-lg p-4 font-mono text-sm overflow-x-auto",
        },
      }),
    ];

    // Add collaboration extensions if enabled and ydoc is ready
    if (collaborationEnabled && ydocRef.current) {
      baseExtensions.push(
        Collaboration.configure({
          document: ydocRef.current,
        }) as typeof StarterKit,
        CollaborationCursor.configure({
          provider: {
            awareness: {
              setLocalStateField: (field: string, value: unknown) => {
                if (field === "user") {
                  // Track cursor position for awareness
                }
              },
              on: () => {},
              off: () => {},
            },
          } as unknown as { awareness: { setLocalStateField: (field: string, value: unknown) => void; on: () => void; off: () => void } },
          user: {
            name: userName,
            color: userColor,
          },
        }) as typeof StarterKit
      );
    }

    return baseExtensions;
  }, [collaborationEnabled, userName, userColor]);

  const editor = useEditor({
    extensions: getExtensions(),
    content: collaborationEnabled ? undefined : content, // Let Yjs handle content in collab mode
    editable: !readOnly,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-slate max-w-none focus:outline-none min-h-[500px] px-4 py-2",
      },
    },
    onUpdate: ({ editor }) => {
      // Update awareness with cursor position
      const { from, to } = editor.state.selection;
      updateAwareness({ anchor: from, head: to }, null);

      // Broadcast update to collaborators
      if (collaborationEnabled && ydocRef.current) {
        const update = Y.encodeStateAsUpdate(ydocRef.current);
        sendUpdate(Array.from(update));
      }

      // Auto-save content
      if (autoSave && !readOnly) {
        debouncedSave({ content: editor.getJSON() as Record<string, unknown> });
      }
    },
    onSelectionUpdate: ({ editor }) => {
      // Update awareness with selection
      const { from, to } = editor.state.selection;
      if (from !== to) {
        updateAwareness(null, { anchor: from, head: to });
      } else {
        updateAwareness({ anchor: from, head: to }, null);
      }
    },
    onCreate: ({ editor }) => {
      // Set initial content for non-collaborative mode or when first loading
      if (!collaborationEnabled && content && !initialContentSetRef.current) {
        editor.commands.setContent(content);
        initialContentSetRef.current = true;
      }
      setIsInitialized(true);
    },
  });

  // Set initial content when connected in collaboration mode
  useEffect(() => {
    if (
      collaborationEnabled &&
      isConnected &&
      editor &&
      !initialContentSetRef.current &&
      content
    ) {
      // Only set initial content if document is empty
      const currentContent = editor.getJSON();
      if (!currentContent.content || currentContent.content.length === 0) {
        editor.commands.setContent(content);
      }
      initialContentSetRef.current = true;
    }
  }, [collaborationEnabled, isConnected, editor, content]);

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

  // Handle title blur
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

          {/* Collaboration Status */}
          {collaborationEnabled && (
            <CollaborationAwareness
              users={users}
              currentUserId={userId}
              connectionStatus={connectionStatus}
              onReconnect={reconnect}
            />
          )}

          {/* Saving Indicator */}
          {isSaving && (
            <span className="text-xs text-slate-500 animate-pulse">Saving...</span>
          )}
        </div>
      </div>

      {/* Editor Toolbar */}
      {editor && !readOnly && (
        <div className="flex items-center justify-between border-b border-slate-800">
          <EditorToolbar editor={editor} onSave={handleManualSave} />

          {/* Compact collaboration badge */}
          {collaborationEnabled && (
            <div className="px-4">
              <CollaborationBadge
                users={users}
                currentUserId={userId}
                connectionStatus={connectionStatus}
              />
            </div>
          )}
        </div>
      )}

      {/* Bubble Menu */}
      {editor && !readOnly && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-1 p-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl"
        >
          <BubbleButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
          >
            <BoldIcon className="h-4 w-4" />
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
          >
            <ItalicIcon className="h-4 w-4" />
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive("underline")}
          >
            <UnderlineIcon className="h-4 w-4" />
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive("strike")}
          >
            <StrikeIcon className="h-4 w-4" />
          </BubbleButton>
          <div className="w-px h-4 bg-slate-700 mx-1" />
          <BubbleButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
          >
            <CodeIcon className="h-4 w-4" />
          </BubbleButton>
          <BubbleButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive("highlight")}
          >
            <HighlightIcon className="h-4 w-4" />
          </BubbleButton>
        </BubbleMenu>
      )}

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Connection Status Bar (when disconnected) */}
      {collaborationEnabled && connectionStatus !== "connected" && (
        <div className="px-4 py-2 bg-amber-900/20 border-t border-amber-800/50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-amber-400">
              {connectionStatus === "connecting"
                ? "Connecting to collaboration server..."
                : connectionStatus === "error"
                ? "Connection error. Changes are saved locally."
                : "You're working offline. Changes will sync when reconnected."}
            </span>
            {connectionStatus !== "connecting" && (
              <button
                onClick={reconnect}
                className="text-amber-300 hover:text-amber-200 underline"
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Bubble Menu Button
function BubbleButton({
  onClick,
  isActive,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded hover:bg-slate-700 ${
        isActive ? "bg-slate-700 text-primary-400" : "text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

// Icon components
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
