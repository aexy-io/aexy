"use client";

import { useChatStore } from "@/stores/chatStore";

interface TypingIndicatorProps {
  topicId: string;
}

export function TypingIndicator({ topicId }: TypingIndicatorProps) {
  const typingUsers = useChatStore((s) =>
    s.typingUsers.filter((u) => u.topic_id === topicId)
  );

  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((u) => u.developer_name);
  let text: string;
  if (names.length === 1) {
    text = `${names[0]} is typing...`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing...`;
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing...`;
  }

  return (
    <div className="px-4 py-1 text-xs text-muted-foreground animate-pulse">
      {text}
    </div>
  );
}
