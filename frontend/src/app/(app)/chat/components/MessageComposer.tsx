"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Smile, Paperclip, X, Image, FileText, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Common emoji categories
const EMOJI_GROUPS = [
  { label: "Smileys", emojis: ["😀", "😂", "🥹", "😊", "😎", "🤔", "😅", "🙌", "🤝", "👍", "👎", "❤️", "🔥", "✨", "🎉", "💯"] },
  { label: "Work", emojis: ["🚀", "💡", "⚡", "🎯", "📌", "✅", "❌", "⚠️", "🔧", "🐛", "📝", "📊", "🗂️", "📁", "🏗️", "🔍"] },
  { label: "Reactions", emojis: ["👀", "🤷", "🙏", "💪", "🤞", "🫡", "🫠", "😬", "🤯", "🥳", "😢", "😤", "🤣", "😴", "🧐", "🤓"] },
];

export interface PendingFile {
  file: File;
  preview?: string;
  uploading?: boolean;
}

interface MessageComposerProps {
  onSend: (content: string, attachments?: { url: string; filename: string; content_type: string; size: number }[]) => void;
  onUploadFile?: (file: File) => Promise<{ url: string; filename: string; content_type: string; size: number }>;
  onTyping?: () => void;
  onStopTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
  isConnected?: boolean;
  isSending?: boolean;
  sendError?: string | null;
  meetButton?: React.ReactNode;
  compact?: boolean;
}

export function MessageComposer({
  onSend,
  onUploadFile,
  onTyping,
  onStopTyping,
  placeholder = "Type a message...",
  disabled,
  isConnected = true,
  isSending = false,
  sendError,
  meetButton,
  compact,
}: MessageComposerProps) {
  const [content, setContent] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isTypingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const handleTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping?.();
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onStopTyping?.();
    }, 3000);
  }, [onTyping, onStopTyping]);

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed && pendingFiles.length === 0) return;

    // Upload files first if any
    let attachments: { url: string; filename: string; content_type: string; size: number }[] = [];
    if (pendingFiles.length > 0 && onUploadFile) {
      setUploadingFiles(true);
      try {
        const uploaded = await Promise.all(
          pendingFiles.map(async (pf) => {
            const result = await onUploadFile(pf.file);
            return result;
          })
        );
        attachments = uploaded;
      } catch {
        setUploadingFiles(false);
        return; // Don't clear content on upload failure
      }
      setUploadingFiles(false);
    }

    // Build message content with attachment references
    let finalContent = trimmed;
    if (attachments.length > 0) {
      const attachmentLines = attachments.map((a) => {
        if (a.content_type.startsWith("image/")) {
          return `![${a.filename}](${a.url})`;
        }
        return `[${a.filename}](${a.url})`;
      });
      finalContent = finalContent
        ? `${finalContent}\n\n${attachmentLines.join("\n")}`
        : attachmentLines.join("\n");
    }

    if (!finalContent) return;

    onSend(finalContent, attachments);
    setContent("");
    setPendingFiles([]);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onStopTyping?.();
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.slice(0, start) + emoji + content.slice(end);
      setContent(newContent);
      // Set cursor after emoji
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
        textarea.focus();
      }, 0);
    } else {
      setContent((prev) => prev + emoji);
    }
    setShowEmoji(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: PendingFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 20 * 1024 * 1024) continue; // Skip > 20MB
      const pf: PendingFile = { file };
      if (file.type.startsWith("image/")) {
        pf.preview = URL.createObjectURL(file);
      }
      newFiles.push(pf);
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);
    e.target.value = ""; // Reset input
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const sending = isSending || uploadingFiles;

  return (
    <div className="border-t border-border">
      {/* Connection warning banner */}
      {!isConnected && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="text-xs">Connection lost. Messages will be sent when reconnected.</span>
        </div>
      )}

      {/* Send error banner */}
      {sendError && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20 text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="text-xs">{sendError}</span>
        </div>
      )}

      {/* File previews */}
      {pendingFiles.length > 0 && (
        <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto">
          {pendingFiles.map((pf, i) => (
            <div key={i} className="relative group flex-shrink-0">
              {pf.preview ? (
                <img
                  src={pf.preview}
                  alt={pf.file.name}
                  className="h-16 w-16 rounded-lg object-cover border border-border"
                />
              ) : (
                <div className="h-16 w-16 rounded-lg border border-border bg-accent/50 flex flex-col items-center justify-center">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground mt-0.5 truncate max-w-[56px] px-1">
                    {pf.file.name.split(".").pop()}
                  </span>
                </div>
              )}
              <button
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
              <span className="text-[9px] text-muted-foreground truncate max-w-[64px] block text-center mt-0.5">
                {pf.file.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="p-3">
        <div className="flex items-end gap-2">
          {/* Toolbar: stacks vertically when compact + expanded (>2 lines) */}
          <div className={compact && isExpanded ? "flex flex-col gap-0.5" : "contents"}>
            {/* Emoji button */}
            <div className="relative" ref={emojiRef}>
              <button
                onClick={() => setShowEmoji(!showEmoji)}
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
                title="Add emoji"
              >
                <Smile className="h-4 w-4" />
              </button>

              {/* Emoji picker dropdown */}
              {showEmoji && (
                <div className="absolute bottom-full left-0 mb-1 w-72 bg-popover border border-border rounded-lg shadow-lg p-2 z-50">
                  {EMOJI_GROUPS.map((group) => (
                    <div key={group.label} className="mb-2 last:mb-0">
                      <p className="text-[10px] text-muted-foreground font-medium px-1 mb-1">{group.label}</p>
                      <div className="flex flex-wrap gap-0.5">
                        {group.emojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => insertEmoji(emoji)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent text-base transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* File upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Meet button */}
            {meetButton}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.gz"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              const val = e.target.value;
              setContent(val);
              handleTyping();
              if (compact) {
                const lines = val.split("\n").length;
                // Expand for long wrapped text or multiple newlines; use hysteresis to prevent oscillation
                if (!isExpanded && (val.length > 60 || lines > 2)) {
                  setIsExpanded(true);
                } else if (isExpanded && val.length <= 30 && lines <= 2) {
                  setIsExpanded(false);
                }
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-accent/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 min-h-[38px] max-h-[120px]"
            style={{ height: "auto" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={disabled || sending || (!content.trim() && pendingFiles.length === 0)}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
