"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  useLobs,
  usePartners,
  useServiceDeskMutations,
  useServiceDeskSettings,
  useServiceDeskTickets,
} from "@/hooks/useServiceDesk";
import { RequestType } from "@/lib/service-desk-api";
import {
  SERVICE_DESK_PENDING_WITH_COLORS,
  SERVICE_DESK_PENDING_WITH_LABELS,
  SERVICE_DESK_REQUEST_TYPE_LABELS,
  TICKET_STATUS_COLORS,
  getStatusColor,
} from "@/lib/statusColors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const TYPES: RequestType[] = ["query", "policy_issuance", "claims", "payout"];

export default function ServiceDeskTicketsPage() {
  const t = useTranslations("serviceDesk");
  const router = useRouter();
  const { data: tickets, isLoading } = useServiceDeskTickets();
  // scope === "none" means the caller is in no department, so the row filter can
  // never match anything. Without this the page would show a plain "no tickets"
  // and a KAM who was never added to Operations would read it as a quiet day.
  const settings = useServiceDeskSettings();
  const outOfScope = settings.data?.scope === "none";
  const lobs = useLobs();
  const partners = usePartners();
  const { createManual } = useServiceDeskMutations();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    subject: "", body: "", requester_name: "", requester_email: "",
    request_type: "query" as RequestType, lob_id: "", partner_id: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.subject.trim()) return;
    await createManual.mutateAsync({
      subject: form.subject.trim(),
      body: form.body,
      requester_name: form.requester_name || undefined,
      requester_email: form.requester_email || undefined,
      request_type: form.request_type,
      lob_id: form.lob_id || undefined,
      partner_id: form.partner_id || undefined,
    });
    setForm({ subject: "", body: "", requester_name: "", requester_email: "", request_type: "query", lob_id: "", partner_id: "" });
    setOpen(false);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("tabs.tickets")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> {t("manual.logTicket")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !tickets || tickets.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("tabs.tickets")}
          description={outOfScope ? t("noDepartment") : t("dashboard.empty")}
          actions={[{ label: t("manual.logTicket"), onClick: () => setOpen(true), icon: Plus }]}
        />
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t("table.id")}</th>
                <th className="px-3 py-2">{t("table.subject")}</th>
                <th className="px-3 py-2">{t("table.partner")}</th>
                <th className="px-3 py-2">{t("table.type")}</th>
                <th className="px-3 py-2">{t("table.pendingWith")}</th>
                <th className="px-3 py-2">{t("table.status")}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((tk) => {
                const pc = SERVICE_DESK_PENDING_WITH_COLORS[tk.pending_with];
                const sc = getStatusColor(TICKET_STATUS_COLORS, tk.status ?? "new");
                return (
                  <tr
                    key={tk.ticket_id}
                    onClick={() => router.push(`/service-desk/tickets/${tk.ticket_id}`)}
                    className="cursor-pointer border-t border-border hover:bg-accent/50"
                  >
                    <td className="px-3 py-2 font-medium">
                      {tk.display_id}
                      {tk.needs_triage && <Badge variant="outline" className="ml-1 text-[10px] text-amber-600">{t("table.triage")}</Badge>}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2">{tk.subject ?? "—"}</td>
                    <td className="px-3 py-2">{tk.partner_name ?? "—"}</td>
                    <td className="px-3 py-2">{SERVICE_DESK_REQUEST_TYPE_LABELS[tk.request_type] ?? tk.request_type}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${pc?.bg} ${pc?.text}`}>
                        {SERVICE_DESK_PENDING_WITH_LABELS[tk.pending_with] ?? tk.pending_with}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${sc.bg} ${sc.text}`}>{tk.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Manual ticket dialog — reuses the same fields/intake as email tickets */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("manual.title")}</DialogTitle>
            <DialogDescription>{t("manual.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("manual.subject")}</label>
              <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("manual.description")}</label>
              <textarea
                value={form.body}
                onChange={(e) => set("body", e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("manual.requesterName")}</label>
                <Input value={form.requester_name} onChange={(e) => set("requester_name", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("manual.requesterEmail")}</label>
                <Input value={form.requester_email} onChange={(e) => set("requester_email", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("manual.type")}</label>
                <select value={form.request_type} onChange={(e) => set("request_type", e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                  {TYPES.map((ty) => <option key={ty} value={ty}>{SERVICE_DESK_REQUEST_TYPE_LABELS[ty]}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("manual.lob")}</label>
                <select value={form.lob_id} onChange={(e) => set("lob_id", e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                  <option value="">{t("manual.none")}</option>
                  {(lobs.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("manual.partner")}</label>
                <select value={form.partner_id} onChange={(e) => set("partner_id", e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                  <option value="">{t("manual.none")}</option>
                  {(partners.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={!form.subject.trim() || createManual.isPending}>
              {createManual.isPending ? t("manual.creating") : t("manual.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
