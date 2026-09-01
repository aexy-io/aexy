"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Plus, X } from "lucide-react";
import { communityPublicApi } from "@/lib/api";
import { stashPostLoginRedirect } from "@/lib/oauth";
import { revalidateCommunityTopic } from "@/app/community/actions";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/**
 * "Ask a question" on a public channel.
 *
 * Until now the only thing an outsider could do on this forum was reply to a
 * thread somebody else had started — which is not a forum, it is a comment
 * section. This is the other half.
 *
 * Renders nothing at all when the community has not opened thread creation
 * (``allow_new_topics``, off by default), because a button that always refuses
 * is worse than no button.
 */
export function NewTopicLauncher({
  communitySlug,
  channelSlug,
  allowNewTopics,
}: {
  communitySlug: string;
  channelSlug: string;
  allowNewTopics: boolean;
}) {
  const t = useTranslations("community");
  const tc = useTranslations("common");
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [held, setHeld] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setSignedIn(!!localStorage.getItem("token"));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!allowNewTopics || !mounted) return null;

  const channelPath = `/community/${communitySlug}/${channelSlug}`;

  if (!signedIn) {
    const q = `context=community&community=${encodeURIComponent(communitySlug)}`;
    return (
      <a
        href={`${API_BASE_URL}/auth/github/login?${q}`}
        onClick={() => stashPostLoginRedirect(channelPath)}
        data-testid="community-new-topic-signin"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border border-ledger-ink/20 px-3 py-1.5 font-brand-mono text-[11px] uppercase tracking-[0.12em] transition hover:border-ledger-ink/40"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("newTopic.signInToAsk")}
      </a>
    );
  }

  const canSubmit = !submitting && title.trim().length >= 3 && body.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await communityPublicApi.createTopic(
        communitySlug,
        channelSlug,
        title.trim(),
        body.trim(),
      );
      if (res.pending_review || !res.path) {
        // Held for review: there is no page to go to yet. Say so instead of
        // navigating to a 404 the author would read as "my post vanished".
        setHeld(true);
        setTitle("");
        setBody("");
        return;
      }
      const token = localStorage.getItem("token");
      if (token) {
        await revalidateCommunityTopic(
          token,
          communitySlug,
          channelSlug,
          res.path.split("/").pop() ?? "",
        );
      }
      setOpen(false);
      router.push(`/community/${communitySlug}${res.path}`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) setError(t("newTopic.tooFast"));
      else if (status === 403) setError(t("newTopic.closed"));
      else setError(t("newTopic.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setHeld(false);
          setError(null);
          setOpen(true);
        }}
        data-testid="community-new-topic"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[3px] bg-ledger-ink px-3 py-1.5 font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-paper transition hover:bg-ledger-ink/85"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("newTopic.button")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ledger-ink/45 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("newTopic.title")}
            className="w-full max-w-lg rounded-[3px] border border-ledger-ink/15 bg-ledger-card p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {t("newTopic.title")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tc("cancel")}
                className="rounded p-1 text-ledger-ink/50 transition hover:bg-ledger-ink/5 hover:text-ledger-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {held ? (
              <div data-testid="community-new-topic-held">
                <p className="text-sm leading-6 text-ledger-ink/75">
                  {t("newTopic.held")}
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-[3px] bg-ledger-ink px-4 py-2 text-sm text-ledger-paper transition hover:bg-ledger-ink/85"
                  >
                    {tc("close")}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label
                    htmlFor="new-topic-title"
                    className="mb-1.5 block font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/60"
                  >
                    {t("newTopic.titleLabel")}
                  </label>
                  <input
                    id="new-topic-title"
                    data-testid="community-new-topic-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("newTopic.titlePlaceholder")}
                    autoFocus
                    className="w-full rounded-[3px] border border-ledger-ink/15 bg-ledger-paper px-3 py-2 text-sm focus:border-ledger-ink/35 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-topic-body"
                    className="mb-1.5 block font-brand-mono text-[11px] uppercase tracking-[0.12em] text-ledger-ink/60"
                  >
                    {t("newTopic.bodyLabel")}
                  </label>
                  <textarea
                    id="new-topic-body"
                    data-testid="community-new-topic-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    placeholder={t("newTopic.bodyPlaceholder")}
                    className="w-full rounded-[3px] border border-ledger-ink/15 bg-ledger-paper px-3 py-2 text-sm leading-6 focus:border-ledger-ink/35 focus:outline-none"
                  />
                </div>

                <p className="text-xs leading-5 text-ledger-ink/55">
                  {t("newTopic.publicWarning")}
                </p>
                {error && <p className="text-sm text-ledger-red">{error}</p>}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-[3px] border border-ledger-ink/20 px-4 py-2 text-sm transition hover:border-ledger-ink/40"
                  >
                    {tc("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    data-testid="community-new-topic-submit"
                    className="inline-flex items-center gap-2 rounded-[3px] bg-ledger-ink px-4 py-2 text-sm text-ledger-paper transition hover:bg-ledger-ink/85 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? t("newTopic.posting") : t("newTopic.submit")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
