"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import { Spinner } from "@/components/ui/spinner";
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
import { InlineDatabase } from "./extensions/InlineDatabase";
import { SlashCommands } from "./extensions/SlashCommands";
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
  breadcrumb?: React.ReactNode;
  // Collaboration props
  userId: string;
  userName: string;
  userEmail?: string;
  collaborationEnabled?: boolean;
  /** Chromeless embed (macOS app): hide the title/breadcrumb header. */
  embedded?: boolean;
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
  breadcrumb,
  userId,
  userName,
  userEmail,
  collaborationEnabled = true,
  embedded = false,
}: CollaborativeEditorProps) {
  const [localTitle, setLocalTitle] = useState(title);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const userColor = useMemo(() => getUserColor(userId), [userId]);

  // The same bearer token the REST client sends. Read on mount rather than at
  // module scope because this component server-renders, where there is no
  // `localStorage`. The socket used to be handed `${userId}:${userName}:${email}`
  // instead — self-asserted, unsigned, and believed.
  const [authToken, setAuthToken] = useState<string | null>(null);
  useEffect(() => {
    setAuthToken(localStorage.getItem("token"));
  }, []);

  // The Yjs document comes from the server, through the provider. This
  // component used to create its own empty `Y.Doc` and then seed it by calling
  // `setContent()` with the REST body — which meant two people opening one
  // page each inserted the whole document into their own history, and the
  // merge duplicated it. There is deliberately no seeding here now: whatever
  // arrives on sync *is* the document.
  const {
    ydoc,
    provider,
    synced,
    isConnected,
    connectionStatus,
    error: collaborationError,
    canWrite,
    reviewedSpace,
    users,
    reconnect,
  } = useCollaboration({
    documentId,
    token: authToken,
    userName,
    userColor,
    enabled: collaborationEnabled,
  });

  // Read-only is whichever is stricter: what the caller asked for, and what
  // the server admitted us as. A viewer whose keystrokes were accepted locally
  // and refused on the socket would watch their own work disappear.
  const effectiveReadOnly = readOnly || !canWrite;

  // A space that reviews changes has no shared room, so the editor falls back
  // to the single-writer path: content comes from REST and a save is a normal
  // PATCH, which the server turns into a proposal.
  const collaborative = collaborationEnabled && !reviewedSpace;

  // Update local title when prop changes
  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  // Create debounced save function.
  //
  // `useMemo`, not `useCallback`: the argument is a *call* to `debounce`, so
  // `useCallback(debounce(...), deps)` ran `debounce` on every render and threw the
  // result away, keeping only the first. `useMemo` creates the debounced function
  // when its deps change and not otherwise, which is what the deps list meant.
  const debouncedSave = useMemo(
    () =>
      debounce((data: { title?: string; content?: Record<string, unknown> }) => {
        setIsSaving(true);
        onSave(data);
        setTimeout(() => setIsSaving(false), 500);
      }, autoSaveDelay),
    [onSave, autoSaveDelay]
  );

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
        HTMLAttributes: { class: "border border-border p-2" },
      }),
      TableHeader.configure({
        HTMLAttributes: { class: "border border-border p-2 bg-muted font-semibold" },
      }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Underline,
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: "bg-background rounded-lg p-4 font-mono text-sm overflow-x-auto",
        },
      }),
      InlineDatabase,
      SlashCommands,
    ];

    if (collaborative && ydoc && provider) {
      baseExtensions.push(
        Collaboration.configure({ document: ydoc }) as unknown as typeof StarterKit,
        // The real provider. This used to be a stub whose `setLocalStateField`
        // had an empty body and whose `on`/`off` did nothing, so remote carets
        // were never sent and never received — the feature rendered its own UI
        // and shared nothing.
        CollaborationCursor.configure({
          provider,
          user: { name: userName, color: userColor },
        }) as unknown as typeof StarterKit
      );
    }

    return baseExtensions;
  }, [collaborative, ydoc, provider, userName, userColor]);

  // In collaborative mode the editor is created only once the provider exists,
  // and its content comes from Yjs. `getExtensions` depends on `ydoc`, so the
  // key here forces a rebuild when the provider is replaced (a reconnect)
  // rather than leaving the editor bound to a destroyed document.
  const editor = useEditor(
    {
      extensions: getExtensions(),
      // Never both. Passing `content` alongside the Collaboration extension is
      // what TipTap warns about and what duplicated documents here: the
      // initial content is applied on top of the synced state.
      content: collaborative ? undefined : content,
      editable: !effectiveReadOnly,
      editorProps: {
        attributes: {
          class:
            "prose prose-invert prose-slate max-w-none focus:outline-none min-h-[500px] px-4 py-2",
        },
      },
      onUpdate: ({ editor }) => {
        // No manual broadcast. The provider sends the incremental Yjs update
        // for each transaction; the previous code re-encoded the *entire*
        // document state on every keystroke and sent that instead.
        //
        // No content autosave either, in collaborative mode: the server owns
        // the document and flushes it. Autosaving here would race the flush
        // and reintroduce last-write-wins on top of the CRDT.
        if (!collaborative && autoSave && !effectiveReadOnly) {
          debouncedSave({ content: editor.getJSON() as Record<string, unknown> });
        }
      },
      onCreate: () => {
        if (!collaborative && content) {
          // Non-collaborative mode still seeds from REST; there is no shared
          // document to conflict with.
          setIsInitialized(true);
          return;
        }
        setIsInitialized(true);
      },
    },
    [collaborative, ydoc, provider, effectiveReadOnly]
  );

  // Keep `editable` in step when the server downgrades us mid-session.
  useEffect(() => {
    editor?.setEditable(!effectiveReadOnly);
  }, [editor, effectiveReadOnly]);

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
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Document Header (hidden in chromeless embed — native shows the title) */}
      {!embedded && (
      <div className="border-b border-border/50 bg-gradient-to-b from-slate-900 to-slate-900/95 backdrop-blur-xl px-4 py-2">
        <div className="flex items-center gap-3">
          {icon && <span className="text-2xl">{icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={localTitle}
                onChange={handleTitleChange}
                onBlur={handleTitleBlur}
                placeholder="Untitled"
                disabled={effectiveReadOnly}
                className="flex-1 min-w-0 text-xl font-semibold bg-transparent border-none outline-none text-foreground placeholder-muted-foreground"
              />

              {/* Saving Indicator */}
              {isSaving && (
                <span className="text-xs text-muted-foreground animate-pulse flex-shrink-0">Saving...</span>
              )}

              {/* Collaboration Status */}
              {collaborationEnabled && (
                <CollaborationAwareness
                  users={users}
                  currentUserId={userId}
                  connectionStatus={connectionStatus}
                  onReconnect={reconnect}
                />
              )}
            </div>

            {/* Breadcrumb */}
            {breadcrumb && (
              <div className="mt-1">
                {breadcrumb}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Editor Toolbar */}
      {editor && !effectiveReadOnly && (
        <div className="flex items-center justify-between border-b border-border">
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
      {editor && !effectiveReadOnly && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-1 p-1 bg-muted border border-border rounded-lg shadow-xl"
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
          <div className="w-px h-4 bg-accent mx-1" />
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

      {/* Why the socket refused, when it did. A read-only editor with no
          explanation reads as a bug; "your session expired" is actionable. */}
      {collaborationEnabled && collaborationError && (
        <div
          className={
            reviewedSpace
              ? "border-b border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-200"
              : "border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
          }
        >
          {collaborationError}
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        {collaborationEnabled && !synced && !collaborationError && !reviewedSpace ? (
          // Deliberately not the editor. An unsynced Y.Doc is empty, and
          // rendering it shows the reader a blank page where their document
          // should be — the state the old code then wrote back over the top.
          <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" />
            Loading the latest version…
          </div>
        ) : (
          <EditorContent editor={editor} className="h-full" />
        )}
      </div>

      {/* Connection Status Bar (when disconnected) */}
      {collaborationEnabled && connectionStatus !== "connected" && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-800/50">
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
      className={`p-1.5 rounded hover:bg-accent ${
        isActive ? "bg-accent text-primary-400" : "text-foreground"
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
