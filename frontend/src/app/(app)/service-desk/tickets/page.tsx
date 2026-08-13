"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  useAccounts,
  useProducts,
  useServiceDeskMutations,
  useServiceDeskSettings,
  useServiceDeskTaxonomy,
  useServiceDeskTickets,
} from "@/hooks/useServiceDesk";
import {
  serviceDeskStakeholderColor,
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

export default function ServiceDeskTicketsPage() {
  const t = useTranslations("serviceDesk");
  const router = useRouter();
  const { data: tickets, isLoading } = useServiceDeskTickets();
  const { stakeholders, requestTypes, stakeholderLabel, requestTypeLabel } = useServiceDeskTaxonomy();
  // An empty list means different things to different people, and the generic
  // "no tickets yet" is misleading for two of them: scope "none" is someone
  // who was never added to a department (nothing can ever match), and scope
  // "assigned" is an owner who sees only their own tickets (the desk may be
  // busy; none of it is theirs). The server does the filtering either way.
  const settings = useServiceDeskSettings();
  const scope = settings.data?.scope;
  const outOfScope = scope === "none";
  const emptyDescription =
    scope === "none" ? t("noDepartment") : scope === "assigned" ? t("assignedOnly") : t("dashboard.empty");
  const products = useProducts();
  const accounts = useAccounts();
  const terms = settings.data?.terminology ?? {};
  const { createManual } = useServiceDeskMutations();

  const [open, setOpen] = useState(false);
  // Blank rather than a hardcoded "query": the default request type is the
  // workspace's own, and sending nothing lets the server resolve it.
  const EMPTY_FORM = {
    subject: "", body: "", requester_name: "", requester_email: "",
    request_type: "", product_id: "", account_id: "",
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Preselect the workspace's default once the taxonomy has loaded, so the
  // dropdown isn't empty while still deferring to the server if it hasn't.
  const defaultRequestType = requestTypes.find((r) => r.is_default)?.slug ?? requestTypes[0]?.slug ?? "";

  const submit = async () => {
    if (!form.subject.trim()) return;
    const created = await createManual.mutateAsync({
      subject: form.subject.trim(),
      // The dropdown always shows a request type, so send the one on screen
      // rather than nothing when it was never touched — otherwise the server
      // resolves its own default and the ticket stays flagged for triage.
      request_type: form.request_type || defaultRequestType || undefined,
      body: form.body,
      requester_name: form.requester_name || undefined,
      requester_email: form.requester_email || undefined,
      product_id: form.product_id || undefined,
      account_id: form.account_id || undefined,
    });
    setForm(EMPTY_FORM);
    setOpen(false);
    // Straight to the ticket. Whoever logged this is usually still on the phone
    // with the requester, and the ticket id is what they have to read out.
    if (created?.ticket_id) router.push(`/service-desk/tickets/${created.ticket_id}`);
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
          description={emptyDescription}
          actions={[{ label: t("manual.logTicket"), onClick: () => setOpen(true), icon: Plus }]}
        />
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t("table.id")}</th>
                <th className="px-3 py-2">{t("table.subject")}</th>
                <th className="px-3 py-2">{terms.account ?? t("table.account")}</th>
                <th className="px-3 py-2">{t("table.type")}</th>
                <th className="px-3 py-2">{t("table.pendingWith")}</th>
                <th className="px-3 py-2">{t("table.status")}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((tk) => {
                const sh = stakeholders.find((x) => x.slug === tk.pending_with);
                const pc = serviceDeskStakeholderColor(tk.pending_with, {
                  position: sh?.position,
                  semantics: sh?.semantics,
                });
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
                    <td className="px-3 py-2">{tk.account_name ?? "—"}</td>
                    <td className="px-3 py-2">{requestTypeLabel(tk.request_type)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${pc?.bg} ${pc?.text}`}>
                        {stakeholderLabel(tk.pending_with)}
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
                <select value={form.request_type || defaultRequestType} onChange={(e) => set("request_type", e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                  {requestTypes.map((ty) => (
                    <option key={ty.slug} value={ty.slug}>{ty.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{terms.product ?? t("manual.product")}</label>
                <select value={form.product_id} onChange={(e) => set("product_id", e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                  <option value="">{t("manual.none")}</option>
                  {(products.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{terms.account ?? t("manual.account")}</label>
                <select value={form.account_id} onChange={(e) => set("account_id", e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                  <option value="">{t("manual.none")}</option>
                  {(accounts.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
