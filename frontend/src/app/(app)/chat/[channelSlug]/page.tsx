"use client";

import { useParams } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { ChatLayout } from "../components/ChatLayout";

export default function ChannelPage() {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const { isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <div className="animate-pulse text-sm text-muted-foreground">Loading chat...</div>
      </div>
    );
  }

  if (!currentWorkspaceId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <p className="text-sm text-muted-foreground">Please select a workspace first.</p>
      </div>
    );
  }

  return <ChatLayout workspaceId={currentWorkspaceId} initialChannelSlug={channelSlug} />;
}
