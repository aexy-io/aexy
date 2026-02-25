"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  Settings,
  Loader2,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgent } from "@/hooks/useAgents";
import {
  useAgentConversations,
  useCreateConversation,
  useSendMessage,
  useOptimisticMessage,
} from "@/hooks/useAgentChat";
import { getAgentTypeConfig, AgentMessage } from "@/lib/api";
import { ChatInterface, ConversationSidebar } from "@/components/agents/chat";
import { AgentStatusBadge } from "@/components/agents/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export default function AgentChatPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const { agent, isLoading: agentLoading } = useAgent(currentWorkspaceId, agentId);
  const {
    conversations,
    isLoading: conversationsLoading,
    deleteConversation,
  } = useAgentConversations(currentWorkspaceId, agentId);
  const { createConversation, isCreating } = useCreateConversation(
    currentWorkspaceId,
    agentId
  );

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Handle new conversation creation and first message
  const handleSendFirstMessage = async (message: string) => {
    if (!currentWorkspaceId || !agentId) return;

    setIsSending(true);
    try {
      const result = await createConversation({ message });
      // Navigate to the new conversation
      router.push(`/agents/${agentId}/chat/${result.id}`);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    router.push(`/agents/${agentId}/chat/${conversationId}`);
  };

  const handleNewChat = () => {
    // Stay on this page for new chat
    setMessages([]);
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (!confirm("Delete this conversation?")) return;
    try {
      await deleteConversation(conversationId);
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const isLoading = currentWorkspaceLoading || agentLoading;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] animate-pulse">
        <div className="w-64 border-r border-border p-4 space-y-3">
          <div className="h-9 bg-accent rounded-lg" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-accent rounded-lg" />
          ))}
        </div>
        <div className="flex-1 flex flex-col">
          <div className="border-b border-border p-4 flex items-center gap-3">
            <div className="h-8 w-8 bg-accent rounded-full" />
            <div className="h-4 w-32 bg-accent rounded" />
          </div>
          <div className="flex-1 p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : ''}`}>
                <div className="h-16 w-2/3 bg-accent rounded-xl" />
              </div>
            ))}
          </div>
          <div className="border-t border-border p-4">
            <div className="h-10 bg-accent rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-medium text-foreground mb-2">Agent Not Found</h2>
          <Breadcrumb
            items={[{ label: "Agents", href: "/agents" }]}
            className="justify-center"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-muted/50">
        <div className="px-4 py-3">
          <Breadcrumb
            items={[
              { label: "Agents", href: "/agents" },
              { label: agent.name, href: `/agents/${agentId}` },
              { label: "Chat" },
            ]}
            className="mb-3"
          />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: `${getAgentTypeConfig(agent.agent_type).color}20`,
                  }}
                >
                  <Bot
                    className="h-5 w-5"
                    style={{
                      color: getAgentTypeConfig(agent.agent_type).color,
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold text-foreground">{agent.name}</h1>
                    <AgentStatusBadge isActive={agent.is_active} size="sm" />
                  </div>
                  <p className="text-sm text-muted-foreground">Chat</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/agents/${agentId}/edit`}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <div className="w-64 flex-shrink-0">
            <ConversationSidebar
              conversations={conversations}
              selectedId={null}
              onSelect={handleSelectConversation}
              onNew={handleNewChat}
              onDelete={handleDeleteConversation}
              isLoading={conversationsLoading}
            />
          </div>
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          <ChatInterface
            agent={agent}
            messages={messages}
            onSend={handleSendFirstMessage}
            isSending={isSending || isCreating}
          />
        </div>
      </div>
    </div>
  );
}
