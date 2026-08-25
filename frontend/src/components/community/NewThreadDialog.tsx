"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { chatApi, communityApi, type CommunityMemberChannel } from "@/lib/api";

const NEW_CHANNEL = "__new__";

/**
 * Composer for members to start a new thread in this community. Reuses the
 * existing authenticated chat endpoints (create channel / create topic), and —
 * for admins only — flips the new topic to web-public so it appears on the
 * public forum. A plain overlay dialog to match the community page's light
 * forum frame (the surrounding pages don't pull in the app's Radix chrome).
 */
export function NewThreadDialog({
  workspaceId,
  channels,
  canPostPublic,
  open,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  channels: CommunityMemberChannel[];
  canPostPublic: boolean;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("community");
  const tc = useTranslations("common");
  const firstChannelId = channels[0]?.id ?? NEW_CHANNEL;

  const [channelId, setChannelId] = useState(firstChannelId);
  const [newChannelName, setNewChannelName] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [postPublic, setPostPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form each time the dialog opens (channels may have changed).
  useEffect(() => {
    if (open) {
      setChannelId(channels[0]?.id ?? NEW_CHANNEL);
      setNewChannelName("");
      setTitle("");
      setMessage("");
      setPostPublic(false);
      setSubmitting(false);
    }
  }, [open, channels]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isNewChannel = channelId === NEW_CHANNEL;
  const canSubmit =
    !submitting &&
    title.trim() &&
    message.trim() &&
    (!isNewChannel || newChannelName.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let targetChannelId = channelId;
      if (isNewChannel) {
        const channel = await chatApi.createChannel(workspaceId, {
          name: newChannelName.trim(),
        });
        targetChannelId = channel.id;
      }

      const topic = await chatApi.createTopic(workspaceId, targetChannelId, {
        name: title.trim(),
        first_message: message.trim(),
      });

      if (postPublic && canPostPublic) {
        await communityApi.setTopicVisibility(workspaceId, topic.id, {
          visibility: "web_public",
        });
      }

      toast.success(t("compose.success"));
      onCreated();
      onClose();
    } catch {
      toast.error(t("compose.error"));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ledger-ink/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("compose.title")}
        className="w-full max-w-md rounded-[3px] border border-ledger-ink/15 bg-ledger-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {t("compose.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ledger-ink/50 transition hover:bg-ledger-ink/5 hover:text-ledger-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/60">
              {t("compose.channelLabel")}
            </label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full rounded-[3px] border border-ledger-ink/15 bg-ledger-paper px-3 py-2 text-sm focus:border-ledger-ink/35 focus:outline-none"
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
              <option value={NEW_CHANNEL}>{t("compose.newChannelOption")}</option>
            </select>
            {isNewChannel && (
              <input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder={t("compose.newChannelPlaceholder")}
                className="mt-2 w-full rounded-[3px] border border-ledger-ink/15 bg-ledger-paper px-3 py-2 text-sm focus:border-ledger-ink/35 focus:outline-none"
                autoFocus
              />
            )}
          </div>

          <div>
            <label className="mb-1.5 block font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/60">
              {t("compose.threadTitleLabel")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("compose.threadTitlePlaceholder")}
              className="w-full rounded-[3px] border border-ledger-ink/15 bg-ledger-paper px-3 py-2 text-sm focus:border-ledger-ink/35 focus:outline-none"
              autoFocus={!isNewChannel}
            />
          </div>

          <div>
            <label className="mb-1.5 block font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/60">
              {t("compose.messageLabel")}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("compose.messagePlaceholder")}
              rows={4}
              className="w-full rounded-[3px] border border-ledger-ink/15 bg-ledger-paper px-3 py-2 text-sm focus:border-ledger-ink/35 focus:outline-none"
            />
          </div>

          {canPostPublic && (
            <label className="flex items-start gap-2 rounded-[3px] border border-ledger-ink/15 bg-ledger-paper p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={postPublic}
                onChange={(e) => setPostPublic(e.target.checked)}
              />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium text-ledger-ink">
                  <Globe className="h-3.5 w-3.5" />
                  {t("compose.postPublicly")}
                </span>
                <span className="text-xs leading-5 text-ledger-ink/60">
                  {t("compose.postPubliclyHint")}
                </span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[3px] border border-ledger-ink/20 px-4 py-2 text-sm transition hover:border-ledger-ink/40"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-[3px] bg-ledger-ink px-4 py-2 text-sm text-ledger-paper transition hover:bg-ledger-ink/85 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? t("compose.submitting") : t("compose.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
