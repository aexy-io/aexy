"use client";

import { useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import { cn } from "@/lib/utils";
import { User, File, AtSign, Hash, Code, Type } from "lucide-react";

type EditorMode = "rich" | "markdown";

export interface MentionUser {
  id: string;
  name: string;
  avatar_url?: string;
}

export interface MentionFile {
  path: string;
  name: string;
}

interface TaskDescriptionEditorProps {
  content: Record<string, unknown> | null;
  onChange?: (content: Record<string, unknown>, mentions: {
    user_ids: string[];
    file_paths: string[];
  }) => void;
  placeholder?: string;
  readOnly?: boolean;
  users?: MentionUser[];
  files?: MentionFile[];
  className?: string;
  minHeight?: string;
}

export interface TaskDescriptionEditorRef {
  getContent: () => Record<string, unknown>;
  getMentions: () => { user_ids: string[]; file_paths: string[] };
  clearContent: () => void;
}

export const TaskDescriptionEditor = forwardRef<
  TaskDescriptionEditorRef,
  TaskDescriptionEditorProps
>(function TaskDescriptionEditor(
  {
    content,
    onChange,
    placeholder = "Add a description...",
    readOnly = false,
    users = [],
    files = [],
    className,
    minHeight = "100px",
  },
  ref
) {
  const [mentionedUserIds, setMentionedUserIds] = useState<Set<string>>(new Set());
  const [mentionedFilePaths, setMentionedFilePaths] = useState<Set<string>>(new Set());
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const [markdownContent, setMarkdownContent] = useState("");

  // Filter users based on query
  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(suggestionQuery.toLowerCase())
  ).slice(0, 6);

  // Filter files based on query
  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(suggestionQuery.toLowerCase())
  ).slice(0, 6);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-400 hover:text-blue-300 underline cursor-pointer",
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
    content: content || undefined,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose dark:prose-invert max-w-none focus:outline-none",
          "prose-p:my-1 prose-headings:my-2",
          "[&_.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.is-editor-empty:first-child::before]:float-left",
          "[&_.is-editor-empty:first-child::before]:h-0",
          "[&_.is-editor-empty:first-child::before]:pointer-events-none"
        ),
        style: `min-height: ${minHeight}`,
      },
      handleKeyDown: (_view, event) => {
        // Handle @ for user mentions
        if (event.key === "@" && !showUserSuggestions && users.length > 0) {
          setShowUserSuggestions(true);
          setShowFileSuggestions(false);
          setSuggestionQuery("");
          return false;
        }

        // Handle # for file mentions
        if (event.key === "#" && !showFileSuggestions && files.length > 0) {
          setShowFileSuggestions(true);
          setShowUserSuggestions(false);
          setSuggestionQuery("");
          return false;
        }

        // Handle escape to close suggestions
        if (event.key === "Escape" && (showUserSuggestions || showFileSuggestions)) {
          setShowUserSuggestions(false);
          setShowFileSuggestions(false);
          return true;
        }

        // Handle suggestion query input
        if (showUserSuggestions || showFileSuggestions) {
          if (event.key === "Backspace") {
            if (suggestionQuery.length > 0) {
              setSuggestionQuery((q) => q.slice(0, -1));
            } else {
              setShowUserSuggestions(false);
              setShowFileSuggestions(false);
            }
            return true;
          }

          if (event.key === " " || event.key === "Enter") {
            setShowUserSuggestions(false);
            setShowFileSuggestions(false);
            return false;
          }

          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            setSuggestionQuery((q) => q + event.key);
            return true;
          }
        }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as Record<string, unknown>;
      onChange?.(json, {
        user_ids: Array.from(mentionedUserIds),
        file_paths: Array.from(mentionedFilePaths),
      });
    },
  });

  // Insert mention into editor
  const insertMention = useCallback((type: "user" | "file", id: string, label: string) => {
    if (!editor) return;

    // Delete the @ or # trigger character and query
    const triggerLength = 1 + suggestionQuery.length;
    editor.commands.deleteRange({
      from: editor.state.selection.from - triggerLength,
      to: editor.state.selection.from,
    });

    // Insert the mention as styled text
    const mentionClass = type === "user"
      ? "bg-blue-500/20 text-blue-400 rounded px-1 py-0.5"
      : "bg-amber-500/20 text-amber-400 rounded px-1 py-0.5";

    editor.commands.insertContent({
      type: "text",
      marks: [
        {
          type: "link",
          attrs: {
            href: type === "user" ? `mention:user:${id}` : `mention:file:${id}`,
            class: mentionClass,
          },
        },
      ],
      text: type === "user" ? `@${label}` : `#${label}`,
    });

    editor.commands.insertContent(" ");

    // Track the mention
    if (type === "user") {
      setMentionedUserIds((prev) => new Set([...prev, id]));
    } else {
      setMentionedFilePaths((prev) => new Set([...prev, id]));
    }

    // Close suggestions
    setShowUserSuggestions(false);
    setShowFileSuggestions(false);
    setSuggestionQuery("");

    // Notify parent
    const json = editor.getJSON() as Record<string, unknown>;
    onChange?.(json, {
      user_ids: type === "user"
        ? [...Array.from(mentionedUserIds), id]
        : Array.from(mentionedUserIds),
      file_paths: type === "file"
        ? [...Array.from(mentionedFilePaths), id]
        : Array.from(mentionedFilePaths),
    });
  }, [editor, suggestionQuery, mentionedUserIds, mentionedFilePaths, onChange]);

  // Toggle editor mode
  const handleModeToggle = useCallback(() => {
    if (!editor) return;

    if (editorMode === "rich") {
      try {
        const markdown = editor.storage.markdown.getMarkdown();
        setMarkdownContent(markdown);
        setEditorMode("markdown");
      } catch (error) {
        console.error("Failed to extract markdown:", error);
      }
    } else {
      try {
        editor.commands.setContent(markdownContent);
        setEditorMode("rich");
        // Notify parent with updated JSON
        const json = editor.getJSON() as Record<string, unknown>;
        onChange?.(json, {
          user_ids: Array.from(mentionedUserIds),
          file_paths: Array.from(mentionedFilePaths),
        });
      } catch (error) {
        console.error("Failed to parse markdown:", error);
      }
    }
  }, [editor, editorMode, markdownContent, onChange, mentionedUserIds, mentionedFilePaths]);

  // Handle markdown textarea change
  const handleMarkdownChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setMarkdownContent(newContent);

      // Update editor content in background so parent gets valid JSON
      if (editor) {
        editor.commands.setContent(newContent);
        const json = editor.getJSON() as Record<string, unknown>;
        onChange?.(json, {
          user_ids: Array.from(mentionedUserIds),
          file_paths: Array.from(mentionedFilePaths),
        });
      }
    },
    [editor, onChange, mentionedUserIds, mentionedFilePaths]
  );

  // Sync content when it changes externally
  useEffect(() => {
    if (editor && content && !editor.isFocused) {
      const currentContent = JSON.stringify(editor.getJSON());
      const newContent = JSON.stringify(content);
      if (currentContent !== newContent) {
        editor.commands.setContent(content);
      }
    }
  }, [editor, content]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getContent: () => editor?.getJSON() as Record<string, unknown> || {},
    getMentions: () => ({
      user_ids: Array.from(mentionedUserIds),
      file_paths: Array.from(mentionedFilePaths),
    }),
    clearContent: () => editor?.commands.clearContent(),
  }));

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-border bg-background/70 shadow-inner ring-1 ring-white/5", className)}>
      {/* Mode toggle */}
      {!readOnly && (
        <div className="flex justify-end border-b border-border/60 bg-muted/30 px-2 py-1.5">
          <button
            type="button"
            onClick={handleModeToggle}
            className="flex items-center gap-1 rounded-md border border-border bg-background/70 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {editorMode === "rich" ? (
              <>
                <Code className="w-3 h-3" />
                <span>Markdown</span>
              </>
            ) : (
              <>
                <Type className="w-3 h-3" />
                <span>Rich</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Always render EditorContent so the editor view stays attached */}
      <div className={editorMode === "rich" ? undefined : "hidden"}>
        <EditorContent
          editor={editor}
          className={cn(
            "px-4 py-3",
            "[&_.ProseMirror]:text-foreground [&_.ProseMirror]:text-sm",
            "[&_.ProseMirror]:leading-relaxed"
          )}
        />
      </div>
      {editorMode === "markdown" && (
        <div className="px-4 py-3">
          <textarea
            value={markdownContent}
            onChange={handleMarkdownChange}
            placeholder="Write in Markdown..."
            className="w-full resize-y border-none bg-transparent font-mono text-sm leading-relaxed text-foreground outline-none placeholder-muted-foreground"
            style={{ minHeight: minHeight }}
            spellCheck={false}
          />
        </div>
      )}

      {/* User mention suggestions */}
      {showUserSuggestions && filteredUsers.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-muted border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border text-xs text-muted-foreground flex items-center gap-1.5">
            <AtSign className="w-3 h-3" />
            <span>Mention a team member</span>
            {suggestionQuery && <span className="text-muted-foreground">({suggestionQuery})</span>}
          </div>
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => insertMention("user", user.id, user.name)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-foreground hover:bg-accent transition-colors"
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-3 h-3" />
                </div>
              )}
              <span>{user.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* File mention suggestions */}
      {showFileSuggestions && filteredFiles.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-muted border border-border rounded-lg shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
          <div className="px-3 py-1.5 border-b border-border text-xs text-muted-foreground flex items-center gap-1.5">
            <Hash className="w-3 h-3" />
            <span>Reference a file</span>
            {suggestionQuery && <span className="text-muted-foreground">({suggestionQuery})</span>}
          </div>
          {filteredFiles.map((file) => (
            <button
              key={file.path}
              onClick={() => insertMention("file", file.path, file.name)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-foreground hover:bg-accent transition-colors"
            >
              <File className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{file.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Mentioned items display */}
      {(mentionedUserIds.size > 0 || mentionedFilePaths.size > 0) && (
        <div className="border-t border-border px-3 py-2 flex flex-wrap gap-1.5">
          {Array.from(mentionedUserIds).map((userId) => {
            const user = users.find((u) => u.id === userId);
            return (
              <span
                key={userId}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs"
              >
                <User className="w-3 h-3" />
                {user?.name || userId}
              </span>
            );
          })}
          {Array.from(mentionedFilePaths).map((path) => {
            const file = files.find((f) => f.path === path);
            return (
              <span
                key={path}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-xs"
              >
                <File className="w-3 h-3" />
                {file?.name || path}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default TaskDescriptionEditor;
