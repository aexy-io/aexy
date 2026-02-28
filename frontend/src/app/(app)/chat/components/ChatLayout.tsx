"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useChannels, useTopics } from "@/hooks/useChat";
import { useChatWebSocketContext } from "@/contexts/ChatWebSocketContext";
import { ChatChannel, ChatTopic, InboxTopic } from "@/lib/api";
import { ChannelList } from "./ChannelList";
import { TopicList } from "./TopicList";
import { InboxView } from "./InboxView";
import { MessageThread } from "./MessageThread";
import { Wifi, WifiOff } from "lucide-react";

interface ChatLayoutProps {
  workspaceId: string;
  initialChannelSlug?: string;
  initialTopicId?: string;
}

export function ChatLayout({ workspaceId, initialChannelSlug, initialTopicId }: ChatLayoutProps) {
  const { isConnected, sendTyping, sendStopTyping } = useChatWebSocketContext();
  const { setActiveChannel, setActiveTopic, activeChannelId, activeTopicId, lastTopicName, lastChannelSlug } = useChatStore();
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<{ id: string; name: string; channelId: string } | null>(null);

  // If URL has params, use those; otherwise try restoring from store
  const effectiveSlug = initialChannelSlug || lastChannelSlug;

  // Capture initial topic ID in a ref so setActiveChannel clearing the store doesn't lose it
  const initialTopicRef = useRef(initialTopicId || activeTopicId);

  const [showInbox, setShowInbox] = useState(!effectiveSlug);

  // Fetch channels for URL param hydration (shared cache with ChannelList)
  const { data: channels } = useChannels(workspaceId);

  // Fetch topics for the selected channel (shared cache with TopicList)
  const { data: topics } = useTopics(workspaceId, selectedChannel?.id);

  // Hydrate from URL params or saved state on initial mount
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current || !effectiveSlug || !channels) return;

    const channel = channels.find((c) => c.slug === effectiveSlug);
    if (!channel) return;

    setSelectedChannel(channel);
    // Only call setActiveChannel when restoring from URL params;
    // when restoring from saved store state, the store is already correct
    // and calling setActiveChannel would clear the saved topicId.
    if (initialChannelSlug) {
      setActiveChannel(channel.id, channel.slug);
    }
    setShowInbox(false);

    if (!initialTopicRef.current) {
      hydratedRef.current = true;
    }
  }, [effectiveSlug, channels, setActiveChannel, initialChannelSlug]);

  useEffect(() => {
    if (hydratedRef.current || !initialTopicRef.current || !selectedChannel || !topics) return;

    const topic = topics.find((t) => t.id === initialTopicRef.current);
    if (!topic) return;

    setSelectedTopic({ id: topic.id, name: topic.name, channelId: topic.channel_id });
    setActiveTopic(topic.id, topic.name);
    hydratedRef.current = true;
  }, [selectedChannel, topics, setActiveTopic]);

  const handleSelectChannel = useCallback(
    (channel: ChatChannel) => {
      setSelectedChannel(channel);
      setActiveChannel(channel.id, channel.slug);
      setSelectedTopic(null);
      setShowInbox(false);
      window.history.replaceState(null, "", `/chat/${channel.slug}`);
    },
    [setActiveChannel]
  );

  const handleSelectTopic = useCallback(
    (topic: ChatTopic) => {
      setSelectedTopic({ id: topic.id, name: topic.name, channelId: topic.channel_id });
      setActiveTopic(topic.id, topic.name);
      if (selectedChannel) {
        window.history.replaceState(null, "", `/chat/${selectedChannel.slug}/${topic.id}`);
      }
    },
    [setActiveTopic, selectedChannel]
  );

  const handleSelectInboxTopic = useCallback(
    (topic: InboxTopic) => {
      // Find the channel from the loaded channels list so middle panel shows TopicList
      const channel = channels?.find((c) => c.id === topic.channel_id);
      if (channel) {
        setSelectedChannel(channel);
        setActiveChannel(channel.id, channel.slug);
      }
      setSelectedTopic({ id: topic.id, name: topic.name, channelId: topic.channel_id });
      setActiveTopic(topic.id, topic.name);
      setShowInbox(false);
      window.history.replaceState(null, "", `/chat/${topic.channel_slug}/${topic.id}`);
    },
    [setActiveTopic, setActiveChannel, channels]
  );

  const handleSelectInbox = useCallback(() => {
    setShowInbox(true);
    setSelectedChannel(null);
    setActiveChannel(null);
    setSelectedTopic(null);
    window.history.replaceState(null, "", "/chat");
  }, [setActiveChannel]);

  const handleTyping = useCallback(() => {
    if (selectedTopic) {
      sendTyping(selectedTopic.id, selectedTopic.channelId);
    }
  }, [selectedTopic, sendTyping]);

  const handleStopTyping = useCallback(() => {
    if (selectedTopic) {
      sendStopTyping(selectedTopic.id, selectedTopic.channelId);
    }
  }, [selectedTopic, sendStopTyping]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background">
      {/* Left: Channel list */}
      <div className="w-56 flex-shrink-0 border-r border-border flex flex-col">
        <ChannelList
          workspaceId={workspaceId}
          onSelectChannel={handleSelectChannel}
          onSelectInbox={handleSelectInbox}
          showInbox={showInbox && !selectedChannel}
        />
        {/* Connection status */}
        <div className="flex-shrink-0 px-3 py-1.5 border-t border-border flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {isConnected ? (
            <>
              <Wifi className="h-3 w-3 text-green-500" />
              <span>Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-destructive" />
              <span>Reconnecting...</span>
            </>
          )}
        </div>
      </div>

      {/* Middle: Topics or Inbox */}
      <div className="w-72 flex-shrink-0 border-r border-border">
        {showInbox && !selectedChannel ? (
          <InboxView workspaceId={workspaceId} onSelectTopic={handleSelectInboxTopic} />
        ) : selectedChannel ? (
          <TopicList
            workspaceId={workspaceId}
            channelId={selectedChannel.id}
            channelName={selectedChannel.name}
            onSelectTopic={handleSelectTopic}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a channel
          </div>
        )}
      </div>

      {/* Right: Messages */}
      <div className="flex-1 min-w-0">
        {selectedTopic ? (
          <MessageThread
            workspaceId={workspaceId}
            topicId={selectedTopic.id}
            channelId={selectedTopic.channelId}
            topicName={selectedTopic.name}
            isConnected={isConnected}
            onTyping={handleTyping}
            onStopTyping={handleStopTyping}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Select a topic to start chatting</p>
            <p className="text-xs mt-1">Or check your Inbox for unread messages</p>
          </div>
        )}
      </div>
    </div>
  );
}
