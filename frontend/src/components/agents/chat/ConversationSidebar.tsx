"use client";

import { useState } from "react";
import { MessageSquare, Plus, Trash2, MoreVertical, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentConversation } from "@/lib/api";

interface ConversationSidebarProps {
  conversations: AgentConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
}

function groupConversationsByDate(conversations: AgentConversation[]) {
  const groups: { label: string; conversations: AgentConversation[] }[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayConvs: AgentConversation[] = [];
  const yesterdayConvs: AgentConversation[] = [];
  const lastWeekConvs: AgentConversation[] = [];
  const olderConvs: AgentConversation[] = [];

  conversations.forEach((conv) => {
    const date = new Date(conv.updated_at);
    if (date >= today) {
      todayConvs.push(conv);
    } else if (date >= yesterday) {
      yesterdayConvs.push(conv);
    } else if (date >= lastWeek) {
      lastWeekConvs.push(conv);
    } else {
      olderConvs.push(conv);
    }
  });

  if (todayConvs.length) groups.push({ label: "Today", conversations: todayConvs });
  if (yesterdayConvs.length) groups.push({ label: "Yesterday", conversations: yesterdayConvs });
  if (lastWeekConvs.length) groups.push({ label: "Last 7 days", conversations: lastWeekConvs });
  if (olderConvs.length) groups.push({ label: "Older", conversations: olderConvs });

  return groups;
}

interface ConversationItemProps {
  conversation: AgentConversation;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

function ConversationItem({ conversation, isSelected, onSelect, onDelete }: ConversationItemProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2 rounded-lg transition group",
        isSelected
          ? "bg-purple-500/20 border border-purple-500/30"
          : "hover:bg-accent/50 border border-transparent"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span
              className={cn(
                "text-sm font-medium truncate",
                isSelected ? "text-purple-300" : "text-foreground"
              )}
            >
              {conversation.title || "New conversation"}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 pl-6">
            <span className="text-xs text-muted-foreground">
              {conversation.message_count} messages
            </span>
            <span className="text-xs text-muted-foreground">-</span>
            <span className="text-xs text-muted-foreground">
              {formatDate(conversation.updated_at)}
            </span>
          </div>
        </div>

        {onDelete && (
          <div className="relative opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 hover:bg-muted rounded"
            >
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                  }}
                />
                <div className="absolute right-0 top-full mt-1 w-36 bg-accent rounded-lg shadow-xl z-20 py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-muted flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

export function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onNew,
  onDelete,
  isLoading,
}: ConversationSidebarProps) {
  const groups = groupConversationsByDate(conversations);

  return (
    <div className="flex flex-col h-full bg-muted border-r border-border">
      {/* Header with New Chat button */}
      <div className="p-3 border-b border-border">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition font-medium text-sm"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Clock className="h-5 w-5 text-muted-foreground animate-pulse" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.conversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isSelected={conv.id === selectedId}
                    onSelect={() => onSelect(conv.id)}
                    onDelete={onDelete ? () => onDelete(conv.id) : undefined}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
