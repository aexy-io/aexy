"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Inbox, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  useAccounts,
  useProducts,
  useServiceDeskMutations,
  useServiceDeskSettings,
  useServiceDeskTaxonomy,
  useServiceDeskTicketCount,
  useServiceDeskTickets,
  useVendors,
} from "@/hooks/useServiceDesk";
import { serviceDeskApi, TicketQuery } from "@/lib/service-desk-api";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import {
  serviceDeskStakeholderColor,
  TICKET_STATUS_COLORS,
  getStatusColor,
} from "@/lib/statusColors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ticketFieldLabel } from "@/components/tickets/ticketLabels";
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

const FILTER_CLASS =
  "h-9 rounded-md border border-input bg-background px-2 py-1 text-xs";

/**
 * How long ago, in the coarsest unit that is still true.
 *
 * Rounded down deliberately: a ticket opened 47 hours ago reads "1d", not "2d".
 * Rounding up would let something breach a two-day target on screen before it
 * has breached in fact, and the desk's clocks are the server's, not this one's.
 */
function relativeAge(iso: string, t: (k: string, v?: Record<string, string | number | Date>) => string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 3600) return t("table.ageMinutes", { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t("table.ageHours", { count: Math.floor(seconds / 3600) });
  return t("table.ageDays", { count: Math.floor(seconds / 86400) });
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** The `YYYY-MM-DD` a date input wants, back out of the ISO instant we store. */
const dateInput = (iso?: string) => (iso ? iso.slice(0, 10) : "");
const dayStart = (day: string) => (day ? `${day}T00:00:00Z` : undefined);
const dayEnd = (day: string) => (day ? `${day}T23:59:59Z` : undefined);

export default function ServiceDeskTicketsPage() {
  const t = useTranslations("serviceDesk");
  const router = useRouter();

  // One page of a filtered set. `PAGE_SIZE` is deliberately well under the
  // server's 200 cap: the point of paging is that a desk with six months of
  // history stays usable, and an export exists for the whole set.
  const PAGE_SIZE = 50;
  const [filters, setFilters] = useState<TicketQuery>({});
  const [page, setPage] = useState(0);
  // The box holds what is being typed; `filters.q` holds what has been asked
  // for. Committing on every keystroke would fire a query per character and
  // make the count flicker while somebody is still mid-word.
  const [search, setSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => {
      setPage(0);
      setFilters((f) => {
        const term = search.trim();
        if (term === (f.q ?? "")) return f;
        const next = { ...f };
        if (term) next.q = term;
        else delete next.q;
        return next;
      });
    }, 300);
    return () => clearTimeout(id);
  }, [search]);
  // Every filter change returns to the first page. Staying on page 4 of a set
  // that now has two pages shows an empty table and reads as "no results".
  const setFilter = (key: keyof TicketQuery, value: string | boolean | undefined) => {
    setPage(0);
    setFilters((f) => {
      const next = { ...f };
      if (value === undefined || value === "") delete next[key];
      else (next as Record<string, unknown>)[key] = value;
      return next;
    });
  };
  const activeFilterCount = Object.keys(filters).length;
  const query: TicketQuery = { ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE };
  const { data: tickets, isLoading } = useServiceDeskTickets(query);
  const { data: countData } = useServiceDeskTicketCount(filters);
  const total = countData?.total ?? 0;
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
  // A filtered list that matches nothing is not an empty desk. "No open tickets
  // — new requests will appear here automatically" is actively wrong then: it
  // says the work does not exist when it is only hidden, and the reader's next
  // move is to clear a filter, not to wait for mail.
  const filteredToNothing = activeFilterCount > 0;
  const products = useProducts();
  const accounts = useAccounts();
  const vendors = useVendors();
  const { currentWorkspace } = useWorkspace();
  const { members } = useWorkspaceMembers(currentWorkspace?.id ?? null);
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

  const [exporting, setExporting] = useState(false);

  // Fetched as a blob through the API client, not linked to: the endpoint is
  // behind a bearer token the browser will not attach on a plain navigation, so
  // an <a href> downloads an HTML 401 named .csv.
  const exportCsv = async () => {
    if (!currentWorkspace?.id) return;
    setExporting(true);
    try {
      const blob = await serviceDeskApi.exportTicketsCsv(currentWorkspace.id, filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `service-desk-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={exporting || total === 0}>
            {exporting ? (
              <Spinner size="sm" className="mr-1" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            {t("filters.export")}
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("manual.logTicket")}
          </Button>
        </div>
      </div>

      {/* The filter bar. Every control narrows the caller's own scope — the
          server applies visibility first and separately, so a KAM choosing
          another owner here sees nothing rather than that owner's queue. */}
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <FilterField label={t("filters.search")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("filters.searchHint")}
              className={`${FILTER_CLASS} w-56 pl-7`}
            />
          </div>
        </FilterField>
        <FilterField label={t("filters.from")}>
          <input
            type="date"
            value={dateInput(filters.created_from)}
            onChange={(e) => setFilter("created_from", dayStart(e.target.value))}
            className={FILTER_CLASS}
          />
        </FilterField>
        <FilterField label={t("filters.to")}>
          <input
            type="date"
            value={dateInput(filters.created_to)}
            // End of day, not midnight: a range typed as 1–31 July that stopped
            // at 00:00 on the 31st would silently drop that whole day.
            onChange={(e) => setFilter("created_to", dayEnd(e.target.value))}
            className={FILTER_CLASS}
          />
        </FilterField>
        <FilterField label={terms.account ?? t("table.account")}>
          <select
            value={filters.account_id ?? ""}
            onChange={(e) => setFilter("account_id", e.target.value)}
            className={FILTER_CLASS}
          >
            <option value="">{t("filters.any")}</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label={terms.product ?? t("filters.product")}>
          <select
            value={filters.product_id ?? ""}
            onChange={(e) => setFilter("product_id", e.target.value)}
            className={FILTER_CLASS}
          >
            <option value="">{t("filters.any")}</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label={terms.vendor ?? t("filters.vendor")}>
          <select
            value={filters.vendor_id ?? ""}
            onChange={(e) => setFilter("vendor_id", e.target.value)}
            className={FILTER_CLASS}
          >
            <option value="">{t("filters.any")}</option>
            {(vendors.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t("filters.owner")}>
          <select
            value={filters.assigned_to ?? ""}
            onChange={(e) => setFilter("assigned_to", e.target.value)}
            className={FILTER_CLASS}
          >
            <option value="">{t("filters.any")}</option>
            {(members ?? []).map((m) => (
              <option key={m.id} value={m.developer_id}>
                {m.developer_name || m.developer_email}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t("table.type")}>
          <select
            value={filters.request_type ?? ""}
            onChange={(e) => setFilter("request_type", e.target.value)}
            className={FILTER_CLASS}
          >
            <option value="">{t("filters.any")}</option>
            {requestTypes.map((r) => (
              <option key={r.slug} value={r.slug}>{requestTypeLabel(r.slug)}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t("table.pendingWith")}>
          <select
            value={filters.pending_with ?? ""}
            onChange={(e) => setFilter("pending_with", e.target.value)}
            className={FILTER_CLASS}
          >
            <option value="">{t("filters.any")}</option>
            {stakeholders.map((sh) => (
              <option key={sh.slug} value={sh.slug}>{stakeholderLabel(sh.slug)}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t("filters.state")}>
          <select
            value={filters.is_open === undefined ? "" : filters.is_open ? "open" : "closed"}
            onChange={(e) =>
              setFilter("is_open", e.target.value === "" ? undefined : e.target.value === "open")
            }
            className={FILTER_CLASS}
          >
            <option value="">{t("filters.any")}</option>
            <option value="open">{t("filters.open")}</option>
            <option value="closed">{t("filters.closed")}</option>
          </select>
        </FilterField>
        <label className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.assigned_to_me === true}
            onChange={(e) => setFilter("assigned_to_me", e.target.checked || undefined)}
          />
          {t("filters.mine")}
        </label>
        <label className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.needs_triage === true}
            onChange={(e) => setFilter("needs_triage", e.target.checked || undefined)}
          />
          {t("filters.needsTriage")}
        </label>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({});
              setSearch("");
              setPage(0);
            }}
          >
            <X className="mr-1 h-3 w-3" /> {t("filters.clear")}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {t("filters.matching", { count: total })}
        </span>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !tickets || tickets.length === 0 ? (
        <EmptyState
          icon={filteredToNothing ? Search : Inbox}
          title={filteredToNothing ? t("filters.noMatchTitle") : t("tabs.tickets")}
          description={filteredToNothing ? t("filters.noMatch") : emptyDescription}
          actions={
            filteredToNothing
              ? [{
                  label: t("filters.clear"),
                  onClick: () => { setFilters({}); setSearch(""); setPage(0); },
                  icon: X,
                }]
              : [{ label: t("manual.logTicket"), onClick: () => setOpen(true), icon: Plus }]
          }
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
                <th className="px-3 py-2 text-right">{t("table.age")}</th>
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
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${sc.bg} ${sc.text}`}>{ticketFieldLabel(tk.status)}</span>
                    </td>
                    {/* Age, not a timestamp: the list is sorted newest first,
                        and what a reader is scanning for is which of these has
                        been sitting too long — a date makes them do that
                        subtraction themselves, once per row. */}
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-muted-foreground" title={new Date(tk.created_at).toLocaleString()}>
                      {relativeAge(tk.created_at, t)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("filters.showing", {
              from: page * PAGE_SIZE + 1,
              to: Math.min((page + 1) * PAGE_SIZE, total),
              total,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              {t("filters.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("filters.next")}
            </Button>
          </div>
        </div>
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
