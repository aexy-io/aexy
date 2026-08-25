"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { communityPublicApi, type CommunityReactionState } from "@/lib/api";

/** Kept in step with PUBLIC_REACTIONS in the backend's public_community_service. */
const CHOICES = ["👍", "❤️", "🎉", "👀", "🙏"] as const;

/**
 * Reactions on one public message.
 *
 * Counts arrive server-rendered with the page; whether *you* reacted does not,
 * because that page is cached and served to every anonymous reader. So the bar
 * mounts with the shared counts and then, once it knows who is looking, marks
 * the caller's own reactions from the separate my-reactions call the parent
 * passes down.
 *
 * Signed-out readers see the counts and no controls — offering a button that
 * bounces to a login is worse than not offering one.
 */
export function ReactionBar({
  communitySlug,
  channelSlug,
  topicParam,
  messageId,
  initial,
  mine,
  canReact,
}: {
  communitySlug: string;
  channelSlug: string;
  topicParam: string;
  messageId: string;
  initial: CommunityReactionState[];
  /** Emoji the signed-in caller has already used on this message. */
  mine: string[];
  canReact: boolean;
}) {
  const t = useTranslations("community");
  const [state, setState] = useState<CommunityReactionState[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  // Fold the caller's own reactions in once they are known. Render-time rather
  // than in an effect: this is state derived from a prop that changed, and
  // setting it from an effect would paint the wrong toggle state first.
  const [appliedMine, setAppliedMine] = useState<string>("");
  const mineKey = mine.join(",");
  if (mineKey !== appliedMine) {
    setAppliedMine(mineKey);
    setState((prev) =>
      prev.map((r) => ({ ...r, mine: mine.includes(r.emoji) })),
    );
  }

  const toggle = async (emoji: string) => {
    if (!canReact || busy) return;
    setBusy(emoji);
    try {
      const next = await communityPublicApi.toggleReaction(
        communitySlug,
        channelSlug,
        topicParam,
        messageId,
        emoji,
      );
      setState((prev) => {
        const without = prev.filter((r) => r.emoji !== emoji);
        return next.count > 0 ? [...without, next] : without;
      });
    } catch {
      // A failed reaction is not worth a toast. The count simply doesn't move.
    } finally {
      setBusy(null);
    }
  };

  const existing = new Map(state.map((r) => [r.emoji, r]));
  // Signed-out: show only what people actually used, in the allow-list's order.
  const visible = canReact
    ? CHOICES
    : CHOICES.filter((emoji) => (existing.get(emoji)?.count ?? 0) > 0);
  if (visible.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {visible.map((emoji) => {
        const chip = existing.get(emoji);
        const count = chip?.count ?? 0;
        const isMine = chip?.mine ?? false;
        const label = isMine
          ? t("reactions.remove", { emoji })
          : t("reactions.add", { emoji });

        if (!canReact) {
          return (
            <span
              key={emoji}
              className="inline-flex items-center gap-1 rounded-full border border-ledger-ink/12 bg-ledger-card px-2 py-0.5 text-xs text-ledger-ink/70"
            >
              <span aria-hidden>{emoji}</span>
              <span className="font-brand-mono text-[10px]">{count}</span>
            </span>
          );
        }

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            disabled={busy === emoji}
            aria-label={label}
            aria-pressed={isMine}
            title={label}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition disabled:opacity-50 ${
              isMine
                ? "border-ledger-ink/40 bg-ledger-ink/[0.06] text-ledger-ink"
                : "border-ledger-ink/12 bg-ledger-card text-ledger-ink/60 hover:border-ledger-ink/30 hover:text-ledger-ink"
            }`}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 && <span className="font-brand-mono text-[10px]">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Fetches the caller's own reactions for a whole thread, once, after hydration.
 *
 * One request for the thread rather than one per message, and it resolves to an
 * empty map for anonymous readers without ever calling the API.
 */
export function useMyReactions(
  communitySlug: string,
  channelSlug: string,
  topicParam: string,
  signedIn: boolean,
): Record<string, string[]> {
  const [mine, setMine] = useState<Record<string, string[]>>({});

  useEffect(() => {
    // Anonymous readers have no reactions of their own, and the initial state is
    // already empty — so there is nothing to fetch and nothing to set.
    if (!signedIn) return;
    let cancelled = false;
    communityPublicApi
      .myReactions(communitySlug, channelSlug, topicParam)
      .then((res) => {
        if (!cancelled) setMine(res.reactions || {});
      })
      .catch(() => {
        // Nothing to show is the correct fallback: the counts still render, the
        // toggles simply start unpressed.
      });
    return () => {
      cancelled = true;
    };
  }, [communitySlug, channelSlug, topicParam, signedIn]);

  return mine;
}
