"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { documentApi } from "@/lib/api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://aexy.io";

/**
 * "Discuss this page" — opens one public community thread per document.
 *
 * Renders nothing unless the workspace switched the docs link on in community
 * settings, which is off by default. A control that always refuses is worse than
 * no control.
 *
 * The thread's opening post is an intro somebody writes here, not a copy of the
 * document. A document is edited after it is published, and a stale copy of it
 * sitting on a public forum page is worse than no copy — the thread links back
 * to the living document instead.
 */
export function DiscussInCommunity({
  workspaceId,
  documentId,
  documentTitle,
  communityTopicId,
}: {
  workspaceId: string;
  documentId: string;
  documentTitle: string;
  /** Set once this document already has a thread. */
  communityTopicId: string | null;
}) {
  const t = useTranslations("docs");
  const queryClient = useQueryClient();

  const { data: targets } = useQuery({
    queryKey: ["document-community-targets", workspaceId],
    queryFn: () => documentApi.communityTargets(workspaceId),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [intro, setIntro] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const alreadyLinked = !!communityTopicId;

  if (!targets?.enabled || targets.channels.length === 0) return null;

  const submit = async () => {
    if (!channelId || !intro.trim()) return;
    setSubmitting(true);
    try {
      const res = await documentApi.discussInCommunity(workspaceId, documentId, {
        channel_id: channelId,
        title: documentTitle,
        content: intro.trim(),
      });
      setLink(res.path ?? null);
      setOpen(false);
      toast.success(res.live ? t("community.opened") : t("community.openedNotLive"));
      queryClient.invalidateQueries({ queryKey: ["document", workspaceId, documentId] });
    } catch {
      toast.error(t("community.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  // Either the document already had a thread, or this session just made one.
  if (alreadyLinked || link) {
    return (
      <ExistingThreadLink
        workspaceId={workspaceId}
        documentId={documentId}
        knownPath={link}
      />
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="discuss-in-community"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
      >
        <MessagesSquare className="h-3.5 w-3.5" />
        {t("community.discuss")}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{t("community.hint")}</p>
      <select
        value={channelId}
        data-testid="discuss-channel"
        onChange={(e) => setChannelId(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="">{t("community.selectChannel")}</option>
        {targets.channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            #{channel.name}
          </option>
        ))}
      </select>
      <textarea
        value={intro}
        data-testid="discuss-intro"
        onChange={(e) => setIntro(e.target.value)}
        rows={3}
        aria-label={t("community.introPlaceholder")}
        placeholder={t("community.introPlaceholder")}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("community.cancel")}
        </button>
        <button
          type="button"
          data-testid="discuss-submit"
          onClick={submit}
          disabled={submitting || !channelId || !intro.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          {t("community.open")}
        </button>
      </div>
    </div>
  );
}

/**
 * Link out to the thread a document already has.
 *
 * The document stores a topic id, not a URL, so the path is resolved by a small
 * GET — lazily, and only for documents that actually have a thread, rather than
 * three joins on every document load for a feature that ships off.
 */
function ExistingThreadLink({
  workspaceId,
  documentId,
  knownPath,
}: {
  workspaceId: string;
  documentId: string;
  /** Set when this session just created the thread, so no fetch is needed. */
  knownPath: string | null;
}) {
  const t = useTranslations("docs");
  const { data } = useQuery({
    queryKey: ["document-community-thread", workspaceId, documentId],
    queryFn: () => documentApi.communityThread(workspaceId, documentId),
    enabled: !knownPath,
    retry: false,
  });

  const path = knownPath ?? data?.path ?? null;
  if (!path) return null;

  return (
    <a
      href={`${SITE_URL}${path}`}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="discuss-view-thread"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
    >
      <MessagesSquare className="h-3.5 w-3.5" />
      {t("community.viewThread")}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
