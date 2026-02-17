"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  MailOpen,
  Send,
  AlertTriangle,
  Archive,
  Clock,
  User,
  RefreshCw,
  Sparkles,
  ChevronRight,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgent } from "@/hooks/useAgents";
import { useAgentInbox, useAgentInboxMessage } from "@/hooks/useAgentInbox";
import { AgentInboxMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20",
  },
  processing: {
    label: "Processing",
    icon: RefreshCw,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
  },
  responded: {
    label: "Responded",
    icon: CheckCircle,
    color: "text-green-400",
    bgColor: "bg-green-500/20",
  },
  escalated: {
    label: "Escalated",
    icon: ArrowUpRight,
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    color: "text-muted-foreground",
    bgColor: "bg-muted-foreground/20",
  },
};

const priorityConfig = {
  low: { label: "Low", color: "text-muted-foreground", bgColor: "bg-muted-foreground/20" },
  normal: { label: "Normal", color: "text-blue-400", bgColor: "bg-blue-500/20" },
  high: { label: "High", color: "text-orange-400", bgColor: "bg-orange-500/20" },
  urgent: { label: "Urgent", color: "text-red-400", bgColor: "bg-red-500/20" },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = diff / (1000 * 60 * 60);

  if (hours < 1) {
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${Math.floor(hours)}h ago`;
  }
  if (hours < 48) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function MessageCard({
  message,
  isSelected,
  onClick,
}: {
  message: AgentInboxMessage;
  isSelected: boolean;
  onClick: () => void;
}) {
  const status = statusConfig[message.status] || statusConfig.pending;
  const priority = priorityConfig[message.priority] || priorityConfig.normal;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 border-b border-border hover:bg-muted/50 transition-colors",
        isSelected && "bg-muted/50 border-l-2 border-l-blue-500"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground truncate">
              {message.from_name || message.from_email}
            </span>
            {message.priority !== "normal" && (
              <span className={cn("text-xs px-1.5 py-0.5 rounded", priority.bgColor, priority.color)}>
                {priority.label}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground truncate">
            {message.subject || "(No subject)"}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-1">
            {message.body_text?.slice(0, 100) || "(No content)"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">{formatDate(message.created_at)}</span>
          <div className={cn("p-1 rounded", status.bgColor)}>
            <status.icon className={cn("h-3 w-3", status.color)} />
          </div>
        </div>
      </div>
      {message.confidence_score !== null && (
        <div className="flex items-center gap-2 mt-2">
          <Sparkles className="h-3 w-3 text-purple-400" />
          <span className="text-xs text-purple-400">
            {Math.round(message.confidence_score * 100)}% confidence
          </span>
        </div>
      )}
    </button>
  );
}

function MessageDetail({
  message,
  agentId,
  workspaceId,
  onReply,
  onEscalate,
  onArchive,
  onProcess,
  isReplying,
  isEscalating,
  isArchiving,
  isProcessing,
}: {
  message: AgentInboxMessage;
  agentId: string;
  workspaceId: string;
  onReply: (body: string, useSuggested?: boolean) => void;
  onEscalate: (escalateTo: string, note?: string) => void;
  onArchive: () => void;
  onProcess: () => void;
  isReplying: boolean;
  isEscalating: boolean;
  isArchiving: boolean;
  isProcessing: boolean;
}) {
  const [replyText, setReplyText] = useState("");
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const status = statusConfig[message.status] || statusConfig.pending;
  const priority = priorityConfig[message.priority] || priorityConfig.normal;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg", status.bgColor)}>
              <status.icon className={cn("h-4 w-4", status.color)} />
            </div>
            <span className={cn("text-sm font-medium", status.color)}>
              {status.label}
            </span>
            {message.priority !== "normal" && (
              <span className={cn("text-xs px-2 py-0.5 rounded", priority.bgColor, priority.color)}>
                {priority.label}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(message.created_at).toLocaleString()}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {message.subject || "(No subject)"}
        </h2>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            <span>{message.from_name || message.from_email}</span>
          </div>
          <span className="text-muted-foreground">to</span>
          <span>{message.to_email}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* AI Analysis */}
        {(message.classification || message.summary) && (
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-300">AI Analysis</span>
              {message.confidence_score !== null && (
                <span className="text-xs text-purple-400 ml-auto">
                  {Math.round(message.confidence_score * 100)}% confidence
                </span>
              )}
            </div>
            {message.summary && (
              <p className="text-sm text-foreground mb-2">{message.summary}</p>
            )}
            {message.classification && (
              <div className="flex flex-wrap gap-2 text-xs">
                {message.classification.sentiment && (
                  <span className="px-2 py-1 bg-accent rounded text-foreground">
                    Sentiment: {message.classification.sentiment}
                  </span>
                )}
                {message.classification.urgency && (
                  <span className="px-2 py-1 bg-accent rounded text-foreground">
                    Urgency: {message.classification.urgency}
                  </span>
                )}
                {message.classification.intent && (
                  <span className="px-2 py-1 bg-accent rounded text-foreground">
                    Intent: {message.classification.intent}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Email Body */}
        <div className="prose prose-sm prose-invert max-w-none">
          {message.body_html ? (
            <div dangerouslySetInnerHTML={{ __html: message.body_html }} />
          ) : (
            <p className="whitespace-pre-wrap">{message.body_text}</p>
          )}
        </div>

        {/* Suggested Response */}
        {message.suggested_response && message.status === "pending" && (
          <div className="mt-6 bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium text-green-300">Suggested Response</span>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap mb-4">
              {message.suggested_response}
            </p>
            <button
              onClick={() => onReply(message.suggested_response!, true)}
              disabled={isReplying}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              {isReplying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Suggested Response
            </button>
          </div>
        )}
      </div>

      {/* Actions Footer */}
      {message.status === "pending" && (
        <div className="p-4 border-t border-border bg-muted/50">
          {!message.classification && (
            <button
              onClick={onProcess}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 mb-3"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Analyze with AI
            </button>
          )}

          <div className="space-y-3">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a custom reply..."
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (replyText.trim()) {
                    onReply(replyText);
                    setReplyText("");
                  }
                }}
                disabled={isReplying || !replyText.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {isReplying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Reply
              </button>
              <button
                onClick={() => setShowEscalateModal(true)}
                disabled={isEscalating}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                <ArrowUpRight className="h-4 w-4" />
                Escalate
              </button>
              <button
                onClick={onArchive}
                disabled={isArchiving}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Archive className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {message.status === "responded" && (
        <div className="p-4 border-t border-border bg-green-500/10">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">
              Response sent on {message.responded_at ? new Date(message.responded_at).toLocaleString() : "Unknown"}
            </span>
          </div>
        </div>
      )}

      {message.status === "escalated" && (
        <div className="p-4 border-t border-border bg-orange-500/10">
          <div className="flex items-center gap-2 text-orange-400">
            <ArrowUpRight className="h-5 w-5" />
            <span className="text-sm font-medium">
              Escalated on {message.escalated_at ? new Date(message.escalated_at).toLocaleString() : "Unknown"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentInboxPage() {
  const params = useParams();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const agentId = params.agentId as string;
  const workspaceId = currentWorkspace?.id || null;

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { agent, isLoading: agentLoading } = useAgent(workspaceId, agentId);
  const {
    messages,
    isLoading: inboxLoading,
    refetch,
    replyToMessage,
    escalateMessage,
    archiveMessage,
    processMessage,
    isReplying,
    isEscalating,
    isArchiving,
    isProcessing,
  } = useAgentInbox(workspaceId, agentId, { status: statusFilter });

  const selectedMessage = messages.find((m) => m.id === selectedMessageId);

  const handleReply = async (body: string, useSuggested?: boolean) => {
    if (!selectedMessageId) return;
    await replyToMessage({
      messageId: selectedMessageId,
      body,
      useSuggested,
    });
    refetch();
  };

  const handleEscalate = async (escalateTo: string, note?: string) => {
    if (!selectedMessageId) return;
    await escalateMessage({
      messageId: selectedMessageId,
      escalateTo,
      note,
    });
    refetch();
  };

  const handleArchive = async () => {
    if (!selectedMessageId) return;
    await archiveMessage(selectedMessageId);
    setSelectedMessageId(null);
    refetch();
  };

  const handleProcess = async () => {
    if (!selectedMessageId) return;
    await processMessage(selectedMessageId);
    refetch();
  };

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                href={`/agents/${agentId}`}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-400" />
                  <h1 className="text-xl font-bold text-foreground">
                    {agent?.name || "Agent"} Inbox
                  </h1>
                </div>
                {agent?.email_address && (
                  <p className="text-sm text-muted-foreground mt-1">{agent.email_address}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={statusFilter || ""}
                onChange={(e) => setStatusFilter(e.target.value || undefined)}
                className="bg-accent border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="responded">Responded</option>
                <option value="escalated">Escalated</option>
                <option value="archived">Archived</option>
              </select>
              <button
                onClick={() => refetch()}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {agentLoading || inboxLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : !agent?.email_enabled ? (
          <div className="text-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">Email Not Enabled</h2>
            <p className="text-muted-foreground mb-4">
              Enable email for this agent to start receiving messages.
            </p>
            <Link
              href={`/settings/agents/${agentId}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Configure Email
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <MailOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">No Messages</h2>
            <p className="text-muted-foreground">
              {statusFilter
                ? `No ${statusFilter} messages found.`
                : "This inbox is empty. Send an email to start."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
            {/* Message List */}
            <div className="lg:col-span-1 bg-muted border border-border rounded-xl overflow-hidden">
              <div className="overflow-y-auto h-full">
                {messages.map((message) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    isSelected={message.id === selectedMessageId}
                    onClick={() => setSelectedMessageId(message.id)}
                  />
                ))}
              </div>
            </div>

            {/* Message Detail */}
            <div className="lg:col-span-2 bg-muted border border-border rounded-xl overflow-hidden">
              {selectedMessage ? (
                <MessageDetail
                  message={selectedMessage}
                  agentId={agentId}
                  workspaceId={workspaceId}
                  onReply={handleReply}
                  onEscalate={handleEscalate}
                  onArchive={handleArchive}
                  onProcess={handleProcess}
                  isReplying={isReplying}
                  isEscalating={isEscalating}
                  isArchiving={isArchiving}
                  isProcessing={isProcessing}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a message to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
