"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  MailOpen,
  Search,
  RefreshCw,
  ChevronLeft,
  ExternalLink,
  Link2,
  User,
  Building2,
  Clock,
  Paperclip,
  Reply,
  Send,
  X,
  AlertCircle,
  Inbox,
  Star,
  Archive,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspace } from "@/hooks/useWorkspace";
import { googleIntegrationApi, developerApi, SyncedEmail } from "@/lib/api";

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function EmailListItem({
  email,
  isSelected,
  onClick,
}: {
  email: SyncedEmail;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isUnread = !email.is_read;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 border-b border-slate-800 transition-colors ${
        isSelected
          ? "bg-purple-500/10 border-l-2 border-l-purple-500"
          : "hover:bg-slate-800/50"
      } ${isUnread ? "bg-slate-800/30" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
            isUnread
              ? "bg-purple-500/20 text-purple-400"
              : "bg-slate-700 text-slate-400"
          }`}
        >
          {email.from_name?.[0]?.toUpperCase() || email.from_email?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span
              className={`truncate text-sm ${
                isUnread ? "font-semibold text-white" : "text-slate-300"
              }`}
            >
              {email.from_name || email.from_email}
            </span>
            <span className="text-xs text-slate-500 flex-shrink-0">
              {formatDate(email.gmail_date)}
            </span>
          </div>
          <p
            className={`text-sm truncate mb-1 ${
              isUnread ? "text-slate-200" : "text-slate-400"
            }`}
          >
            {email.subject || "(no subject)"}
          </p>
          <p className="text-xs text-slate-500 truncate">{email.snippet}</p>
        </div>
        {isUnread && (
          <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 mt-2" />
        )}
      </div>
    </button>
  );
}

function EmailDetail({
  email,
  workspaceId,
  onClose,
  onLinkToRecord,
}: {
  email: SyncedEmail;
  workspaceId: string;
  onClose: () => void;
  onLinkToRecord: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setIsSending(true);
    try {
      await googleIntegrationApi.gmail.sendEmail(workspaceId, {
        to: email.from_email,
        subject: `Re: ${email.subject}`,
        body_html: `<p>${replyText.replace(/\n/g, "<br>")}</p>`,
        reply_to_message_id: email.gmail_id,
      });
      setReplyText("");
      setShowReply(false);
    } catch (error) {
      console.error("Failed to send reply:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <button
          onClick={onClose}
          className="lg:hidden flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onLinkToRecord}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
          >
            <Link2 className="w-4 h-4" />
            Link to Record
          </button>
          <button
            onClick={() => setShowReply(!showReply)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Reply className="w-4 h-4" />
            Reply
          </button>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-xl font-semibold text-white mb-4">
          {email.subject || "(no subject)"}
        </h1>

        <div className="flex items-start gap-4 mb-6 pb-6 border-b border-slate-800">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-medium">
            {email.from_name?.[0]?.toUpperCase() || email.from_email?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-white">
                {email.from_name || email.from_email}
              </span>
              <span className="text-sm text-slate-500">&lt;{email.from_email}&gt;</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(email.gmail_date).toLocaleString()}
              </span>
              {email.to_emails && email.to_emails.length > 0 && (
                <span>To: {email.to_emails.join(", ")}</span>
              )}
            </div>
          </div>
        </div>

        {/* Email body */}
        <div className="prose prose-invert max-w-none">
          {email.body_text ? (
            <pre className="whitespace-pre-wrap text-slate-300 font-sans text-sm leading-relaxed">
              {email.body_text}
            </pre>
          ) : (
            <p className="text-slate-500 italic">No message content</p>
          )}
        </div>

        {/* Labels */}
        {email.labels && email.labels.length > 0 && (
          <div className="flex items-center gap-2 mt-6 pt-6 border-t border-slate-800">
            <span className="text-xs text-slate-500">Labels:</span>
            {email.labels.map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded"
              >
                {label.replace("CATEGORY_", "").toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Reply Box */}
      <AnimatePresence>
        {showReply && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-800 p-4"
          >
            <div className="flex items-center gap-2 mb-2 text-sm text-slate-400">
              <Reply className="w-4 h-4" />
              Replying to {email.from_name || email.from_email}
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write your reply..."
              rows={4}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowReply(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim() || isSending}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LinkToRecordModal({
  isOpen,
  onClose,
  email,
  workspaceId,
}: {
  isOpen: boolean;
  onClose: () => void;
  email: SyncedEmail;
  workspaceId: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [linkType, setLinkType] = useState<"person" | "company">("person");

  if (!isOpen) return null;

  const handleLink = async (recordId: string) => {
    setIsLinking(true);
    try {
      await googleIntegrationApi.gmail.linkEmailToRecord(workspaceId, email.id, recordId, linkType);
      onClose();
    } catch (error) {
      console.error("Failed to link email:", error);
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Link to Record</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setLinkType("person")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              linkType === "person"
                ? "bg-purple-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            <User className="w-4 h-4" />
            Person
          </button>
          <button
            onClick={() => setLinkType("company")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              linkType === "company"
                ? "bg-purple-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Company
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${linkType === "person" ? "people" : "companies"}...`}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="text-center py-8 text-slate-400">
          <p className="text-sm">
            Search for a {linkType} record to link this email to.
          </p>
          <p className="text-xs mt-2 text-slate-500">
            Linked emails will appear in the record&apos;s activity timeline.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  hasIntegration,
  onConnect,
  onSync,
}: {
  hasIntegration: boolean;
  onConnect: () => void;
  onSync: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-4">
      <div className="bg-slate-800/50 rounded-full p-6 mb-6">
        <Inbox className="h-12 w-12 text-slate-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">
        {hasIntegration ? "No emails synced yet" : "Connect your email"}
      </h2>
      <p className="text-slate-400 text-center max-w-md mb-6">
        {hasIntegration
          ? "Sync your Gmail to see emails here and automatically link them to contacts."
          : "Connect your Google account to sync emails and calendar events."}
      </p>
      <button
        onClick={hasIntegration ? onSync : onConnect}
        className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
      >
        {hasIntegration ? (
          <>
            <RefreshCw className="h-4 w-4" />
            Sync Now
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" />
            Connect Gmail
          </>
        )}
      </button>
    </div>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  // Check if returning from OAuth reconnect
  const isReconnecting = searchParams.get("reconnected") === "true";

  const [emails, setEmails] = useState<SyncedEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<SyncedEmail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasIntegration, setHasIntegration] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const loadEmails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // First check workspace-level integration status
        let status = await googleIntegrationApi.getStatus(workspaceId);

        // Check developer level and sync tokens if:
        // 1. Not connected at workspace level, OR
        // 2. Returning from reconnect flow (need to refresh tokens)
        if (!status.is_connected || isReconnecting) {
          try {
            const developerStatus = await developerApi.getGoogleStatus();
            if (developerStatus.is_connected) {
              // Link/refresh developer's Google tokens to workspace
              await googleIntegrationApi.connectFromDeveloper(workspaceId);
              status = await googleIntegrationApi.getStatus(workspaceId);

              // Clear the reconnected param from URL
              if (isReconnecting) {
                router.replace("/crm/inbox", { scroll: false });
              }
            }
          } catch (linkError: unknown) {
            // Check if the error is about missing scopes
            const errorMessage = linkError instanceof Error ? linkError.message : String(linkError);
            if (errorMessage.includes("permissions") || errorMessage.includes("scopes")) {
              setError("Your Google connection needs Gmail permissions. Please reconnect with full access.");
              setNeedsReconnect(true);
            }
            // Continue with workspace-only status
          }
        }

        const hasGmailSync = status.is_connected && status.gmail_sync_enabled;
        setHasIntegration(hasGmailSync);

        if (hasGmailSync) {
          const response = await googleIntegrationApi.gmail.listEmails(workspaceId);
          setEmails(response.emails);
        }
      } catch (err) {
        console.error("Failed to load emails:", err);
        setError("Failed to load emails");
      } finally {
        setIsLoading(false);
      }
    };

    loadEmails();
  }, [workspaceId, isReconnecting, router]);

  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const result = await googleIntegrationApi.gmail.sync(workspaceId);

      // Check for errors in response
      if (result.status === "error" || result.error) {
        const errorMessage = result.error || "Gmail sync failed";
        setSyncError(errorMessage);
        console.error("Gmail sync error:", errorMessage);

        // Check if it's a permissions/scope error
        if (errorMessage.includes("403") || errorMessage.includes("scope") || errorMessage.includes("permission")) {
          setNeedsReconnect(true);
          setSyncError("Gmail permissions are insufficient. Please reconnect with full access.");
        }
        return;
      }

      // Reload emails after successful sync
      const response = await googleIntegrationApi.gmail.listEmails(workspaceId);
      setEmails(response.emails);
    } catch (err) {
      console.error("Failed to sync emails:", err);
      setSyncError("Failed to sync emails. Please try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConnect = async () => {
    if (!workspaceId) return;
    try {
      const { auth_url } = await googleIntegrationApi.getConnectUrl(workspaceId, window.location.href);
      window.location.href = auth_url;
    } catch (err) {
      console.error("Failed to get connect URL:", err);
    }
  };

  const handleReconnect = () => {
    // Redirect to Google CRM connect with full permissions
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    // Add reconnected=true param so we know to refresh tokens when returning
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("reconnected", "true");
    const redirectUrl = encodeURIComponent(currentUrl.toString());
    window.location.href = `${apiBase}/auth/google/connect-crm?redirect_url=${redirectUrl}`;
  };

  const filteredEmails = emails.filter(
    (email) =>
      email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.from_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.from_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.snippet?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading workspace...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/crm")}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              CRM
            </button>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-purple-400" />
              Inbox
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {hasIntegration && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
                />
                {isSyncing ? "Syncing..." : "Sync"}
              </button>
            )}
            <button
              onClick={() => router.push("/crm/settings/integrations")}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {(error || syncError) && (
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/30">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-4 h-4" />
              {error || syncError}
            </div>
            <div className="flex items-center gap-3">
              {needsReconnect && (
                <button
                  onClick={handleReconnect}
                  className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
                >
                  Reconnect Google
                </button>
              )}
              {(syncError || error) && (
                <button
                  onClick={() => {
                    setSyncError(null);
                    setError(null);
                    setNeedsReconnect(false);
                  }}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!hasIntegration || emails.length === 0 ? (
        <EmptyState
          hasIntegration={hasIntegration}
          onConnect={handleConnect}
          onSync={handleSync}
        />
      ) : (
        <div className="flex h-[calc(100vh-73px)]">
          {/* Email List */}
          <div
            className={`w-full lg:w-96 border-r border-slate-800 flex flex-col ${
              selectedEmail ? "hidden lg:flex" : "flex"
            }`}
          >
            {/* Search */}
            <div className="p-4 border-b border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search emails..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Email List */}
            <div className="flex-1 overflow-auto">
              {filteredEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                  <Search className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-slate-400">No emails found</p>
                </div>
              ) : (
                filteredEmails.map((email) => (
                  <EmailListItem
                    key={email.id}
                    email={email}
                    isSelected={selectedEmail?.id === email.id}
                    onClick={() => setSelectedEmail(email)}
                  />
                ))
              )}
            </div>

            {/* Stats */}
            <div className="p-4 border-t border-slate-800 text-sm text-slate-500">
              {filteredEmails.length} email{filteredEmails.length !== 1 ? "s" : ""}
              {searchQuery && ` matching "${searchQuery}"`}
            </div>
          </div>

          {/* Email Detail */}
          <div
            className={`flex-1 ${
              selectedEmail ? "flex" : "hidden lg:flex"
            } flex-col`}
          >
            {selectedEmail ? (
              <EmailDetail
                email={selectedEmail}
                workspaceId={workspaceId}
                onClose={() => setSelectedEmail(null)}
                onLinkToRecord={() => setShowLinkModal(true)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <MailOpen className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p>Select an email to view</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Link to Record Modal */}
      {selectedEmail && (
        <LinkToRecordModal
          isOpen={showLinkModal}
          onClose={() => setShowLinkModal(false)}
          email={selectedEmail}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}
