"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  useInsurers,
  useLobs,
  useMailboxes,
  usePartners,
  useServiceDeskMutations,
  useServiceDeskSettings,
  useServiceDeskTemplates,
} from "@/hooks/useServiceDesk";
import { ServiceDeskTemplate } from "@/lib/service-desk-api";
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
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {t("templates.variables")}: {tpl.variables.map((v) => `{{${v}}}`).join(" ")}
        </span>
        {canManage && (
          <Button size="sm" disabled={!dirty || saving} onClick={() => onSave(subject, body)}>
            {saving ? t("templates.saving") : t("templates.save")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
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

/** Shift length in hours, to one decimal — what one "day" of the target means. */
function hoursBetween(from: string, to: string): string {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const mins = th * 60 + tm - (fh * 60 + fm);
  return (Math.max(mins, 0) / 60).toFixed(1);
}

export default function ServiceDeskSettingsPage() {
  const t = useTranslations("serviceDesk");
  const partners = usePartners();
  const insurers = useInsurers();
  const lobs = useLobs();
  const mailboxes = useMailboxes();
  const settings = useServiceDeskSettings();
  const templates = useServiceDeskTemplates();
  const m = useServiceDeskMutations();

  const [pName, setPName] = useState("");
  const [pDomains, setPDomains] = useState("");
  const [pKam, setPKam] = useState("");
  const [iName, setIName] = useState("");
  const [iDomains, setIDomains] = useState("");
  const [lName, setLName] = useState("");
  const [mAddr, setMAddr] = useState("");
  const [mChannel, setMChannel] = useState<"webhook" | "gmail_sync">("webhook");

  const domains = (s: string) => s.split(",").map((d) => d.trim()).filter(Boolean);

  // Master data / settings / templates need can_manage_service_desk. The API
  // enforces it either way (403); hiding the controls keeps us from offering
  // actions that cannot succeed. Assume read-only until the flag arrives.
  const canManage = settings.data?.can_manage === true;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("tabs.settings")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!settings.isLoading && !canManage && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm text-muted-foreground">{t("settings.readOnly")}</p>
        </Card>
      )}

      {/* AI toggle (org level) */}
      <Section title={t("ai.title")}>
        <div className="flex items-start justify-between gap-4">
          <p className="max-w-2xl text-sm text-muted-foreground">{t("ai.description")}</p>
          <button
            type="button"
            role="switch"
            aria-checked={!!settings.data?.ai_classification_enabled}
            disabled={!canManage || m.updateSettings.isPending || settings.isLoading}
            onClick={() =>
              m.updateSettings.mutate({
                ai_classification_enabled: !settings.data?.ai_classification_enabled,
              })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${settings.data?.ai_classification_enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${settings.data?.ai_classification_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
      </Section>

      {/* Working hours — the shift the breach clock runs on */}
      <Section title={t("workingHours.title")}>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("workingHours.description")}</p>
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

      {/* Email templates (editable copy) */}
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

      {/* Partners */}
      <Section title={t("settings.partners")}>
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder={t("settings.name")} className="max-w-[180px]" />
            <Input value={pDomains} onChange={(e) => setPDomains(e.target.value)} placeholder={t("settings.domainsHint")} className="max-w-[220px]" />
            <Input value={pKam} onChange={(e) => setPKam(e.target.value)} placeholder={t("settings.assignedKam")} className="max-w-[200px]" />
            <Button
              disabled={!pName.trim() || m.createPartner.isPending}
              onClick={async () => {
                await m.createPartner.mutateAsync({ name: pName.trim(), assigned_kam_id: pKam.trim() || null, domains: domains(pDomains) });
                setPName(""); setPDomains(""); setPKam("");
              }}
            >{t("settings.add")}</Button>
          </div>
        )}
        {partners.isLoading ? <Spinner size="sm" /> : (partners.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.empty")}</p>
        ) : (partners.data ?? []).map((p) => (
          <Row key={p.id} canManage={canManage} onDelete={() => m.deletePartner.mutate(p.id)}>
            <span className="font-medium">{p.name}</span>{" "}
            {p.domains.map((d) => <Badge key={d} variant="secondary" className="ml-1 text-[10px]">{d}</Badge>)}
          </Row>
        ))}
      </Section>

      {/* Insurers */}
      <Section title={t("settings.insurers")}>
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <Input value={iName} onChange={(e) => setIName(e.target.value)} placeholder={t("settings.name")} className="max-w-[180px]" />
            <Input value={iDomains} onChange={(e) => setIDomains(e.target.value)} placeholder={t("settings.domainsHint")} className="max-w-[220px]" />
            <Button
              disabled={!iName.trim() || m.createInsurer.isPending}
              onClick={async () => { await m.createInsurer.mutateAsync({ name: iName.trim(), domains: domains(iDomains) }); setIName(""); setIDomains(""); }}
            >{t("settings.add")}</Button>
          </div>
        )}
        {(insurers.data ?? []).map((i) => (
          <Row key={i.id} canManage={canManage} onDelete={() => m.deleteInsurer.mutate(i.id)}>
            <span className="font-medium">{i.name}</span>{" "}
            {i.domains.map((d) => <Badge key={d} variant="secondary" className="ml-1 text-[10px]">{d}</Badge>)}
          </Row>
        ))}
      </Section>

      {/* LOBs */}
      <Section title={t("settings.lobs")}>
        {canManage && (
          <div className="flex items-end gap-2">
            <Input value={lName} onChange={(e) => setLName(e.target.value)} placeholder={t("settings.name")} className="max-w-[220px]" />
            <Button disabled={!lName.trim() || m.createLob.isPending} onClick={async () => { await m.createLob.mutateAsync({ name: lName.trim() }); setLName(""); }}>{t("settings.add")}</Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {(lobs.data ?? []).map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
              {l.name}
              {canManage && (
                <button onClick={() => m.deleteLob.mutate(l.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
              )}
            </span>
          ))}
        </div>
      </Section>

      {/* Mailboxes */}
      <Section title={t("settings.mailboxes")}>
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <Input value={mAddr} onChange={(e) => setMAddr(e.target.value)} placeholder={t("settings.address")} className="max-w-[240px]" />
            <select value={mChannel} onChange={(e) => setMChannel(e.target.value as "webhook" | "gmail_sync")} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="webhook">webhook</option>
              <option value="gmail_sync">gmail_sync</option>
            </select>
            <Button disabled={!mAddr.trim() || m.createMailbox.isPending} onClick={async () => { await m.createMailbox.mutateAsync({ address: mAddr.trim(), channel: mChannel }); setMAddr(""); }}>{t("settings.add")}</Button>
          </div>
        )}
        {(mailboxes.data ?? []).map((mb) => (
          <Row key={mb.id} canManage={canManage} onDelete={() => m.deleteMailbox.mutate(mb.id)}>
            <span className="font-medium">{mb.address}</span> <Badge variant="secondary" className="ml-1 text-[10px]">{mb.channel}</Badge>
          </Row>
        ))}
      </Section>
    </div>
  );
}
