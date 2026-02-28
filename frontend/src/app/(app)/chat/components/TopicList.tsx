"use client";

import { useState } from "react";
import { useTopics, useCreateTopic } from "@/hooks/useChat";
import { useChatStore } from "@/stores/chatStore";
import { ChatTopic } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Plus, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopicListProps {
  workspaceId: string;
  channelId: string;
  channelName: string;
  onSelectTopic: (topic: ChatTopic) => void;
}

export function TopicList({ workspaceId, channelId, channelName, onSelectTopic }: TopicListProps) {
  const { data: topics, isLoading } = useTopics(workspaceId, channelId);
  const activeTopicId = useChatStore((s) => s.activeTopicId);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicMessage, setNewTopicMessage] = useState("");
  const createTopic = useCreateTopic(workspaceId, channelId);

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim() || !newTopicMessage.trim()) return;
    const topic = await createTopic.mutateAsync({
      name: newTopicName.trim(),
      first_message: newTopicMessage.trim(),
    });
    setNewTopicName("");
    setNewTopicMessage("");
    setShowNewTopic(false);
    onSelectTopic(topic);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm truncate">#{channelName}</h2>
          <button
            onClick={() => setShowNewTopic(!showNewTopic)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title="New topic"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* New topic form */}
      {showNewTopic && (
        <form onSubmit={handleCreateTopic} className="p-3 border-b border-border space-y-2">
          <input
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            placeholder="Topic name"
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm outline-none focus:ring-1 focus:ring-primary/50"
            autoFocus
          />
          <textarea
            value={newTopicMessage}
            onChange={(e) => setNewTopicMessage(e.target.value)}
            placeholder="First message"
            rows={2}
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm outline-none focus:ring-1 focus:ring-primary/50 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNewTopic(false)} className="text-xs px-2 py-1 rounded border border-border hover:bg-accent">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newTopicName.trim() || !newTopicMessage.trim() || createTopic.isPending}
              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Topic list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">Loading topics...</div>
        ) : topics && topics.length > 0 ? (
          topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => onSelectTopic(topic)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-accent/50 transition-colors",
                activeTopicId === topic.id && "bg-accent"
              )}
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-sm truncate", (topic.unread_count ?? 0) > 0 && "font-semibold")}>
                      {topic.name}
                    </span>
                    {topic.is_resolved && <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />}
                    {(topic.unread_count ?? 0) > 0 && (
                      <span className="ml-auto flex-shrink-0 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                        {topic.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {topic.message_count} messages
                    </span>
                    {topic.last_message_at && (
                      <span className="text-xs text-muted-foreground">
                        &middot; {formatDistanceToNow(new Date(topic.last_message_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">No topics yet</p>
            <button
              onClick={() => setShowNewTopic(true)}
              className="text-xs text-primary hover:underline mt-1"
            >
              Start a new topic
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
