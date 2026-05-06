"use client";

import { Loader2, Save, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { adminPlansApi, type PlanFeatures } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<PlanFeatures[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PlanFeatures>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { plans } = await adminPlansApi.list();
      setPlans(plans);
      if (!selectedId && plans.length) {
        setSelectedId(plans[0].id);
        setDraft(plans[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  };

  const selected = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? null,
    [plans, selectedId],
  );

  const onSelect = (plan: PlanFeatures) => {
    setSelectedId(plan.id);
    setDraft(plan);
    setSavedAt(null);
    setError(null);
  };

  const setField = <K extends keyof PlanFeatures>(
    key: K,
    value: PlanFeatures[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await adminPlansApi.update(selected.id, draft);
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <BackfillPanel />
      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Shield className="h-4 w-4" />
          Plans
        </h2>
        {loading && (
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        )}
        {plans.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            data-testid="admin-plan-row"
            data-plan-id={p.id}
            className={cn(
              "block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
              p.id === selectedId
                ? "bg-primary-500/15 text-foreground"
                : "text-muted-foreground",
            )}
          >
            <div className="font-medium text-foreground">{p.name}</div>
            <div className="text-xs text-muted-foreground">{p.tier}</div>
          </button>
        ))}
      </aside>

      <main className="rounded-lg border border-border bg-muted/30 p-5">
        {!selected ? (
          <p className="text-sm text-muted-foreground">Select a plan.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onSave();
            }}
            data-testid="admin-plan-form"
            className="space-y-5"
          >
            <h2 className="text-lg font-semibold text-foreground">
              {selected.name}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({selected.tier})
              </span>
            </h2>

            <Section title="Identity">
              <Field label="Name">
                <input
                  className={inputCls}
                  value={(draft.name as string) ?? ""}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </Field>
              <Field label="Description">
                <textarea
                  className={inputCls}
                  rows={2}
                  value={(draft.description as string) ?? ""}
                  onChange={(e) => setField("description", e.target.value)}
                />
              </Field>
            </Section>

            <Section title="Limits">
              <Numeric
                label="Max repos (-1 = unlimited)"
                value={draft.max_repos as number | undefined}
                onChange={(v) => setField("max_repos", v as PlanFeatures["max_repos"])}
              />
              <Numeric
                label="Max storage GB (-1 = unlimited)"
                testId="admin-plan-max-storage-gb"
                value={draft.max_storage_gb as number | undefined}
                onChange={(v) =>
                  setField(
                    "max_storage_gb",
                    v as PlanFeatures["max_storage_gb"],
                  )
                }
              />
              <Numeric
                label="Max commits / repo"
                value={draft.max_commits_per_repo as number | undefined}
                onChange={(v) =>
                  setField(
                    "max_commits_per_repo",
                    v as PlanFeatures["max_commits_per_repo"],
                  )
                }
              />
              <Numeric
                label="Max PRs / repo"
                value={draft.max_prs_per_repo as number | undefined}
                onChange={(v) =>
                  setField(
                    "max_prs_per_repo",
                    v as PlanFeatures["max_prs_per_repo"],
                  )
                }
              />
              <Numeric
                label="Sync history days"
                value={draft.sync_history_days as number | undefined}
                onChange={(v) =>
                  setField(
                    "sync_history_days",
                    v as PlanFeatures["sync_history_days"],
                  )
                }
              />
            </Section>

            <Section title="LLM">
              <Numeric
                label="Requests / day"
                value={draft.llm_requests_per_day as number | undefined}
                onChange={(v) =>
                  setField(
                    "llm_requests_per_day",
                    v as PlanFeatures["llm_requests_per_day"],
                  )
                }
              />
              <Numeric
                label="Free tokens / month"
                value={draft.free_llm_tokens_per_month as number | undefined}
                onChange={(v) =>
                  setField(
                    "free_llm_tokens_per_month",
                    v as PlanFeatures["free_llm_tokens_per_month"],
                  )
                }
              />
            </Section>

            <Section title="Pricing (cents)">
              <Numeric
                label="Price / month"
                value={draft.price_monthly_cents as number | undefined}
                onChange={(v) =>
                  setField(
                    "price_monthly_cents",
                    v as PlanFeatures["price_monthly_cents"],
                  )
                }
              />
              <Numeric
                label="Per-seat / month"
                value={draft.per_seat_price_monthly_cents as number | undefined}
                onChange={(v) =>
                  setField(
                    "per_seat_price_monthly_cents",
                    v as PlanFeatures["per_seat_price_monthly_cents"],
                  )
                }
              />
            </Section>

            {error && (
              <p className="text-sm text-red-400" data-testid="admin-plan-error">
                {error}
              </p>
            )}
            {savedAt && (
              <p className="text-sm text-emerald-300">Saved.</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                data-testid="admin-plan-save"
                className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </button>
            </div>
          </form>
        )}
      </main>
      </div>
    </div>
  );
}

// ─── AI Backfill panel ─────────────────────────────────────────────────────
import { useStartBackfill, useBackfillStatus } from "@/hooks/useFileMetadata";
import { Loader2 as L2, Play } from "lucide-react";

function BackfillPanel() {
  const [workspaceId, setWorkspaceId] = useState("");
  const start = useStartBackfill(workspaceId || null);
  const status = useBackfillStatus(workspaceId || null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleStart = async () => {
    setFeedback(null);
    try {
      await start.mutateAsync({});
      setFeedback("Backfill queued — see status below.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to start backfill");
    }
  };

  const s = status.data?.status ?? "not-started";
  const pillClass =
    s === "running"
      ? "bg-amber-500/15 text-amber-300"
      : s === "completed"
        ? "bg-emerald-500/15 text-emerald-300"
        : s === "failed"
          ? "bg-red-500/15 text-red-300"
          : "bg-muted/40 text-muted-foreground";

  return (
    <section
      data-testid="admin-backfill-panel"
      className="rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          AI metadata backfill
        </h2>
        <span
          data-testid="admin-backfill-status"
          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${pillClass}`}
        >
          {s}
        </span>
        <span className="text-xs text-muted-foreground">
          Scans uncovered task attachments + compliance docs and runs the AI
          pipeline at ~10 files/min/workspace.
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          data-testid="admin-backfill-workspace-id"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          placeholder="Workspace ID"
          className="w-72 rounded-md border border-border bg-background/60 px-3 py-1.5 text-sm text-foreground"
        />
        <button
          data-testid="admin-backfill-start"
          onClick={handleStart}
          disabled={!workspaceId.trim() || start.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {start.isPending ? (
            <L2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Run backfill
        </button>
        {status.data?.enqueued != null && (
          <span className="text-xs text-muted-foreground">
            Enqueued: {status.data.enqueued}
            {status.data.skipped ? ` · Skipped: ${status.data.skipped}` : ""}
          </span>
        )}
      </div>
      {feedback && (
        <p className="mt-2 text-xs text-muted-foreground">{feedback}</p>
      )}
    </section>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </legend>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Numeric({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  testId?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        data-testid={testId}
        className={inputCls}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    </Field>
  );
}
