"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, CheckCircle2, Loader2 } from "lucide-react";
import { communityPublicApi } from "@/lib/api";
import { stashPostLoginRedirect } from "@/lib/oauth";
import type { PublicMessage } from "@/lib/community-api";
import { ReactionBar, useMyReactions } from "@/components/community/ReactionBar";
import { revalidateCommunityTopic } from "@/app/community/actions";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/**
 * The interactive half of a public thread: the posts, their reactions, the
 * accepted-answer mark, and the composer.
 *
 * A client component, but still server-rendered on first load — which is what
 * lets the thread be both crawlable and interactive. The messages arrive as
 * props from the server fetch rather than being fetched here, so the HTML a
 * crawler (or a reader on a slow connection) sees is the complete conversation.
 */
export function TopicThread({
  communitySlug,
  channelSlug,
  topicParam,
  messages,
  acceptedMessageId,
  allowParticipation,
  isFirstPage,
}: {
  communitySlug: string;
  channelSlug: string;
  topicParam: string;
  messages: PublicMessage[];
  acceptedMessageId: string | null;
  allowParticipation: boolean;
  /** Only the first page hoists the accepted answer — page 3 has no question. */
  isFirstPage: boolean;
}) {
  const t = useTranslations("community");
  const [signedIn, setSignedIn] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [accepted, setAccepted] = useState<string | null>(acceptedMessageId);
  // Posts made in this session, shown immediately. The page itself is cached, so
  // without this the author is returned to a thread that doesn't contain what
  // they just wrote — which reads as a failed save.
  const [ownPosts, setOwnPosts] = useState<PublicMessage[]>([]);
  const [acceptBusy, setAcceptBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setSignedIn(!!localStorage.getItem("token"));
    }
  }, []);

  const mine = useMyReactions(communitySlug, channelSlug, topicParam, signedIn);

  // A fresh server payload (after a revalidate, or paging) supersedes anything
  // this component was holding locally.
  const [seenIds, setSeenIds] = useState("");
  const idKey = messages.map((m) => m.id).join(",");
  if (idKey !== seenIds) {
    setSeenIds(idKey);
    setAccepted(acceptedMessageId);
    if (ownPosts.length > 0) {
      const arrived = new Set(messages.map((m) => m.id));
      const stillMissing = ownPosts.filter((p) => !arrived.has(p.id));
      if (stillMissing.length !== ownPosts.length) setOwnPosts(stillMissing);
    }
  }

  const setAcceptedAnswer = async (messageId: string | null) => {
    setAcceptBusy(true);
    try {
      const res = await communityPublicApi.setAcceptedAnswer(
        communitySlug,
        channelSlug,
        topicParam,
        messageId,
      );
      setAccepted(res.accepted_message_id);
      await revalidateFromClient();
    } catch {
      // Left as it was. The control is a nicety; failing loudly here would
      // interrupt reading the thread.
    } finally {
      setAcceptBusy(false);
    }
  };

  const revalidateFromClient = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    try {
      await revalidateCommunityTopic(token, communitySlug, channelSlug, topicParam);
    } catch {
      // The optimistic copy is already on screen; the shared page will catch up
      // when its window expires.
    }
  };

  const all = [...messages, ...ownPosts];
  // The answer belongs directly under the question, not wherever it landed
  // chronologically — that is the entire point of marking one.
  const hoisted =
    isFirstPage && accepted
      ? (() => {
          const answer = all.find((m) => m.id === accepted);
          if (!answer || all.indexOf(answer) <= 0) return null;
          return answer;
        })()
      : null;
  const ordered = hoisted
    ? [all[0], hoisted, ...all.slice(1).filter((m) => m.id !== hoisted.id)]
    : all;

  return (
    <>
      <ul className="divide-y divide-ledger-ink/10 rounded-[3px] border border-ledger-ink/12 bg-ledger-card">
        {ordered.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            communitySlug={communitySlug}
            channelSlug={channelSlug}
            topicParam={topicParam}
            isAccepted={message.id === accepted}
            isHoisted={hoisted?.id === message.id}
            canReact={mounted && signedIn && allowParticipation}
            canAccept={mounted && signedIn && index > 0}
            acceptBusy={acceptBusy}
            onAccept={setAcceptedAnswer}
            mine={mine[message.id] ?? []}
          />
        ))}
      </ul>

      {allowParticipation ? (
        <Composer
          communitySlug={communitySlug}
          channelSlug={channelSlug}
          topicParam={topicParam}
          mounted={mounted}
          signedIn={signedIn}
          onPosted={(message) => {
            setOwnPosts((prev) => [...prev, message]);
            void revalidateFromClient();
          }}
        />
      ) : (
        <div className="mt-8 rounded-[3px] border border-ledger-ink/12 bg-ledger-card p-5 text-center text-sm text-ledger-ink/65">
          {t("topic.readOnly")}
        </div>
      )}
    </>
  );
}

