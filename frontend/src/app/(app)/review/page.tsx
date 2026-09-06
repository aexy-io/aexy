"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  FileText,
  GitCommitHorizontal,
  Inbox,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  AgentActivityRow,
  ReviewItem,
  documentApi,
  reviewApi,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/**
 * One queue for everything waiting on a person.
 *
 * Two gates feed it. The content gate holds an AI's rewrite of a page, to be
 * diffed against what is there now. The policy gate holds a tool call stopped
 * before it ran, because running it to see what it would do is what the gate
 * exists to prevent. `ProposedChange` stores both, so this is one list rather
 * than two screens somebody has to remember to check.
 *
 * Ordered oldest first: the thing that has waited longest is the most likely
 * to have been forgotten, and for a held action an agent is still blocked on
 * it.
 */
export default function ReviewPage() {
  const t = useTranslations("review");
  const { currentWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery<ReviewItem[]>({
    queryKey: ["review-items", currentWorkspaceId],
    queryFn: () => reviewApi.list(currentWorkspaceId!),
    enabled: Boolean(currentWorkspaceId),
  });

  // The other half of the story. The queue is what agents were *stopped*
  // from doing; the ledger is what they did. A page that showed only the
  // first would leave "what changed yesterday" unanswerable from here.
  const { data: activity = [] } = useQuery<AgentActivityRow[]>({
    queryKey: ["agent-activity", currentWorkspaceId],
    queryFn: () => reviewApi.activity(currentWorkspaceId!, { limit: 50 }),
    enabled: Boolean(currentWorkspaceId),
  });
  const [activityOpen, setActivityOpen] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["review-items", currentWorkspaceId] });
    queryClient.invalidateQueries({ queryKey: ["review-summary", currentWorkspaceId] });
    queryClient.invalidateQueries({ queryKey: ["agent-activity", currentWorkspaceId] });
  };

  const decide = useMutation({
    mutationFn: async ({
      item,
      approve,
    }: {
      item: ReviewItem;
      approve: boolean;
    }) => {
      if (item.kind === "agent_action") {
        return approve
          ? reviewApi.approveAction(currentWorkspaceId!, item.id)
          : reviewApi.rejectAction(currentWorkspaceId!, item.id);
      }
      return approve
        ? documentApi.approveProposedEdit(
            currentWorkspaceId!,
            item.document_id!,
            item.id
          )
        : documentApi.rejectProposedEdit(
            currentWorkspaceId!,
            item.document_id!,
            item.id
          );
    },
    onSuccess: (_data, { approve }) => {
      toast.success(approve ? t("approved") : t("rejected"));
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t("failed"))),
    onSettled: () => setBusyId(null),
  });

  /**
   * Grouped by what caused them, because that is the unit people reason
   * about: "the auth rework touched these four pages" is one decision, four
   * unrelated documents are four chores. Items nothing caused but a person
   * stand alone rather than being collected under a heading that would imply
   * a relationship they do not have.
   */
  const groups = useMemo(() => {
    const byKey = new Map<string, { label: string; items: ReviewItem[] }>();
    const ungrouped: ReviewItem[] = [];
    for (const item of items) {
      if (!item.group_key) {
        ungrouped.push(item);
        continue;
      }
      const existing = byKey.get(item.group_key);
      if (existing) existing.items.push(item);
      else
        byKey.set(item.group_key, {
          label: item.group_label ?? item.group_key,
          items: [item],
        });
    }
    // A cause with one item is not a group — a heading over a single row is
    // furniture. It joins the ungrouped list instead.
    const real: { key: string; label: string; items: ReviewItem[] }[] = [];
    for (const [key, group] of byKey) {
      if (group.items.length > 1) real.push({ key, ...group });
      else ungrouped.push(group.items[0]);
    }
    ungrouped.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { real, ungrouped };
  }, [items]);

  const approveGroup = useMutation({
    mutationFn: async (rows: ReviewItem[]) => {
      // Sequential: each approval writes a document version or replays a tool
      // call, and firing a dozen at once is a burst with no way to stop
      // partway through.
      for (const row of rows) {
        await (row.kind === "agent_action"
          ? reviewApi.approveAction(currentWorkspaceId!, row.id)
          : documentApi.approveProposedEdit(
              currentWorkspaceId!,
              row.document_id!,
              row.id
            ));
      }
    },
    onSuccess: (_data, rows) => {
      toast.success(t("approved", { count: rows.length }));
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t("failed"))),
    onSettled: () => setBusyId(null),
  });

  const needsAttention = useMemo(
    () => items.filter((item) => item.needs_attention).length,
    [items]
  );

  /** One item, whether it sits in a group or alone. */
  function ReviewRow({ item, bare }: { item: ReviewItem; bare?: boolean }) {
    const isAction = item.kind === "agent_action";
    const Icon = isAction ? Bot : FileText;
    const busy = busyId === item.id && decide.isPending;
    return (
      <div
        className={bare ? "flex items-start gap-3" : "flex items-start gap-3 py-2"}
        data-testid={`review-row-${item.id}`}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.kind === "document_proposal" && item.document_id ? (
              <Link
                href={`/docs/${item.document_id}`}
                className="truncate text-sm font-medium text-foreground hover:underline"
              >
                {item.document_icon ?? "\ud83d\udcc4"} {item.title}
              </Link>
            ) : (
              <span className="truncate font-mono text-sm text-foreground">
                {item.method} {item.title}
              </span>
            )}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {isAction ? t("kindAction") : t("kindDocument")}
            </span>
          </div>

          <p className="mt-0.5 text-sm text-muted-foreground">{item.summary}</p>

          {/* The files that caused it. Named rather than counted: "auth.py
              changed" tells a reviewer whether they are the right person to
              judge this, where "2 files changed" does not. */}
          {item.trigger_paths && item.trigger_paths.length > 0 && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {item.trigger_paths.slice(0, 3).join(", ")}
              {item.trigger_paths.length > 3
                ? ` +${item.trigger_paths.length - 3}`
                : ""}
            </p>
          )}

          {item.needs_attention && (
            <p
              data-testid={`review-attention-${item.id}`}
              className="mt-1 flex items-center gap-1 text-xs text-warning"
            >
              <AlertCircle className="h-3 w-3" />
              {isAction ? t("agentBlocked") : t("staleWarning")}
            </p>
          )}
          {item.reason && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("becauseOf", { reason: item.reason })}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid={`review-reject-${item.id}`}
            disabled={busy}
            onClick={() => {
              setBusyId(item.id);
              decide.mutate({ item, approve: false });
            }}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            {t("reject")}
          </button>
          <button
            type="button"
            data-testid={`review-approve-${item.id}`}
            disabled={busy}
            onClick={() => {
              setBusyId(item.id);
              decide.mutate({ item, approve: true });
            }}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {busy ? t("working") : t("approve")}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="md" label={t("loading")} />
      </div>
    );
  }

  /** The ledger, collapsed by default: it is context, not work. */
  const activitySection = (
    <section
      data-testid="agent-activity"
      className="mt-8 rounded-xl border border-border"
    >
      <button
        type="button"
        onClick={() => setActivityOpen((open) => !open)}
        aria-expanded={activityOpen}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 rounded-xl transition"
      >
        <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-foreground">
            {t("activityTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {activity.length
              ? t("activityCount", { count: activity.length })
              : t("activityEmpty")}
          </p>
        </div>
        {activityOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {activityOpen && activity.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border px-3 py-1">
          {activity.map((row) => (
            <li
              key={row.id}
              data-testid={`agent-activity-${row.id}`}
              className="flex items-start gap-3 py-2"
            >
              <span
                className={
                  row.is_error
                    ? "mt-0.5 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive"
                    : "mt-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                }
              >
                {row.status_code ?? "—"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-foreground">
                  {row.method} {row.action}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {row.resolved_path ?? row.path}
                </p>
              </div>
              <time
                dateTime={row.created_at}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {new Date(row.created_at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (!items.length) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div className="flex items-center justify-center px-8 py-12 text-center">
          <div className="max-w-md">
            <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h1 className="mb-2 text-lg font-semibold text-foreground">
              {t("emptyTitle")}
            </h1>
            {/* Explains the mechanism, because for most workspaces this page is
                empty until the day it suddenly is not — and arriving at an
                unexplained queue of blocked agent actions is its own kind of
                alarming. */}
            <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
          </div>
        </div>
        {activitySection}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6">
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("heading", { count: items.length })}
        </h1>
        {needsAttention > 0 && (
          <p className="mt-1 text-sm text-warning">
            {t("needsAttention", { count: needsAttention })}
          </p>
        )}
      </header>

      {groups.real.map((group) => (
        <section
          key={group.key}
          data-testid={`review-group-${group.key}`}
          className="mb-4 rounded-xl border border-border"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
            <GitCommitHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium text-foreground">
                {group.label}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("groupAffects", { count: group.items.length })}
              </p>
            </div>
            <button
              type="button"
              data-testid={`review-approve-group-${group.key}`}
              disabled={approveGroup.isPending}
              onClick={() => {
                setBusyId(group.key);
                approveGroup.mutate(group.items);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {busyId === group.key && approveGroup.isPending
                ? t("working")
                : t("approveAll", { count: group.items.length })}
            </button>
          </div>
          <ul className="divide-y divide-border/60 px-3 py-1">
            {group.items.map((item) => (
              <ReviewRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}

      <ul className="space-y-2">
        {groups.ungrouped.map((item) => (
          <li
            key={item.id}
            data-testid={`review-item-${item.id}`}
            className="rounded-xl border border-border p-3"
          >
            <ReviewRow item={item} bare />
          </li>
        ))}
      </ul>

      {activitySection}
    </div>
  );
}
