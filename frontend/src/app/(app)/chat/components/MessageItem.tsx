"use client";

import { ChatMessage } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { Reply, FileText, Download } from "lucide-react";

interface MessageItemProps {
  message: ChatMessage;
  onReply?: (messageId: string) => void;
  compact?: boolean;
}

// Parse markdown-style images ![alt](url) and links [text](url) from content
function renderContent(content: string) {
  const parts: React.ReactNode[] = [];
  const regex = /(!?\[([^\]]*)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const [fullMatch, , alt, url] = match;
    const isImage = fullMatch.startsWith("!");

    if (isImage) {
      // Render inline image
      parts.push(
        <div key={match.index} className="mt-1.5 mb-1">
          <img
            src={url}
            alt={alt}
            className="max-w-xs max-h-64 rounded-lg border border-border cursor-pointer"
            onClick={() => window.open(url, "_blank")}
          />
          {alt && <span className="text-xs text-muted-foreground block mt-0.5">{alt}</span>}
        </div>
      );
    } else {
      // Render file link
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2 py-1 my-0.5 rounded bg-accent/50 hover:bg-accent text-sm text-primary transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          <span>{alt || "Download file"}</span>
          <Download className="h-3 w-3 opacity-50" />
        </a>
      );
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Remaining text after last match
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}

export function MessageItem({ message, onReply, compact }: MessageItemProps) {
  const time = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });
  const senderName = message.sender?.name || "Unknown";
  const initials = senderName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (message.is_deleted) {
    return (
      <div className={compact ? "px-2 py-1 text-xs text-muted-foreground italic" : "px-4 py-2 text-sm text-muted-foreground italic"}>
        Message deleted
      </div>
    );
  }

  return (
    <div className={`group flex hover:bg-accent/50 transition-colors ${compact ? "gap-2 px-2 py-1" : "gap-3 px-4 py-2"}`}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        {message.sender?.avatar_url ? (
          <img
            src={message.sender.avatar_url}
            alt={senderName}
            className={compact ? "h-6 w-6 rounded-full" : "h-8 w-8 rounded-full"}
          />
        ) : (
          <div className={`rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium ${compact ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"}`}>
            {initials}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={compact ? "font-semibold text-xs" : "font-semibold text-sm"}>{senderName}</span>
          <span className={compact ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground"}>{time}</span>
          {message.is_edited && (
            <span className={compact ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground"}>(edited)</span>
          )}
        </div>
        <div className={`whitespace-pre-wrap break-words mt-0.5 ${compact ? "text-xs" : "text-sm"}`}>
          {renderContent(message.content)}
        </div>
      </div>

      {/* Actions */}
      {onReply && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => onReply(message.id)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title="Reply"
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
