"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Settings,
  Loader2,
  Edit3,
  Check,
  X,
} from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgent } from "@/hooks/useAgents";
import {
  useAgentConversations,
  useAgentConversation,
  useSendMessage,
} from "@/hooks/useAgentChat";
import { getAgentTypeConfig } from "@/lib/api";
import { ChatInterface, ConversationSidebar } from "@/components/agents/chat";
import { AgentStatusBadge } from "@/components/agents/shared";

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const conversationId = params.conversationId as string;
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const { agent, isLoading: agentLoading } = useAgent(currentWorkspaceId, agentId);
  const {
    conversations,
    isLoading: conversationsLoading,
    deleteConversation,
  } = useAgentConversations(currentWorkspaceId, agentId);
  const {
    conversation,
    messages,
    isLoading: conversationLoading,
    updateConversation,
  } = useAgentConversation(currentWorkspaceId, agentId, conversationId);
  const { sendMessage, isSending } = useSendMessage(
    currentWorkspaceId,
    agentId,
    conversationId
  );

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);

  const handleSendMessage = async (message: string) => {
    try {
      await sendMessage(message);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleSelectConversation = (id: string) => {
    router.push(`/agents/${agentId}/chat/${id}`);
  };

  const handleNewChat = () => {
    router.push(`/agents/${agentId}/chat`);
  };

  const handleDeleteConversation = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    try {
      await deleteConversation(id);
      if (id === conversationId) {
        router.push(`/agents/${agentId}/chat`);
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const handleStartEditTitle = () => {
    setEditTitle(conversation?.title || "");
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (editTitle.trim()) {
      try {
        await updateConversation({ title: editTitle.trim() });
      } catch (error) {
        console.error("Failed to update title:", error);
      }
    }
    setIsEditingTitle(false);
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditTitle("");
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
                {/* Editable conversation title */}
                {isEditingTitle ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveTitle();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                      className="text-sm bg-slate-700 text-white px-2 py-0.5 rounded border border-slate-600 focus:outline-none focus:border-purple-500"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTitle}
                      className="p-1 text-green-400 hover:bg-slate-700 rounded"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1 text-slate-400 hover:bg-slate-700 rounded"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleStartEditTitle}
                    className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-300 group"
                  >
                    <span className="truncate max-w-xs">
                      {conversation?.title || "New conversation"}
                    </span>
                    <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                )}
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
              selectedId={conversationId}
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
            onSend={handleSendMessage}
            isSending={isSending}
            isLoading={conversationLoading}
          />
        </div>
      </div>
    </div>
  );
}
