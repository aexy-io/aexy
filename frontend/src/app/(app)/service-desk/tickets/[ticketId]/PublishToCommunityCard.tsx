"use client";

import { useState } from "react";
import { ExternalLink, Globe, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useCommunityPublishTargets,
  useServiceDeskMutations,
} from "@/hooks/useServiceDesk";
import type { ServiceDeskTicketDetail } from "@/lib/service-desk-api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://aexy.io";

/**
 * "Publish as community answer" on a ticket.
 *
 * The marketing page has always promised you could seed the forum from tickets;
 * this is that. Two things about it are deliberate:
 *
 * 1. It renders nothing unless the workspace switched the Service Desk link on
 *    in community settings. Publishing a customer's ticket traffic is never a
 *    default, so the action does not exist until somebody asks for it.
 *
 * 2. The body is pre-filled from the ticket and then *edited by a person*. It is
 *    never posted as it arrived. A customer's email contains the customer —
 *    their name, their account, the thing they were annoyed about — and no
 *    redaction heuristic is good enough to run that unattended onto a public
 *    page.
 */
export function PublishToCommunityCard({
  ticket,
  ticketId,
}: {
  ticket: ServiceDeskTicketDetail;
  ticketId: string;
}) {
  const t = useTranslations("serviceDesk");
  const { data: targets } = useCommunityPublishTargets();
  const { publishToCommunity } = useServiceDeskMutations();

  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [title, setTitle] = useState(ticket.subject ?? "");
  // Seeded from the last thing the desk actually sent out, which is where the
  // answer usually is. Still the operator's to rewrite before it goes anywhere.
  const [body, setBody] = useState(() => {
    const outgoing = [...(ticket.correspondence ?? [])]
      .reverse()
      .find((entry) => entry.direction === "outgoing");
    return outgoing?.content ?? "";
  });

  const published = ticket.community_topic;

  if (published) {
    const url = `${SITE_URL}${published.path}`;
    return (
      <Card className="space-y-2 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5" /> {t("detail.publishToCommunity")}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {t("detail.publishedThread")}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <p className="text-xs text-muted-foreground">
          {published.live
            ? t("detail.publishedLive", { channel: published.channel_name ?? "" })
            : t("detail.publishedNotLive")}
        </p>
      </Card>
    );
  }

  // Not opted in, or nowhere public to publish to. Either way, no action.
  if (!targets?.enabled || targets.channels.length === 0) return null;

  const canPublish =
    !publishToCommunity.isPending && channelId && title.trim().length >= 3 && body.trim();

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe className="h-3.5 w-3.5" /> {t("detail.publishToCommunity")}
      </div>

      {!open ? (
        <Button
          variant="outline"
          className="w-full"
          data-testid="publish-to-community-open"
          onClick={() => setOpen(true)}
        >
          {t("detail.publishStart")}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("detail.publishHint")}</p>

          <select
            value={channelId}
            data-testid="publish-channel"
            onChange={(e) => setChannelId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("detail.publishSelectChannel")}</option>
            {targets.channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
          </select>

          <Input
            value={title}
            data-testid="publish-title"
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("detail.publishTitlePlaceholder")}
            aria-label={t("detail.publishTitlePlaceholder")}
          />

          <textarea
            value={body}
            data-testid="publish-body"
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            aria-label={t("detail.publishBodyPlaceholder")}
            placeholder={t("detail.publishBodyPlaceholder")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />

          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t("detail.publishRedactWarning")}
          </p>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              {t("detail.publishCancel")}
            </Button>
            <Button
              className="flex-1"
              disabled={!canPublish}
              data-testid="publish-submit"
              onClick={() =>
                publishToCommunity.mutate({
                  id: ticketId,
                  data: {
                    channel_id: channelId,
                    title: title.trim(),
                    content: body.trim(),
                  },
                })
              }
            >
              {publishToCommunity.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {t("detail.publishSubmit")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