function MessageBody({ content }: { content: string }) {
  // React escapes by default, so this only has to preserve line breaks.
  const lines = content.split("\n");
  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ledger-ink/85">
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </div>
  );
}

function MessageItem({
  message,
  communitySlug,
  channelSlug,
  topicParam,
  isAccepted,
  isHoisted,
  canReact,
  canAccept,
  acceptBusy,
  onAccept,
  mine,
}: {
  message: PublicMessage;
  communitySlug: string;
  channelSlug: string;
  topicParam: string;
  isAccepted: boolean;
  isHoisted: boolean;
  canReact: boolean;
  canAccept: boolean;
  acceptBusy: boolean;
  onAccept: (messageId: string | null) => void;
  mine: string[];
}) {
  const t = useTranslations("community");
  const when = new Date(message.created_at).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className={`p-4 ${isAccepted ? "bg-ledger-mint/[0.07]" : ""}`}>
      {isHoisted && (
        <p className="mb-2 font-brand-mono text-[10px] uppercase tracking-[0.14em] text-ledger-ink/45">
          {t("topic.acceptedAnswerLabel")}
        </p>
      )}
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {message.author_handle ? (
          <Link
            href={`/community/${communitySlug}/members/${message.author_handle}`}
            className="font-semibold underline-offset-2 transition hover:underline"
          >
            {message.author}
          </Link>
        ) : (
          <span className="font-semibold">{message.author}</span>
        )}
        <time
          dateTime={message.created_at}
          // The thread moved into a client component so it could be
          // interactive, which made this timestamp a hydration hazard: an
          // undefined locale resolves to the ICU default on the server and to
          // the reader's own preference in the browser, so the same instant
          // renders "Aug 25, 2026, 1:32 PM" on one side and "25 Aug 2026,
          // 13:32" on the other. Suppressing is the right answer rather than
          // formatting after mount — the server-rendered date is what a crawler
          // and a reader without JavaScript see, and the client's version, which
          // is actually in their locale, wins on hydration.
          suppressHydrationWarning
          className="font-brand-mono text-[10px] uppercase tracking-[0.12em] text-ledger-ink/45"
        >
          {when}
        </time>
        {message.is_edited && (
          <span className="text-xs text-ledger-ink/45">{t("topic.edited")}</span>
        )}
        {isAccepted && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-ledger-paper"
            style={{ background: "var(--community-accent, #0B6B3A)" }}
          >
            <CheckCircle2 className="h-3 w-3" />
            {t("topic.answered")}
          </span>
        )}
      </div>

      <MessageBody content={message.content} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <ReactionBar
          communitySlug={communitySlug}
          channelSlug={channelSlug}
          topicParam={topicParam}
          messageId={message.id}
          initial={message.reactions}
          mine={mine}
          canReact={canReact}
        />
        {canAccept && (
          <button
            type="button"
            onClick={() => onAccept(isAccepted ? null : message.id)}
            disabled={acceptBusy}
            className="mt-3 inline-flex items-center gap-1.5 font-brand-mono text-[10px] uppercase tracking-[0.12em] text-ledger-ink/50 transition hover:text-ledger-ink disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            {isAccepted ? t("topic.unmarkAnswer") : t("topic.markAnswer")}
          </button>
        )}
      </div>
    </li>
  );
}

