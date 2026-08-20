"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  useAiAccuracy,
  useDigestPreview,
  useVendors,
  useProducts,
  useMailboxes,
  useAccounts,
  useServiceDeskMutations,
  useServiceDeskSettings,
  useServiceDeskTaxonomy,
  useServiceDeskTemplates,
} from "@/hooks/useServiceDesk";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import {
  Account,
  AccountProductInput,
  Product,
  ServiceDeskSettingsPatch,
  ServiceDeskTemplate,
  Stakeholder,
  TestSLAOverride,
  TestStageSLA,
} from "@/lib/service-desk-api";
import { serviceDeskApi } from "@/lib/service-desk-api";
import { GoogleAccountSummary, googleIntegrationApi } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";
import { useDepartments } from "@/hooks/useOrganization";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

function TemplateEditor({
  tpl,
  saving,
  canManage,
  onSave,
}: {
  tpl: ServiceDeskTemplate;
  saving: boolean;
  canManage: boolean;
  onSave: (subject: string, body: string) => void;
}) {
  const t = useTranslations("serviceDesk");
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const dirty = subject !== tpl.subject || body !== tpl.body;
  // A backend that predates the {name, default} shape sends bare names —
  // degrade to tokens without fallbacks rather than "{{undefined}}".
  const variables = tpl.variables.map((v) =>
    typeof v === "string" ? { name: v, default: "" } : v,
  );

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{tpl.name}</span>
        {tpl.customised && <Badge variant="secondary" className="text-[10px]">{t("templates.customised")}</Badge>}
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t("templates.subject")}</label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canManage} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t("templates.body")}</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          disabled={!canManage}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">{t("templates.variables")}</p>
        <dl className="space-y-0.5">
          {variables.map((v) => (
            <div key={v.name} className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
              <dt>
                <code className="rounded bg-muted px-1 py-0.5">{`{{${v.name}}}`}</code>
              </dt>
              <dd className="min-w-0 flex-1">
                {/* Descriptions are i18n'd by variable name; an unknown future
                    variable degrades to its token and fallback, not a broken key. */}
                {t.has(`templates.varDesc.${v.name}`) && t(`templates.varDesc.${v.name}`)}
                {v.default && (
                  <span className="italic"> {t("templates.varDefault", { value: v.default })}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex justify-end">
        {canManage && (
          <Button size="sm" disabled={!dirty || saving} onClick={() => onSave(subject, body)}>
            {saving ? t("templates.saving") : t("templates.save")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  description,
  checked,
  disabled,
  onToggle,
}: {
  description: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

/**
 * Which department receives incoming tickets.
 *
 * Previously not a choice at all. The desk auto-assigned to whichever department
 * held the function key `ops_kam` — a key only workspaces set up from the
 * insurance-broking template ever had, so everybody else's mail arrived
 * unassigned. That became "the department behind the desk's first internal
 * queue", a fair guess but still a guess: a desk whose first queue is Support
 * while its intake team is Operations had no way to say so.
 *
 * The inferred department stays the default and is named in the placeholder, so
 * choosing nothing is an informed choice rather than a blank.
 */
function DeskDepartmentEditor({
  currentId,
  currentName,
  isExplicit,
  canManage,
  saving,
  onSave,
}: {
  currentId: string | null;
  currentName: string | null;
  isExplicit: boolean;
  canManage: boolean;
  saving: boolean;
  onSave: (departmentId: string) => void;
}) {
  const t = useTranslations("serviceDesk");
  const { data: departments } = useDepartments();

  return (
    <div className="space-y-2">
      <select
        value={isExplicit ? currentId ?? "" : ""}
        disabled={!canManage || saving}
        onChange={(e) => onSave(e.target.value)}
        className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
        aria-label={t("deskDepartment.title")}
      >
        <option value="">
          {/* Names the department that would be used anyway, so "automatic" is
              not a mystery. */}
          {currentName
            ? t("deskDepartment.automaticNamed", { department: currentName })
            : t("deskDepartment.automaticNone")}
        </option>
        {(departments ?? []).map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {!currentName &&
        // No department resolves at all: every ticket arrives unassigned and
        // nobody receives the digest. Worth saying, because the symptom is
        // silence — and saying WHICH fix applies: an empty dropdown means there
        // is nothing to pick, so the pointer goes to creating a department, not
        // to a function-key setting the workspace cannot have yet.
        (departments !== undefined && departments.length === 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {t("deskDepartment.noneExist")}
          </p>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {t("deskDepartment.nobody")}
          </p>
        ))}
    </div>
  );
}

/**
 * `title` is optional: on a page holding a single section the Settings header
 * already names it, and rendering the heading again showed the same words
 * twice in a row.
 */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      {title && <h2 className="text-sm font-semibold">{title}</h2>}
      {children}
    </Card>
  );
}

function Row({
  children,
  canManage,
  onDelete,
}: {
  children: React.ReactNode;
  canManage: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
      <div className="min-w-0">{children}</div>
      {canManage && (
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive" aria-label="delete">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * The shift the breach clock runs on. Editing it re-scores every open ticket's
 * stage age, so it saves explicitly rather than on each keystroke.
 */
function WorkingHoursEditor({
  start,
  end,
  canManage,
  saving,
  onSave,
}: {
  start: string;
  end: string;
  canManage: boolean;
  saving: boolean;
  onSave: (start: string, end: string) => void;
}) {
  const t = useTranslations("serviceDesk");
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);

  // Re-sync when the fetched values arrive or change under us.
  useEffect(() => {
    setFrom(start);
    setTo(end);
  }, [start, end]);

  const dirty = from !== start || to !== end;
  // The API rejects an inverted window; say so before the round trip.
  const invalid = to <= from;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t("workingHours.from")}</label>
        <Input
          type="time"
          value={from}
          disabled={!canManage}
          onChange={(e) => setFrom(e.target.value)}
          className="w-32"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t("workingHours.to")}</label>
        <Input
          type="time"
          value={to}
          disabled={!canManage}
          onChange={(e) => setTo(e.target.value)}
          className="w-32"
        />
      </div>
      <span className="pb-2 text-xs text-muted-foreground">
        {invalid ? t("workingHours.invalid") : t("workingHours.summary", { hours: hoursBetween(from, to) })}
      </span>
      {canManage && (
        <Button
          size="sm"
          className="mb-0.5"
          disabled={!dirty || invalid || saving}
          onClick={() => onSave(from, to)}
        >
          {saving ? t("workingHours.saving") : t("workingHours.save")}
        </Button>
      )}
    </div>
  );
}

/** Ticket prefix, timezone and breach thresholds.
 *
 *  All four were module constants baked to one customer's operation — "BSD"
 *  ticket ids, Asia/Kolkata day boundaries, a 2-business-day target — so any
 *  other desk inherited them with no way to change them. The defaults shown
 *  here still reproduce exactly that behaviour.
 */
function DeskIdentityEditor({
  prefix,
  timezone,
  red,
  amber,
  canManage,
  saving,
  onSave,
}: {
  prefix: string;
  timezone: string;
  red: number;
  amber: number;
  canManage: boolean;
  saving: boolean;
  onSave: (patch: ServiceDeskSettingsPatch) => void;
}) {
  const t = useTranslations("serviceDesk");
  const [p, setP] = useState(prefix);
  const [tz, setTz] = useState(timezone);
  const [r, setR] = useState(String(red));
  const [a, setA] = useState(String(amber));

  useEffect(() => {
    setP(prefix);
    setTz(timezone);
    setR(String(red));
    setA(String(amber));
  }, [prefix, timezone, red, amber]);

  const redNum = Number(r);
  const amberNum = Number(a);
  // Mirror the server's rules so the reason is visible before the round trip.
  const prefixValid = /^[A-Za-z][A-Za-z0-9]{0,9}$/.test(p);
  const thresholdsValid =
    Number.isFinite(redNum) && Number.isFinite(amberNum) && redNum > 0 && amberNum > 0 && amberNum < redNum;
  const dirty = p !== prefix || tz !== timezone || redNum !== red || amberNum !== amber;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("deskIdentity.prefix")}</label>
          <Input
            value={p}
            disabled={!canManage}
            onChange={(e) => setP(e.target.value.toUpperCase())}
            className="w-28 font-mono"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("deskIdentity.timezone")}</label>
          <Input
            value={tz}
            disabled={!canManage}
            onChange={(e) => setTz(e.target.value)}
            placeholder="Asia/Kolkata"
            className="w-48 font-mono"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("deskIdentity.amber")}</label>
          <Input
            type="number"
            step="0.5"
            min="0.5"
            value={a}
            disabled={!canManage}
            onChange={(e) => setA(e.target.value)}
            className="w-24"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("deskIdentity.red")}</label>
          <Input
            type="number"
            step="0.5"
            min="0.5"
            value={r}
            disabled={!canManage}
            onChange={(e) => setR(e.target.value)}
            className="w-24"
          />
        </div>
        {canManage && (
          <Button
            size="sm"
            className="mb-0.5"
            disabled={!dirty || !prefixValid || !thresholdsValid || saving}
            onClick={() =>
              onSave({
                ticket_prefix: p,
                timezone: tz,
                breach_red_days: redNum,
                breach_amber_days: amberNum,
              })
            }
          >
            {saving ? t("workingHours.saving") : t("workingHours.save")}
          </Button>
        )}
      </div>
      {!prefixValid && <p className="text-xs text-amber-500">{t("deskIdentity.prefixInvalid")}</p>}
      {!thresholdsValid && <p className="text-xs text-amber-500">{t("deskIdentity.thresholdsInvalid")}</p>}
      {/* Display ids are rendered from the ticket number, not stored, so this
          relabels tickets that already exist. Replies quoting the old prefix
          still thread correctly — the server keeps accepting it. */}
      {prefixValid && p !== prefix && (
        <p className="text-xs text-muted-foreground">{t("deskIdentity.prefixWarning", { prefix: p })}</p>
      )}
    </div>
  );
}

/** Shift length in hours, to one decimal — what one "day" of the target means. */
function hoursBetween(from: string, to: string): string {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const mins = th * 60 + tm - (fh * 60 + fm);
  return (Math.max(mins, 0) / 60).toFixed(1);
}

function localDateTime(value?: string): string {
  const date = value ? new Date(value) : new Date(Date.now() + 4 * 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function TestSLAEditor({
  value,
  stakeholders,
  canManage,
  saving,
  onSave,
  onClear,
}: {
  value: TestSLAOverride | null | undefined;
  stakeholders: Stakeholder[];
  canManage: boolean;
  saving: boolean;
  onSave: (value: TestSLAOverride) => void;
  onClear: () => void;
}) {
  const t = useTranslations("serviceDesk");
  const [expiresAt, setExpiresAt] = useState(() => localDateTime(value?.expires_at));
  // One row per bucket the workspace actually has, rather than three fields named
  // after insurance ones. A stage the test does not name keeps the normal target.
  const [rules, setRules] = useState<Record<string, TestStageSLA>>(() => value?.stages ?? {});

  useEffect(() => {
    if (!value) return;
    setExpiresAt(localDateTime(value.expires_at));
    setRules(value.stages ?? {});
  }, [value]);

  // Terminal buckets are excluded: the clock has already stopped there, so a
  // minute rule against one could never fire.
  const rows = stakeholders.filter((s) => s.semantics !== "closed");
  const setRule = (slug: string, patch: Partial<TestStageSLA>) =>
    setRules((prev) => {
      const current = prev[slug] ?? { amber_minutes: 8, red_minutes: 15 };
      return { ...prev, [slug]: { ...current, ...patch } };
    });
  const clearRule = (slug: string) =>
    setRules((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });

  const named = Object.entries(rules);
  const validRule = (rule: TestStageSLA) =>
    rule.amber_minutes >= 1 && rule.red_minutes > rule.amber_minutes && rule.red_minutes <= 240;
  const valid =
    Number.isFinite(Date.parse(expiresAt)) &&
    new Date(expiresAt).getTime() > Date.now() &&
    named.length > 0 &&
    named.every(([, rule]) => validRule(rule));

  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-sm text-muted-foreground">{t("testSla.description")}</p>
      <p className="max-w-2xl text-xs text-muted-foreground">{t("testSla.example")}</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
        <span className="text-xs text-muted-foreground">{t("testSla.stage")}</span>
        <span className="text-xs text-muted-foreground">{t("testSla.amber")}</span>
        <span className="text-xs text-muted-foreground">{t("testSla.red")}</span>
        {rows.map((stakeholder) => {
          const rule = rules[stakeholder.slug];
          return (
            <div className="contents" key={stakeholder.slug}>
              <label className="flex items-center gap-2 self-center text-sm font-medium">
                <input
                  type="checkbox"
                  checked={rule !== undefined}
                  disabled={!canManage}
                  onChange={(event) =>
                    event.target.checked
                      ? setRule(stakeholder.slug, {})
                      : clearRule(stakeholder.slug)
                  }
                />
                {stakeholder.label}
              </label>
              <Input
                type="number"
                min={1}
                max={240}
                value={rule?.amber_minutes ?? ""}
                disabled={!canManage || rule === undefined}
                onChange={(event) =>
                  setRule(stakeholder.slug, { amber_minutes: Number(event.target.value) })
                }
              />
              <Input
                type="number"
                min={2}
                max={240}
                value={rule?.red_minutes ?? ""}
                disabled={!canManage || rule === undefined}
                onChange={(event) =>
                  setRule(stakeholder.slug, { red_minutes: Number(event.target.value) })
                }
              />
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("testSla.expires")}</label>
          <Input
            type="datetime-local"
            value={expiresAt}
            disabled={!canManage}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="w-60"
          />
        </div>
        {canManage && (
          <Button
            size="sm"
            disabled={!valid || saving}
            onClick={() =>
              onSave({ expires_at: new Date(expiresAt).toISOString(), stages: rules })
            }
          >
            {saving ? t("testSla.saving") : t("testSla.save")}
          </Button>
        )}
        {canManage && value && (
          <Button size="sm" variant="outline" disabled={saving} onClick={onClear}>
            {t("testSla.clear")}
          </Button>
        )}
      </div>
      {!valid && <p className="text-xs text-destructive">{t("testSla.invalid")}</p>}
      {value && <p className="text-xs text-amber-700 dark:text-amber-400">{t("testSla.active")}</p>}
    </div>
  );
}

/**
 * The Service Desk settings, one exported section group per Settings page.
 *
 * These used to be eleven `<Section>` blocks in a single 849-line route at
 * `/service-desk/settings` — which made the desk's configuration the one
 * settings surface you could not reach from Settings. Escalation Matrix and
 * Ticket Forms were already there, so the desk's own master data living
 * elsewhere was an inconsistency people had to learn rather than infer.
 *
 * Each group owns the hooks it needs instead of taking them as props. The
 * queries are React Query and share a cache, so a page mounting two groups
 * still fetches each thing once.
 */

/** Read-only notice. On every page, so the state is never a surprise. */
export function ReadOnlyNotice() {
  const t = useTranslations("serviceDesk");
  const settings = useServiceDeskSettings();
  if (settings.isLoading || settings.data?.can_manage === true) return null;
  return (
    <Card className="border-amber-500/40 bg-amber-500/5 p-3">
      <p className="text-sm text-muted-foreground">{t("settings.readOnly")}</p>
    </Card>
  );
}

/** AI categorisation, and the auto-split that depends on it. */
export function AiSections() {
  const t = useTranslations("serviceDesk");
  const settings = useServiceDeskSettings();
  const m = useServiceDeskMutations();
  const canManage = settings.data?.can_manage === true;

  const workspaceAiEnabled = settings.data?.workspace_ai_enabled !== false;
  const aiOn = !!settings.data?.ai_classification_enabled;

  return (
    <>
      <Section>
        <ToggleRow
          description={t("ai.toggle")}
          checked={aiOn}
          // Off at the workspace means there is nothing to decide here: the LLM
          // gateway refuses the call whatever this says, and a toggle that
          // silently does nothing is worse than one that cannot be moved.
          disabled={
            !canManage ||
            !workspaceAiEnabled ||
            m.updateSettings.isPending ||
            settings.isLoading
          }
          onToggle={() => m.updateSettings.mutate({ ai_classification_enabled: !aiOn })}
        />
        {/* Where the current state came from. The desk no longer keeps its own
            opt-in, so an "on" nobody set on this page needs to say why. */}
        {!settings.isLoading &&
          (workspaceAiEnabled ? (
            <p className="text-xs text-muted-foreground">
              {aiOn ? t("ai.inheritedOn") : t("ai.vetoed")}{" "}
              <Link href="/settings/ai" className="underline underline-offset-2">
                {t("ai.workspaceSettingsLink")}
              </Link>
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("ai.workspaceOff")}{" "}
              <Link href="/settings/ai" className="underline underline-offset-2">
                {t("ai.workspaceSettingsLink")}
              </Link>
            </p>
          ))}
      </Section>

      {/* Attachment previews — reading the customer's files, not just their
          words. Deliberately not inherited from the workspace switch. */}
      <Section title={t("ai.attachments.title")}>
        <ToggleRow
          description={t("ai.attachments.description")}
          checked={!!settings.data?.ai_attachment_previews_enabled}
          disabled={
            !canManage ||
            !aiOn ||
            m.updateSettings.isPending ||
            settings.isLoading
          }
          onToggle={() =>
            m.updateSettings.mutate({
              ai_attachment_previews_enabled: !settings.data?.ai_attachment_previews_enabled,
            })
          }
        />
        {!settings.isLoading && !aiOn && (
          <p className="text-xs text-muted-foreground">{t("ai.attachments.requiresAi")}</p>
        )}
      </Section>

      <AiAccuracyPanel />

      {/* Auto-split — only ever acts on AI-read email */}
      <Section title={t("autoSplit.title")}>
        <ToggleRow
          description={t("autoSplit.description")}
          checked={!!settings.data?.auto_split_enabled}
          disabled={
            !canManage ||
            !settings.data?.ai_classification_enabled ||
            m.updateSettings.isPending ||
            settings.isLoading
          }
          onToggle={() =>
            m.updateSettings.mutate({ auto_split_enabled: !settings.data?.auto_split_enabled })
          }
        />
        {!settings.isLoading && !settings.data?.ai_classification_enabled && (
          <p className="text-xs text-muted-foreground">{t("autoSplit.requiresAi")}</p>
        )}
      </Section>
    </>
  );
}

/**
 * How often this desk's people agreed with the classifier.
 *
 * The number a desk needs to decide whether to keep AI on, and one it cannot
 * arrive at by feel — a correction overwrites the request type, so being right
 * and being quietly fixed look identical from the ticket list.
 *
 * Read as a floor rather than a measurement: a ticket nobody looked at counts as
 * agreement, so the true figure is no better than this one. The per-type
 * breakdown is where the action is — one bad request type inside a good overall
 * number is a labelling problem, not a reason to switch AI off.
 */
function AiAccuracyPanel() {
  const t = useTranslations("serviceDesk");
  const accuracy = useAiAccuracy();
  const data = accuracy.data;

  if (accuracy.isLoading) return null;
  // Nothing measured yet. Saying so is useful; rendering 0% or 100% is not.
  if (!data || data.classified === 0) {
    return (
      <Section title={t("ai.accuracy.title")}>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("ai.accuracy.nothingYet")}
        </p>
      </Section>
    );
  }

  const percent = (rate: number) => `${Math.round(rate * 100)}%`;

  return (
    <Section title={t("ai.accuracy.title")}>
      <p className="max-w-2xl text-sm text-muted-foreground">
        {t("ai.accuracy.summary", {
          rate: percent(data.agreement_rate ?? 0),
          agreed: data.agreed,
          classified: data.classified,
          days: data.days,
        })}
      </p>
      <p className="max-w-2xl text-xs text-muted-foreground">{t("ai.accuracy.caveat")}</p>
      <div className="space-y-1">
        {(data.by_request_type ?? []).map((row) => (
          <div key={row.request_type} className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate">{row.label}</span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  row.agreement_rate >= 0.8
                    ? "h-full bg-emerald-500"
                    : row.agreement_rate >= 0.5
                      ? "h-full bg-amber-500"
                      : "h-full bg-destructive"
                }
                style={{ width: `${Math.round(row.agreement_rate * 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {t("ai.accuracy.row", {
                rate: percent(row.agreement_rate),
                classified: row.classified,
              })}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * The open-ticket digest: whether it goes out, when, and to whom.
 *
 * All of this existed in the API and none of it on any screen — `digest_hours`
 * was reachable only by a raw PATCH, and nothing turned the digest off at all.
 * A desk on the default schedule receives three emails a day and its only
 * recourse was a mail filter.
 *
 * The preview is here rather than in a separate place because every question
 * somebody has when they open this — who gets it, when, what does it say —
 * otherwise takes until 5pm to answer.
 */
export function DigestSections() {
  const t = useTranslations("serviceDesk");
  const settings = useServiceDeskSettings();
  const preview = useDigestPreview();
  const m = useServiceDeskMutations();
  const { currentWorkspace } = useWorkspace();
  const { members } = useWorkspaceMembers(currentWorkspace?.id ?? null);
  const canManage = settings.data?.can_manage === true;
  const enabled = settings.data?.digest_enabled !== false;
  const hours = settings.data?.digest_hours ?? [9, 13, 17];
  const excluded = settings.data?.digest_excluded_recipients ?? [];
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const toggleHour = (hour: number) => {
    const next = hours.includes(hour)
      ? hours.filter((h) => h !== hour)
      : [...hours, hour].sort((a, b) => a - b);
    // The server refuses an empty list — the off switch is the toggle above,
    // not an empty schedule, so that "off" is one obvious thing rather than two.
    if (next.length === 0) return;
    m.updateSettings.mutate({ digest_hours: next });
  };

  const sendNow = async () => {
    if (!currentWorkspace?.id) return;
    setSending(true);
    try {
      const result = await serviceDeskApi.sendDigestNow(currentWorkspace.id);
      setSentCount(result.sent);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Section>
        <ToggleRow
          description={t("digest.toggle")}
          checked={enabled}
          disabled={!canManage || m.updateSettings.isPending || settings.isLoading}
          onToggle={() => m.updateSettings.mutate({ digest_enabled: !enabled })}
        />
      </Section>

      <Section title={t("digest.times")}>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("digest.timesHint", { timezone: preview.data?.timezone ?? settings.data?.timezone ?? "" })}
        </p>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 24 }, (_, hour) => (
            <button
              key={hour}
              type="button"
              disabled={!canManage || !enabled || m.updateSettings.isPending}
              onClick={() => toggleHour(hour)}
              className={`h-8 w-11 rounded-md border text-xs transition-colors disabled:opacity-40 ${
                hours.includes(hour)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-accent"
              }`}
            >
              {String(hour).padStart(2, "0")}:00
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("digest.recipients")}>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("digest.recipientsHint")}</p>
        {members
          .filter((member) => member.status === "active")
          .map((member) => {
            const off = excluded.includes(member.developer_id);
            // Only people the desk would actually mail are worth listing, but
            // membership is resolved server-side, so this shows the workspace
            // and marks the ones currently receiving it.
            const receiving = (preview.data?.recipients ?? []).includes(
              (member.developer_email ?? "").toLowerCase(),
            );
            if (!receiving && !off) return null;
            return (
              <label key={member.developer_id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!off}
                  disabled={!canManage || m.updateSettings.isPending}
                  onChange={(e) =>
                    m.updateSettings.mutate({
                      digest_excluded_recipients: e.target.checked
                        ? excluded.filter((id) => id !== member.developer_id)
                        : [...excluded, member.developer_id],
                    })
                  }
                />
                {member.developer_name || member.developer_email}
              </label>
            );
          })}
        <ExtraRecipientsEditor
          current={settings.data?.digest_extra_recipients ?? []}
          canManage={canManage}
          saving={m.updateSettings.isPending}
          onSave={(list) => m.updateSettings.mutate({ digest_extra_recipients: list })}
        />
      </Section>

      <Section title={t("digest.preview")}>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={sendNow} disabled={!canManage || sending || !enabled}>
            {sending ? <Spinner size="sm" className="mr-1" /> : null}
            {t("digest.sendNow")}
          </Button>
          {sentCount !== null && (
            <span className="text-xs text-muted-foreground">
              {t("digest.sentCount", { count: sentCount })}
            </span>
          )}
        </div>
        {preview.isLoading ? (
          <Spinner size="sm" />
        ) : preview.data?.body ? (
          <>
            <p className="text-xs font-medium">{preview.data.subject}</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs">
              {preview.data.body}
            </pre>
          </>
        ) : (
          // The caller is not on the list. Saying so beats an empty box that
          // reads as a broken preview.
          <p className="text-sm text-muted-foreground">{t("digest.notARecipient")}</p>
        )}
      </Section>
    </>
  );
}

/** Addresses outside the desk department that also receive the digest. */
function ExtraRecipientsEditor({
  current,
  canManage,
  saving,
  onSave,
}: {
  current: string[];
  canManage: boolean;
  saving: boolean;
  onSave: (list: string[]) => void;
}) {
  const t = useTranslations("serviceDesk");
  const [draft, setDraft] = useState("");
  const entry = draft.trim().toLowerCase();
  const invalid = entry.length > 0 && !entry.includes("@");

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-sm font-medium">{t("digest.extra")}</p>
      {/* Said plainly: these people see every open ticket, not a subset. */}
      <p className="max-w-2xl text-xs text-muted-foreground">{t("digest.extraHint")}</p>
      <div className="flex flex-wrap gap-1">
        {current.map((address) => (
          <span
            key={address}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
          >
            {address}
            {canManage && (
              <button
                onClick={() => onSave(current.filter((a) => a !== address))}
                aria-label={t("digest.removeRecipient", { address })}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {canManage && (
        <div className="flex items-end gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("digest.extraPlaceholder")}
            className="max-w-[280px]"
          />
          <Button
            disabled={!entry || invalid || saving || current.includes(entry)}
            onClick={() => {
              onSave([...current, entry]);
              setDraft("");
            }}
          >
            {t("settings.add")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The shift the breach clock runs on, plus the temporary minute-SLA override. */
export function WorkingHoursSections() {
  const t = useTranslations("serviceDesk");
  const settings = useServiceDeskSettings();
  const m = useServiceDeskMutations();
  const { stakeholders } = useServiceDeskTaxonomy();
  const canManage = settings.data?.can_manage === true;

  return (
    <>
      {/* Untitled: the page header names it. The test-SLA section below keeps
          its heading, because it is a second, distinct thing on the page. */}
      <Section>
        <WorkingHoursEditor
          start={settings.data?.working_hours_start ?? "09:30"}
          end={settings.data?.working_hours_end ?? "18:30"}
          canManage={canManage}
          saving={m.updateSettings.isPending}
          onSave={(start, end) =>
            m.updateSettings.mutate({ working_hours_start: start, working_hours_end: end })
          }
        />
      </Section>

      {/* An additional section, not a replacement: the test SLA is a temporary
          manual-testing override that sits alongside the real targets. */}
      <Section title={t("testSla.title")}>
        <TestSLAEditor
          value={settings.data?.test_sla}
          stakeholders={stakeholders}
          canManage={canManage}
          saving={m.updateSettings.isPending}
          onSave={(test_sla) => m.updateSettings.mutate({ test_sla })}
          onClear={() => m.updateSettings.mutate({ clear_test_sla: true })}
        />
      </Section>
    </>
  );
}

/** Which department the desk hands work to. */
export function IntakeSection() {
  const t = useTranslations("serviceDesk");
  const settings = useServiceDeskSettings();
  const m = useServiceDeskMutations();
  const canManage = settings.data?.can_manage === true;

  return (
    // Title and description live in the page header — see MailboxesSection.
    <>
    <Section>
      <DeskDepartmentEditor
        currentId={settings.data?.desk_department_id ?? null}
        currentName={settings.data?.desk_department_name ?? null}
        isExplicit={settings.data?.desk_department_is_explicit ?? false}
        canManage={canManage}
        saving={m.updateSettings.isPending}
        onSave={(departmentId) => m.updateSettings.mutate({ desk_department_id: departmentId })}
      />
    </Section>
    <Section title={t("ignoredSenders.title")}>
      {/* Its own card: the description below runs long, and inside the
          department card it read as if it explained the department picker
          rather than the list it actually belongs to. */}
      <IgnoredSendersEditor
        current={settings.data?.ignored_senders ?? []}
        canManage={canManage}
        saving={m.updateSettings.isPending}
        onSave={(senders) => m.updateSettings.mutate({ ignored_senders: senders })}
      />
    </Section>
    </>
  );
}

/**
 * Senders whose mail must not become tickets.
 *
 * A list somebody writes, never one intake infers: the shape that looks most
 * like noise — a `no-reply@` address — is also how a counterparty sends the
 * notices a desk exists to act on. So a provider's security alerts keep opening
 * tickets until somebody names the sender here.
 *
 * How far Master Data overrides an entry depends on how it was written. A bare
 * domain loses to a registered account or vendor, so a domain ignored in passing
 * cannot silence a counterparty somebody deliberately added. A whole address
 * wins outright — otherwise a partner's daily automailer, sitting on a domain
 * mapped to that partner, could not be excluded by any setting at all.
 */
function IgnoredSendersEditor({
  current,
  canManage,
  saving,
  onSave,
}: {
  current: string[];
  canManage: boolean;
  saving: boolean;
  onSave: (senders: string[]) => void;
}) {
  const t = useTranslations("serviceDesk");
  const [draft, setDraft] = useState("");
  const entry = draft.trim().toLowerCase().replace(/^@/, "");
  const invalid = entry.length > 0 && (entry.includes(" ") || !entry.includes("."));
  const duplicate = entry.length > 0 && current.includes(entry);

  const add = () => {
    if (!entry || invalid || duplicate) return;
    onSave([...current, entry]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t("ignoredSenders.description")}</p>
      <div className="flex flex-wrap gap-1.5">
        {current.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("ignoredSenders.empty")}</span>
        ) : (
          current.map((sender) => (
            <span
              key={sender}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
            >
              {sender}
              {canManage && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onSave(current.filter((value) => value !== sender))}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-60"
                  aria-label={t("ignoredSenders.remove", { sender })}
                >
                  &times;
                </button>
              )}
            </span>
          ))
        )}
      </div>
      {canManage && (
        <div className="flex flex-wrap items-start gap-2">
          <div>
            <Input
              value={draft}
              placeholder={t("ignoredSenders.placeholder")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              className="w-72"
              aria-label={t("ignoredSenders.title")}
            />
            {invalid && (
              <p className="mt-1 text-xs text-destructive">{t("ignoredSenders.invalid")}</p>
            )}
            {duplicate && (
              <p className="mt-1 text-xs text-muted-foreground">{t("ignoredSenders.duplicate")}</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!entry || invalid || duplicate || saving}
            onClick={add}
          >
            {t("ignoredSenders.add")}
          </Button>
        </div>
      )}
    </div>
  );
}


/** Ticket prefix, timezone, breach thresholds, and the customer-facing copy. */
export function IdentitySections() {
  const t = useTranslations("serviceDesk");
  const settings = useServiceDeskSettings();
  const templates = useServiceDeskTemplates();
  const m = useServiceDeskMutations();
  const canManage = settings.data?.can_manage === true;

  return (
    <>
      <Section>
        <DeskIdentityEditor
          prefix={settings.data?.ticket_prefix ?? "BSD"}
          timezone={settings.data?.timezone ?? "Asia/Kolkata"}
          red={settings.data?.breach_red_days ?? 2}
          amber={settings.data?.breach_amber_days ?? 1}
          canManage={canManage}
          saving={m.updateSettings.isPending}
          onSave={(patch) => m.updateSettings.mutate(patch)}
        />
      </Section>

      {/* Placed immediately above the templates it changes, because the effect
          of turning it on is visible in the copy right below: {{ticket_url}}
          starts resolving. Off by default — this is publishing, not a
          convenience setting. */}
      <Section title={t("publicLinks.title")}>
        <ToggleRow
          description={t("publicLinks.description")}
          checked={!!settings.data?.public_ticket_links_enabled}
          disabled={!canManage || m.updateSettings.isPending || settings.isLoading}
          onToggle={() =>
            m.updateSettings.mutate({
              public_ticket_links_enabled: !settings.data?.public_ticket_links_enabled,
            })
          }
        />
        {/* Says what "off" does and does not do. It cannot unsend a URL already
            emailed, and it leaves links an operator shared by hand alone. */}
        <p className="text-xs text-muted-foreground">{t("publicLinks.scopeNote")}</p>
      </Section>

      <Section title={t("templates.title")}>
        <p className="text-sm text-muted-foreground">{t("templates.description")}</p>
        {templates.isLoading ? (
          <Spinner size="sm" />
        ) : (
          (templates.data ?? []).map((tpl) => (
            <TemplateEditor
              key={tpl.key}
              tpl={tpl}
              saving={m.updateTemplate.isPending}
              canManage={canManage}
              onSave={(subject, body) => m.updateTemplate.mutate({ key: tpl.key, subject, body })}
            />
          ))
        )}
      </Section>
    </>
  );
}

/**
 * One account row: name, domains, and — the point of the change — **who owns
 * it**.
 *
 * The list used to render the name and domains only. An account mapped to a KAM
 * and an account mapped to nobody were the same row, so "assignment is not
 * following our master data" could not be checked from the page that holds the
 * master data; and with no edit control, correcting a mapping meant deleting the
 * account and retyping its domains.
 *
 * An unowned account is called out rather than left blank, because the
 * consequence is invisible from here: intake falls back to an arbitrary member
 * of the desk department, and the ticket looks deliberately assigned.
 */
/** The shape `useWorkspaceMembers` hands back, named so two components can share it. */
type WorkspaceMemberOption = {
  developer_id: string;
  developer_name?: string | null;
  developer_email?: string | null;
  status: string;
};

function AccountRow({
  account,
  canManage,
  members,
  products,
  saving,
  onSaveOwner,
  onSaveProducts,
  onDelete,
}: {
  account: Account;
  canManage: boolean;
  members: WorkspaceMemberOption[];
  products: Product[];
  saving: boolean;
  onSaveOwner: (ownerId: string | null) => void;
  onSaveProducts: (products: AccountProductInput[]) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("serviceDesk");
  const ownerLabel =
    account.assigned_owner_name || account.assigned_owner_email || null;

  return (
    <Row canManage={canManage} onDelete={onDelete}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{account.name}</span>
        {account.domains.map((d) => (
          <Badge key={d} variant="secondary" className="text-[10px]">
            {d}
          </Badge>
        ))}
        {/* Subdomains are matched automatically, so `mail.partner.com` needs no
            row of its own. Said here because the list is where somebody would
            otherwise add one. */}
        {canManage ? (
          <select
            value={account.assigned_owner_id ?? ""}
            disabled={saving}
            aria-label={t("settings.assignedOwnerFor", { name: account.name })}
            onChange={(e) => onSaveOwner(e.target.value || null)}
            className={`h-8 max-w-[220px] rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-50 ${
              account.assigned_owner_id
                ? "border-input"
                : "border-amber-500/60 text-amber-700 dark:text-amber-400"
            }`}
          >
            <option value="">{t("settings.noAssignedOwner")}</option>
            {members
              .filter((member) => member.status === "active")
              .map((member) => (
                <option key={member.developer_id} value={member.developer_id}>
                  {member.developer_name || member.developer_email || member.developer_id}
                </option>
              ))}
          </select>
        ) : ownerLabel ? (
          <span className="text-xs text-muted-foreground">{ownerLabel}</span>
        ) : (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {t("settings.noAssignedOwner")}
          </span>
        )}
      </div>
      {!account.assigned_owner_id && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          {t("settings.unownedAccountWarning")}
        </p>
      )}
      <AccountProducts
        account={account}
        products={products}
        members={members}
        canManage={canManage}
        saving={saving}
        onSave={onSaveProducts}
      />
    </Row>
  );
}

/**
 * Which products an account is served for, and who owns each of them.
 *
 * An account carries one owner, which says a partner is one person's to look
 * after. Desks split them — the same partner's motor work belongs to one owner
 * and its health work to another — and the only way to express that used to be
 * two accounts sharing a domain, which the sender matcher then resolved
 * arbitrarily.
 *
 * Collapsed to a summary line until somebody opens it: most desks never split
 * anybody, and a table of checkboxes on every row would bury the domains and
 * the owner, which are what this list is read for.
 */
function AccountProducts({
  account,
  products,
  members,
  canManage,
  saving,
  onSave,
}: {
  account: Account;
  products: Product[];
  members: WorkspaceMemberOption[];
  canManage: boolean;
  saving: boolean;
  onSave: (products: AccountProductInput[]) => void;
}) {
  const t = useTranslations("serviceDesk");
  const [open, setOpen] = useState(false);
  const linked = new Map(account.products.map((p) => [p.product_id, p]));

  const toggle = (productId: string, on: boolean) => {
    const next = on
      ? [...account.products, { product_id: productId, assigned_owner_id: null }]
      : account.products.filter((p) => p.product_id !== productId);
    onSave(next.map((p) => ({ product_id: p.product_id, assigned_owner_id: p.assigned_owner_id })));
  };

  const setOwner = (productId: string, ownerId: string | null) => {
    onSave(
      account.products.map((p) => ({
        product_id: p.product_id,
        assigned_owner_id: p.product_id === productId ? ownerId : p.assigned_owner_id,
      })),
    );
  };

  if (products.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-muted-foreground underline underline-offset-2"
      >
        {account.products.length === 0
          ? t("accountProducts.none")
          : t("accountProducts.summary", {
              names: account.products.map((p) => p.product_name).join(", "),
            })}
      </button>
      {open && (
        <div className="mt-2 space-y-1 rounded-md border border-border p-2">
          <p className="text-xs text-muted-foreground">{t("accountProducts.hint")}</p>
          {products.map((product) => {
            const link = linked.get(product.id);
            return (
              <div key={product.id} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!link}
                    disabled={!canManage || saving}
                    onChange={(e) => toggle(product.id, e.target.checked)}
                  />
                  {product.name}
                </label>
                {/* The owner dropdown only exists for a product this account is
                    actually served for — offering it otherwise would ask who
                    owns work the partner does not send. */}
                {link && (
                  <select
                    value={link.assigned_owner_id ?? ""}
                    disabled={!canManage || saving}
                    aria-label={t("accountProducts.ownerFor", {
                      product: product.name,
                      name: account.name,
                    })}
                    onChange={(e) => setOwner(product.id, e.target.value || null)}
                    className="h-7 max-w-[200px] rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">{t("accountProducts.sameAsAccount")}</option>
                    {members
                      .filter((member) => member.status === "active")
                      .map((member) => (
                        <option key={member.developer_id} value={member.developer_id}>
                          {member.developer_name || member.developer_email || member.developer_id}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/**
 * Accounts, vendors and products — the three tables the desk classifies
 * against. Titled from the workspace's own terminology: an insurance desk
 * reads "Partners"/"Insurers"/"Lines of Business", a software desk reads
 * "Customers"/"Vendors"/"Products".
 */
export function MasterDataSections() {
  const t = useTranslations("serviceDesk");
  const accounts = useAccounts();
  const vendors = useVendors();
  const products = useProducts();
  const settings = useServiceDeskSettings();
  const m = useServiceDeskMutations();
  const terms = settings.data?.terminology ?? {};
  const { currentWorkspace } = useWorkspace();
  const { members, isLoading: membersLoading } = useWorkspaceMembers(currentWorkspace?.id ?? null);
  const canManage = settings.data?.can_manage === true;

  const [pName, setPName] = useState("");
  const [pDomains, setPDomains] = useState("");
  const [pOwner, setPOwner] = useState("");
  const [iName, setIName] = useState("");
  const [iDomains, setIDomains] = useState("");
  const [lName, setLName] = useState("");

  const domains = (s: string) => s.split(",").map((d) => d.trim()).filter(Boolean);

  return (
    <>
      <Section title={terms.accounts ?? t("settings.accounts")}>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("settings.accountsHint")}</p>
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder={t("settings.name")} className="max-w-[180px]" />
            <Input value={pDomains} onChange={(e) => setPDomains(e.target.value)} placeholder={t("settings.domainsHint")} className="max-w-[220px]" />
            <select
              value={pOwner}
              onChange={(e) => setPOwner(e.target.value)}
              aria-label={t("settings.assignedOwner")}
              className="h-10 max-w-[240px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("settings.noAssignedOwner")}</option>
              {members
                .filter((member) => member.status === "active")
                .map((member) => (
                  <option key={member.developer_id} value={member.developer_id}>
                    {member.developer_name || member.developer_email || member.developer_id}
                  </option>
                ))}
            </select>
            {membersLoading && <Spinner size="sm" />}
            <Button
              disabled={!pName.trim() || m.createAccount.isPending}
              onClick={() => {
                // `mutate` with an onSuccess, not `await mutateAsync` — a
                // rejected mutateAsync here was an unhandled rejection that
                // cleared nothing and said nothing. The inputs keep their text
                // on failure so the fix is a correction, not a re-type.
                m.createAccount.mutate(
                  { name: pName.trim(), assigned_owner_id: pOwner.trim() || null, domains: domains(pDomains) },
                  { onSuccess: () => { setPName(""); setPDomains(""); setPOwner(""); } },
                );
              }}
            >{t("settings.add")}</Button>
          </div>
        )}
        {accounts.isLoading ? <Spinner size="sm" /> : (accounts.data ?? []).length === 0 ? (
          // Not "Nothing here yet": an empty account table is not a blank slate,
          // it is a desk where every ticket lands in triage with an arbitrary
          // owner. Say the consequence, because it is invisible from here.
          <p className="max-w-2xl text-sm text-amber-700 dark:text-amber-400">
            {t("settings.accountsEmpty")}
          </p>
        ) : (accounts.data ?? []).map((p) => (
          <AccountRow
            key={p.id}
            account={p}
            canManage={canManage}
            members={members}
            products={products.data ?? []}
            saving={m.updateAccount.isPending}
            onSaveOwner={(ownerId) =>
              m.updateAccount.mutate({ id: p.id, data: { assigned_owner_id: ownerId } })
            }
            onSaveProducts={(next) =>
              m.updateAccount.mutate({ id: p.id, data: { products: next } })
            }
            onDelete={() => m.deleteAccount.mutate(p.id)}
          />
        ))}
      </Section>

      <Section title={terms.vendors ?? t("settings.vendors")}>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("settings.vendorsHint")}</p>
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <Input value={iName} onChange={(e) => setIName(e.target.value)} placeholder={t("settings.name")} className="max-w-[180px]" />
            <Input value={iDomains} onChange={(e) => setIDomains(e.target.value)} placeholder={t("settings.domainsHint")} className="max-w-[220px]" />
            <Button
              disabled={!iName.trim() || m.createVendor.isPending}
              onClick={() => m.createVendor.mutate(
                { name: iName.trim(), domains: domains(iDomains) },
                { onSuccess: () => { setIName(""); setIDomains(""); } },
              )}
            >{t("settings.add")}</Button>
          </div>
        )}
        {/* Previously an empty list rendered nothing at all, so the card read as
            broken rather than empty. */}
        {vendors.isLoading ? <Spinner size="sm" /> : (vendors.data ?? []).length === 0 ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{t("settings.vendorsEmpty")}</p>
        ) : (vendors.data ?? []).map((i) => (
          <Row key={i.id} canManage={canManage} onDelete={() => m.deleteVendor.mutate(i.id)}>
            <span className="font-medium">{i.name}</span>{" "}
            {i.domains.map((d) => <Badge key={d} variant="secondary" className="ml-1 text-[10px]">{d}</Badge>)}
          </Row>
        ))}
      </Section>

      <Section title={terms.products ?? t("settings.products")}>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("settings.productsHint")}</p>
        {canManage && (
          <div className="flex items-end gap-2">
            <Input value={lName} onChange={(e) => setLName(e.target.value)} placeholder={t("settings.name")} className="max-w-[220px]" />
            <Button disabled={!lName.trim() || m.createProduct.isPending} onClick={() => m.createProduct.mutate({ name: lName.trim() }, { onSuccess: () => setLName("") })}>{t("settings.add")}</Button>
          </div>
        )}
        {products.isLoading ? <Spinner size="sm" /> : (products.data ?? []).length === 0 ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{t("settings.productsEmpty")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(products.data ?? []).map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
                {l.name}
                {canManage && (
                  <button onClick={() => m.deleteProduct.mutate(l.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                )}
              </span>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

/** The addresses tickets arrive at. */
export function MailboxesSection() {
  const t = useTranslations("serviceDesk");
  const mailboxes = useMailboxes();
  const settings = useServiceDeskSettings();
  const m = useServiceDeskMutations();
  const canManage = settings.data?.can_manage === true;
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;

  const [mAddr, setMAddr] = useState("");
  const [mChannel, setMChannel] = useState<"webhook" | "gmail_sync">("webhook");
  const [accounts, setAccounts] = useState<GoogleAccountSummary[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);

  // Which addresses `gmail_sync` will actually accept. Fetched only when that
  // channel is selected — a webhook mailbox has no use for it, and this is a
  // page a desk manager may open with no Google account in sight.
  useEffect(() => {
    if (!workspaceId || mChannel !== "gmail_sync") return;
    let cancelled = false;
    googleIntegrationApi.accounts
      .list(workspaceId)
      .then((data) => {
        if (!cancelled) setAccounts(data.accounts);
      })
      .catch(() => {
        // A member without access to the integration settings still manages
        // mailboxes. Falling back to the plain hint is the right degradation.
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, mChannel]);

  const connect = async () => {
    if (!workspaceId || isConnecting) return;
    setIsConnecting(true);
    try {
      // Returns here rather than to the integrations page, so the account
      // arrives back where it was needed and the mailbox can be added without
      // navigating twice.
      const { auth_url } = await googleIntegrationApi.getConnectUrl(
        workspaceId,
        window.location.href
      );
      window.location.href = auth_url;
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not start the Google connection"));
      setIsConnecting(false);
    }
  };

  return (
    // No title or hint here: the Settings page header above already carries
    // both, and repeating them put the same sentence on screen twice.
    <Section>
      {canManage && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <Input value={mAddr} onChange={(e) => setMAddr(e.target.value)} placeholder={t("settings.address")} className="max-w-[240px]" />
            <select value={mChannel} onChange={(e) => setMChannel(e.target.value as "webhook" | "gmail_sync")} className="rounded-md border border-border bg-background px-3 py-2 text-sm" aria-label={t("settings.channel")}>
              <option value="webhook">{t("settings.channelWebhook")}</option>
              <option value="gmail_sync">{t("settings.channelGmail")}</option>
            </select>
            <Button disabled={!mAddr.trim() || m.createMailbox.isPending} onClick={() => m.createMailbox.mutate({ address: mAddr.trim(), channel: mChannel }, { onSuccess: () => setMAddr("") })}>{t("settings.add")}</Button>
          </div>
          {/* Which prerequisite applies depends on the channel picked, and the
              gmail_sync one is a hard 422 on Add — say so before, not after. */}
          <p className="max-w-2xl text-xs text-muted-foreground">
            {mChannel === "gmail_sync" ? t("settings.channelGmailHint") : t("settings.channelWebhookHint")}
          </p>

          {/*
            The prerequisite, made actionable.

            The hint above used to be the whole answer: go to another page,
            connect, come back, and type the address again from memory. The 422
            it warns about is almost always a typo or a near-miss — the desk
            address is `support@`, the connected account is `support.team@` —
            so listing the addresses that will be accepted, and letting one be
            clicked into the field, removes the failure rather than explaining
            it.
          */}
          {mChannel === "gmail_sync" && (
            <div className="flex flex-wrap items-center gap-2" data-testid="gmail-connect">
              {accounts.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {t("settings.useConnected")}
                  </span>
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setMAddr(account.google_email)}
                      data-testid={`use-account-${account.google_email}`}
                      className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                    >
                      {account.google_email}
                    </button>
                  ))}
                </>
              )}
              <button
                type="button"
                onClick={connect}
                disabled={isConnecting}
                data-testid="connect-google"
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {isConnecting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                {accounts.length > 0
                  ? t("settings.connectAnotherGoogle")
                  : t("settings.connectGoogle")}
              </button>
            </div>
          )}
        </>
      )}
      {(mailboxes.data ?? []).map((mb) => (
        <Row key={mb.id} canManage={canManage} onDelete={() => m.deleteMailbox.mutate(mb.id)}>
          <span className="font-medium">{mb.address}</span> <Badge variant="secondary" className="ml-1 text-[10px]">{mb.channel}</Badge>
        </Row>
      ))}

      {/* How quickly mail becomes a ticket. Shown here because this is the page
          where somebody decides an address is intake — the wait used to be an
          invisible 15 minutes inherited from the personal-inbox sync. */}
      <IntakeFrequencyEditor
        current={settings.data?.intake_poll_minutes ?? 2}
        canManage={canManage}
        saving={m.updateSettings.isPending}
        onSave={(minutes) => m.updateSettings.mutate({ intake_poll_minutes: minutes })}
      />
    </Section>
  );
}

/** How often Gmail-backed mailboxes are checked for new mail. */
function IntakeFrequencyEditor({
  current,
  canManage,
  saving,
  onSave,
}: {
  current: number;
  canManage: boolean;
  saving: boolean;
  onSave: (minutes: number) => void;
}) {
  const t = useTranslations("serviceDesk");
  const options = [1, 2, 5, 10, 15, 30, 60];

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm font-medium">{t("intakeFrequency.title")}</p>
      <p className="max-w-2xl text-sm text-muted-foreground">
        {t("intakeFrequency.description")}
      </p>
      <select
        value={current}
        disabled={!canManage || saving}
        aria-label={t("intakeFrequency.title")}
        onChange={(e) => onSave(Number(e.target.value))}
        className="h-10 max-w-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
      >
        {options.map((minutes) => (
          <option key={minutes} value={minutes}>
            {t("intakeFrequency.everyMinutes", { minutes })}
          </option>
        ))}
      </select>
      {/* Only ever lowers the wait: an account already syncing faster for other
          reasons keeps its own pace, which is what the backend does too. */}
      <p className="text-xs text-muted-foreground">{t("intakeFrequency.floorNote")}</p>
    </div>
  );
}

