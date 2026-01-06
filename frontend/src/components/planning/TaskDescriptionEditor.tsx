"use client";

import { useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { cn } from "@/lib/utils";
import { User, File, AtSign, Hash } from "lucide-react";

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
    ],
    content: content || undefined,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-invert prose-slate max-w-none focus:outline-none",
          "prose-p:my-1 prose-headings:my-2",
          "[&_.is-editor-empty:first-child::before]:text-slate-500",
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.is-editor-empty:first-child::before]:float-left",
          "[&_.is-editor-empty:first-child::before]:h-0",
          "[&_.is-editor-empty:first-child::before]:pointer-events-none"
        ),
        style: `min-height: ${minHeight}`,
      },
      handleKeyDown: (view, event) => {
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
    <div className={cn("relative rounded-lg border border-slate-700 bg-slate-800/50", className)}>
      <EditorContent
        editor={editor}
        className={cn(
          "px-3 py-2",
          "[&_.ProseMirror]:text-slate-200 [&_.ProseMirror]:text-sm",
          "[&_.ProseMirror]:leading-relaxed"
        )}
      />

      {/* User mention suggestions */}
      {showUserSuggestions && filteredUsers.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-slate-700 text-xs text-slate-400 flex items-center gap-1.5">
            <AtSign className="w-3 h-3" />
            <span>Mention a team member</span>
            {suggestionQuery && <span className="text-slate-500">({suggestionQuery})</span>}
          </div>
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => insertMention("user", user.id, user.name)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-slate-300 hover:bg-slate-700 transition-colors"
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center">
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
        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
          <div className="px-3 py-1.5 border-b border-slate-700 text-xs text-slate-400 flex items-center gap-1.5">
            <Hash className="w-3 h-3" />
            <span>Reference a file</span>
            {suggestionQuery && <span className="text-slate-500">({suggestionQuery})</span>}
          </div>
          {filteredFiles.map((file) => (
            <button
              key={file.path}
              onClick={() => insertMention("file", file.path, file.name)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <File className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{file.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Mentioned items display */}
      {(mentionedUserIds.size > 0 || mentionedFilePaths.size > 0) && (
        <div className="border-t border-slate-700 px-3 py-2 flex flex-wrap gap-1.5">
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