function Composer({
  communitySlug,
  channelSlug,
  topicParam,
  mounted,
  signedIn,
  onPosted,
}: {
  communitySlug: string;
  channelSlug: string;
  topicParam: string;
  mounted: boolean;
  signedIn: boolean;
  onPosted: (message: PublicMessage) => void;
}) {
  const t = useTranslations("community");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Until the client has read the token, render the signed-out branch. It is the
  // safe default: a crawler and a first paint both get "sign in to join", never
  // a composer that turns out not to work.
  if (mounted && !signedIn) {
    const topicPath = `/community/${communitySlug}/${channelSlug}/${topicParam}`;
    // context=community marks a brand-new sign-in as a community-only account,
    // walled off from the internal app, and brings them back to this thread.
    const q = `context=community&community=${encodeURIComponent(communitySlug)}`;
    const onSignIn = () => stashPostLoginRedirect(topicPath);
    return (
      <div
        data-testid="community-signin-cta"
        className="mt-8 rounded-[3px] border border-ledger-ink/12 bg-ledger-card p-5 text-center"
      >
        <p className="text-sm text-ledger-ink/70">{t("reply.signInPrompt")}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`${API_BASE_URL}/auth/github/login?${q}`}
            onClick={onSignIn}
            className="inline-block rounded-[3px] bg-ledger-ink px-4 py-2 text-sm text-ledger-paper transition hover:bg-ledger-ink/85"
          >
            {t("reply.signInGithub")}
          </a>
          <a
            href={`${API_BASE_URL}/auth/google/login?${q}`}
            onClick={onSignIn}
            className="inline-block rounded-[3px] border border-ledger-ink/20 px-4 py-2 text-sm transition hover:border-ledger-ink/40"
          >
            {t("reply.signInGoogle")}
          </a>
        </div>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="mt-8 h-28 rounded-[3px] border border-ledger-ink/12 bg-ledger-card" />
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = content.trim();
    if (!body) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await communityPublicApi.postReply(
        communitySlug,
        channelSlug,
        topicParam,
        body,
      );
      setContent("");
      if (res.pending_review) {
        setNotice(t("reply.held"));
      } else {
        setNotice(t("reply.posted"));
        onPosted({
          id: res.id,
          author: t("reply.you"),
          author_handle: null,
          content: body,
          is_edited: false,
          created_at: new Date().toISOString(),
          reactions: [],
          is_accepted: false,
        });
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) setError(t("reply.tooFast"));
      else if (status === 403) setError(t("reply.closed"));
      else setError(t("reply.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      data-testid="community-reply-form"
      className="mt-8 rounded-[3px] border border-ledger-ink/12 bg-ledger-card p-5"
    >
      <label
        htmlFor="community-reply"
        className="mb-2 block font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/60"
      >
        {t("reply.label")}
      </label>
      <textarea
        id="community-reply"
        data-testid="community-reply-input"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="w-full rounded-[3px] border border-ledger-ink/15 bg-ledger-paper px-3 py-2 text-sm leading-6 focus:border-ledger-ink/35 focus:outline-none"
        placeholder={t("reply.placeholder")}
      />
      {error && <p className="mt-2 text-sm text-ledger-red">{error}</p>}
      {notice && (
        <p
          data-testid="community-reply-notice"
          className="mt-2 text-sm"
          style={{ color: "var(--community-accent, #0B6B3A)" }}
        >
          {notice}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          data-testid="community-reply-submit"
          className="inline-flex items-center gap-2 rounded-[3px] bg-ledger-ink px-4 py-2 text-sm text-ledger-paper transition hover:bg-ledger-ink/85 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? t("reply.posting") : t("reply.submit")}
        </button>
      </div>
    </form>
  );
}
