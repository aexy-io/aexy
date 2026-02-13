"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  MoreVertical,
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-purple-500 animate-spin mx-auto mb-4" />
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Bot className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-medium text-white mb-2">Agent Not Found</h2>
          <Link href="/agents" className="text-purple-400 hover:text-purple-300">
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-700 bg-slate-800/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href={`/agents/${agentId}`}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
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
                  <h1 className="text-lg font-semibold text-white">{agent.name}</h1>
                  <AgentStatusBadge isActive={agent.is_active} size="sm" />
                </div>
                <p className="text-sm text-slate-400">Chat</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/agents/${agentId}/edit`}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <Settings className="h-5 w-5" />
            </Link>
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
