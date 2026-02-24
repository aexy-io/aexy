"use client";

import { useState } from "react";
import {
  Webhook,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Trash2,
  Play,
  RefreshCw,
  Globe,
  Clock,
  Eye,
  EyeOff,
  Copy,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { HelpTooltip } from "@/components/ui/tooltip";
import { PremiumGate } from "@/components/PremiumGate";
import { useBookingWebhooks, useBookingWebhookEvents } from "@/hooks/useWebhooks";
import { webhooksApi, BookingWebhook } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

function StatusBadge({ webhook }: { webhook: BookingWebhook }) {
  if (!webhook.is_active) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground bg-muted">
        Disabled
      </span>
    );
  }
  if (webhook.failure_count > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-orange-400 bg-orange-400/10">
        <AlertCircle className="h-3 w-3" />
        {webhook.failure_count} failures
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-emerald-400 bg-emerald-400/10">
      <CheckCircle2 className="h-3 w-3" />
      Active
    </span>
  );
}

function WebhookRow({
  webhook,
  onTest,
  onDelete,
  onToggle,
  onRotateSecret,
  workspaceId,
}: {
  webhook: BookingWebhook;
  onTest: (id: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onRotateSecret: (id: string) => void;
  workspaceId: string;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);

  const handleShowSecret = async () => {
    if (showSecret) {
      setShowSecret(false);
      return;
    }
    setLoadingSecret(true);
    try {
      const result = await webhooksApi.getBookingWebhookSecret(workspaceId, webhook.id);
      setSecret(result.secret);
      setShowSecret(true);
    } catch {
      // Silently fail
    } finally {
      setLoadingSecret(false);
    }
  };

  const handleCopySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
    }
  };

  return (
    <div className="p-4 border-b border-border last:border-b-0 hover:bg-card/50 transition">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-foreground truncate">{webhook.name}</h3>
            <StatusBadge webhook={webhook} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Globe className="h-3 w-3" />
            <span className="truncate max-w-sm">{webhook.url}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {webhook.events.map((event) => (
              <span
                key={event}
                className="px-1.5 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 rounded"
              >
                {event}
              </span>
            ))}
          </div>
          {webhook.last_triggered_at && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last triggered {formatDistanceToNow(new Date(webhook.last_triggered_at), { addSuffix: true })}
            </p>
          )}
          {webhook.last_failure_reason && (
            <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
              <XCircle className="h-3 w-3" />
              {webhook.last_failure_reason}
            </p>
          )}
          {/* Secret section */}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleShowSecret}
              disabled={loadingSecret}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
            >
              {loadingSecret ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : showSecret ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              {showSecret ? "Hide" : "Show"} secret
            </button>
            {showSecret && secret && (
              <>
                <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-foreground">
                  {secret.slice(0, 12)}...
                </code>
                <button
                  onClick={handleCopySecret}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  title="Copy secret"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-accent rounded-lg shadow-xl border border-border z-20">
                <button
                  onClick={() => { onTest(webhook.id); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted flex items-center gap-2 rounded-t-lg"
                >
                  <Play className="h-3.5 w-3.5" /> Test Webhook
                </button>
                <button
                  onClick={() => { onToggle(webhook.id, !webhook.is_active); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted flex items-center gap-2"
                >
                  {webhook.is_active ? (
                    <><ToggleLeft className="h-3.5 w-3.5" /> Disable</>
                  ) : (
                    <><ToggleRight className="h-3.5 w-3.5" /> Enable</>
                  )}
                </button>
                <button
                  onClick={() => { onRotateSecret(webhook.id); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted flex items-center gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Rotate Secret
                </button>
                <button
                  onClick={() => { onDelete(webhook.id); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-muted flex items-center gap-2 rounded-b-lg"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateWebhookForm({
  availableEvents,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  availableEvents: string[];
  onSubmit: (data: { name: string; url: string; events: string[] }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const selectAll = () => {
    setSelectedEvents(selectedEvents.length === availableEvents.length ? [] : [...availableEvents]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim() || selectedEvents.length === 0) return;
    onSubmit({ name: name.trim(), url: url.trim(), events: selectedEvents });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-accent/30 rounded-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Webhook"
          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="block text-sm font-medium text-foreground">URL</label>
          <HelpTooltip content="The endpoint that receives HTTP POST requests when selected events occur" />
        </div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhooks"
          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <label className="block text-sm font-medium text-foreground">Events</label>
            <HelpTooltip content="Select which events trigger this webhook. Each event sends a JSON payload with relevant data" />
          </div>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {selectedEvents.length === availableEvents.length ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {availableEvents.map((event) => (
            <label
              key={event}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition ${
                selectedEvents.includes(event)
                  ? "bg-primary/10 border-primary/30 text-foreground"
                  : "bg-muted border-border text-muted-foreground hover:border-border"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedEvents.includes(event)}
                onChange={() => toggleEvent(event)}
                className="sr-only"
              />
              <div
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                  selectedEvents.includes(event)
                    ? "bg-primary border-primary"
                    : "border-muted-foreground"
                }`}
              >
                {selectedEvents.includes(event) && (
                  <CheckCircle2 className="h-2.5 w-2.5 text-primary-foreground" />
                )}
              </div>
              <span className="text-xs">{event}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !name.trim() || !url.trim() || selectedEvents.length === 0}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Create Webhook
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-accent transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function WebhooksSettingsPage() {
  const { currentWorkspaceId } = useWorkspace();
  const {
    webhooks,
    isLoading,
    createWebhook,
    isCreating,
    deleteWebhook,
    updateWebhook,
    testWebhook,
    isTesting,
    rotateSecret,
    refetch,
  } = useBookingWebhooks(currentWorkspaceId);
  const { data: availableEvents } = useBookingWebhookEvents(currentWorkspaceId);

  const [showCreate, setShowCreate] = useState(false);
  const [testResult, setTestResult] = useState<{ webhookId: string; success: boolean; message: string } | null>(null);

  const handleCreate = async (data: { name: string; url: string; events: string[] }) => {
    try {
      await createWebhook(data);
      setShowCreate(false);
    } catch (error) {
      console.error("Failed to create webhook:", error);
    }
  };

  const handleDelete = async (webhookId: string) => {
    try {
      await deleteWebhook(webhookId);
    } catch (error) {
      console.error("Failed to delete webhook:", error);
    }
  };

  const handleToggle = async (webhookId: string, isActive: boolean) => {
    try {
      await updateWebhook({ webhookId, data: { is_active: isActive } });
    } catch (error) {
      console.error("Failed to toggle webhook:", error);
    }
  };

  const handleTest = async (webhookId: string) => {
    try {
      const result = await testWebhook(webhookId);
      setTestResult({
        webhookId,
        success: result.success,
        message: result.success
          ? `Success (${result.status_code}) in ${result.response_time_ms}ms`
          : result.error || "Test failed",
      });
      setTimeout(() => setTestResult(null), 5000);
    } catch (error) {
      setTestResult({
        webhookId,
        success: false,
        message: "Failed to send test",
      });
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const handleRotateSecret = async (webhookId: string) => {
    try {
      await rotateSecret(webhookId);
    } catch (error) {
      console.error("Failed to rotate secret:", error);
    }
  };

  return (
    <PremiumGate feature="webhooks">
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Webhooks</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Receive real-time notifications when events occur in your workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-foreground hover:bg-accent transition text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus className="h-4 w-4" />
            Add Webhook
          </button>
        </div>
      </div>

      {/* Test result toast */}
      {testResult && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            testResult.success
              ? "bg-emerald-400/10 border border-emerald-400/20 text-emerald-400"
              : "bg-red-400/10 border border-red-400/20 text-red-400"
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {testResult.message}
          <button
            onClick={() => setTestResult(null)}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <CreateWebhookForm
          availableEvents={availableEvents || []}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          isSubmitting={isCreating}
        />
      )}

      {/* Webhook list */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="animate-pulse divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-32 bg-accent rounded" />
                      <div className="h-5 w-16 bg-accent rounded-full" />
                    </div>
                    <div className="h-3 w-64 bg-accent rounded" />
                    <div className="flex gap-2">
                      {[1, 2].map((j) => (
                        <div key={j} className="h-4 w-20 bg-accent rounded" />
                      ))}
                    </div>
                  </div>
                  <div className="h-8 w-8 bg-accent rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Webhook className="h-10 w-10 mb-3" />
            <p className="text-sm font-medium">No webhooks configured</p>
            <p className="text-xs mt-1">Add a webhook to receive event notifications</p>
          </div>
        ) : (
          <div>
            <div className="px-4 py-3 border-b border-border bg-background/50">
              <p className="text-sm text-muted-foreground">
                {webhooks.length} webhook{webhooks.length !== 1 ? "s" : ""}
              </p>
            </div>
            {currentWorkspaceId && webhooks.map((webhook) => (
              <WebhookRow
                key={webhook.id}
                webhook={webhook}
                workspaceId={currentWorkspaceId}
                onTest={handleTest}
                onDelete={handleDelete}
                onToggle={handleToggle}
                onRotateSecret={handleRotateSecret}
              />
            ))}
          </div>
        )}
      </div>

      {/* Documentation section */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="text-sm font-semibold text-foreground">Webhook Signature Verification</h3>
          <HelpTooltip content="Used to sign webhook payloads with HMAC-SHA256. Verify signatures to ensure requests are authentic" />
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          All webhook payloads are signed with HMAC-SHA256. Verify the signature using the{" "}
          <code className="bg-muted px-1 py-0.5 rounded">X-Aexy-Signature</code> header.
        </p>
        <div className="bg-muted rounded-lg p-3">
          <code className="text-xs text-foreground block whitespace-pre">{`const crypto = require('crypto');
const signature = req.headers['x-aexy-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(req.body))
  .digest('hex');
const valid = crypto.timingSafeEqual(
  Buffer.from(signature), Buffer.from(expected)
);`}</code>
        </div>
      </div>
    </div>
    </PremiumGate>
  );
}
