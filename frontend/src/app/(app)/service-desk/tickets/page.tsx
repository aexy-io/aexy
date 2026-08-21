"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Download, Inbox, Plus, Search, SlidersHorizontal, X } from "lucide-react";
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
import { useProjects } from "@/hooks/useProjects";
import { ticketsApi } from "@/lib/api";
import { getApiErrorMessage, saveBlob } from "@/lib/utils";
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

type SortKey = "created" | "ticket" | "subject" | "account" | "type" | "pending" | "status";

// Text reads naturally A→Z; a date and a number read newest/highest first.
// Getting this wrong means every first click on a column looks broken.
const SORT_DEFAULT_DIRECTION: Record<SortKey, "asc" | "desc"> = {
  created: "desc",
  ticket: "desc",
  subject: "asc",
  account: "asc",
  type: "asc",
  pending: "asc",
  status: "asc",
};

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

/**
 * One applied filter, and the way to drop it.
 *
 * The bar has ten controls and used to give no answer to "which of these are
 * set?" without reading all ten. A chip per applied filter puts that on screen,
 * and makes each one reversible on its own — clearing everything to undo one
 * wrong choice is the reason people stop using filters.
 */
function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 py-0.5 pl-2 pr-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * A column header that sorts.
 *
 * The caret only appears on the column in force. Showing a neutral glyph on
 * every header makes six columns look sorted at once and tells the reader
 * nothing about which one actually is.
 */
function SortableHeader({
  label,
  column,
  sort,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  direction: "asc" | "desc";
  onSort: (c: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort === column;
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
        className={`inline-flex items-center gap-1 uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          active ? "text-foreground" : ""
        }`}
      >
        {label}
        {active && (direction === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    </th>
  );
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
  const [sort, setSort] = useState<SortKey>("created");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  // Clicking the column already in force reverses it; a new column starts in
  // whichever direction reads as "the interesting end" for that kind of value.
  const onSort = (column: SortKey) => {
    setPage(0);
    if (column === sort) setDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setDirection(SORT_DEFAULT_DIRECTION[column]);
    }
  };
  // Whether the secondary filters are on screen. Open by default only when
  // something inside is already set, so a filtered view never hides why.
  const [showMore, setShowMore] = useState(false);

  const activeFilterCount = Object.keys(filters).length;
  const query: TicketQuery = {
    ...filters,
    sort,
    direction,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
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
  // For the optional "raise the task now" fields in the log dialog.
  const { projects } = useProjects(currentWorkspace?.id ?? null);
  const terms = settings.data?.terminology ?? {};
  const { createManual } = useServiceDeskMutations();

  const clearAll = () => {
    setFilters({});
    setSearch("");
    setPage(0);
  };

  // One description per applied filter: what it narrowed, to what, and how to
  // undo it. Named lookups rather than raw ids — a chip reading
  // "Customer: 352b8193-…" would be worse than no chip at all.
  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | undefined) =>
    (id && list?.find((x) => x.id === id)?.name) || id || "";
  const chips: { key: string; label: string; value: string; remove: () => void }[] = [];
  const chip = (key: keyof TicketQuery, label: string, value: string) => {
    if (!value) return;
    chips.push({ key, label, value, remove: () => setFilter(key, undefined) });
  };
  if (filters.q) chip("q", t("filters.search"), filters.q);
  if (filters.created_from) chip("created_from", t("filters.from"), dateInput(filters.created_from));
  if (filters.created_to) chip("created_to", t("filters.to"), dateInput(filters.created_to));
  if (filters.account_id)
    chip("account_id", terms.account ?? t("table.account"), nameOf(accounts.data, filters.account_id));
  if (filters.product_id)
    chip("product_id", terms.product ?? t("filters.product"), nameOf(products.data, filters.product_id));
  if (filters.vendor_id)
    chip("vendor_id", terms.vendor ?? t("filters.vendor"), nameOf(vendors.data, filters.vendor_id));
  if (filters.assigned_to) {
    const m = (members ?? []).find((x) => x.developer_id === filters.assigned_to);
    chip("assigned_to", t("filters.owner"), m?.developer_name || m?.developer_email || filters.assigned_to);
  }
  if (filters.request_type) chip("request_type", t("table.type"), requestTypeLabel(filters.request_type));
  if (filters.pending_with) chip("pending_with", t("table.pendingWith"), stakeholderLabel(filters.pending_with));
  if (filters.is_open !== undefined)
    chip("is_open", t("filters.state"), filters.is_open ? t("filters.open") : t("filters.closed"));
  if (filters.assigned_to_me) chip("assigned_to_me", t("filters.owner"), t("filters.mine"));
  if (filters.needs_triage) chip("needs_triage", t("table.status"), t("filters.needsTriage"));

  const [open, setOpen] = useState(false);
  // Blank rather than a hardcoded "query": the default request type is the
  // workspace's own, and sending nothing lets the server resolve it.
  const EMPTY_FORM = {
    subject: "", body: "", requester_name: "", requester_email: "",
    request_type: "", product_id: "", account_id: "",
    // Optional: raise the work in the same step as the ticket.
    task_project_id: "", task_assignee_id: "",
  };
  const [form, setForm] = useState(EMPTY_FORM);
  // What the board the operator picked hands the ticket to. Read off the project
  // list, which the server already annotates, so the dialog costs no extra call.
  const taskBoardBucket =
    (projects ?? []).find((p) => p.id === form.task_project_id)?.desk_stakeholder_slug ?? "";
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [files, setFiles] = useState<File[]>([]);
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

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
      saveBlob(blob, `service-desk-tickets-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setExporting(false);
    }
  };

  // Logging a call is up to three calls, in this order, because each step needs
  // the id the one before it produced: the attachment endpoint is addressed by
  // ticket, and the task copies the ticket's files onto itself as it is created.
  // Doing it the other way round is how the files end up only on the ticket.
  const submit = async () => {
    if (!form.subject.trim() || !currentWorkspace?.id) return;
    setLogging(true);
    setLogError(null);
    let createdId: string | undefined;
    try {
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
      createdId = created?.ticket_id;
      if (!createdId) throw new Error("The ticket was logged but returned no id.");

      if (files.length > 0) {
        await ticketsApi.uploadAttachments(currentWorkspace.id, createdId, files);
      }
      if (form.task_project_id) {
        await serviceDeskApi.convertToTask(currentWorkspace.id, createdId, {
          project_id: form.task_project_id,
          assignee_id: form.task_assignee_id || undefined,
          // The ticket's subject is the task's title; the operator has already
          // typed it once.
          title: form.subject.trim(),
          // Where the work now sits. Taken from the board the operator just
          // picked, and shown next to that picker before they submit — not a
          // separate control, because this dialog is filled in while a caller is
          // still on the phone.
          pending_with:
            (projects ?? []).find((p) => p.id === form.task_project_id)
              ?.desk_stakeholder_slug ?? undefined,
        });
      }
    } catch (err) {
      // The ticket itself may well exist — the caller is on the phone and must
      // not be told the call was lost. Say what did not finish and leave the
      // dialog open with the ticket id, so the rest can be done on the ticket.
      setLogError(
        createdId
          ? `Ticket logged, but finishing up failed: ${getApiErrorMessage(err, "unknown error")}. Open the ticket to add the file or raise the task.`
          : getApiErrorMessage(err, "Could not log that ticket."),
      );
      setLogging(false);
      if (createdId) {
        setFiles([]);
        setForm(EMPTY_FORM);
      }
      return;
    }
    setLogging(false);
    setForm(EMPTY_FORM);
    setFiles([]);
    setOpen(false);
    // Straight to the ticket. Whoever logged this is usually still on the phone
    // with the requester, and the ticket id is what they have to read out.
    if (createdId) router.push(`/service-desk/tickets/${createdId}`);
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
      {/* Primary row: what people reach for. Everything rarer sits one click
          away rather than competing with it — ten equal controls in a row made
          the two that matter as hard to find as the eight that do not. */}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-end gap-2">
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
          <Button
            variant={showMore ? "secondary" : "outline"}
            size="sm"
            className="h-9"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            {t("filters.more")}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {t("filters.matching", { count: total })}
          </span>
        </div>

        {showMore && (
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-3 lg:grid-cols-4">
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
            <label className="flex h-9 items-end gap-1.5 pb-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={filters.assigned_to_me === true}
                onChange={(e) => setFilter("assigned_to_me", e.target.checked || undefined)}
              />
              {t("filters.mine")}
            </label>
            <label className="flex h-9 items-end gap-1.5 pb-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={filters.needs_triage === true}
                onChange={(e) => setFilter("needs_triage", e.target.checked || undefined)}
              />
              {t("filters.needsTriage")}
            </label>
          </div>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            {chips.map((c) => (
              <FilterChip key={c.key} label={c.label} value={c.value} onRemove={c.remove} />
            ))}
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>
              {t("filters.clear")}
            </Button>
          </div>
        )}
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
                <SortableHeader label={t("table.id")} column="ticket" sort={sort} direction={direction} onSort={onSort} />
                <SortableHeader label={t("table.subject")} column="subject" sort={sort} direction={direction} onSort={onSort} />
                <SortableHeader label={terms.account ?? t("table.account")} column="account" sort={sort} direction={direction} onSort={onSort} />
                <SortableHeader label={t("table.type")} column="type" sort={sort} direction={direction} onSort={onSort} />
                <SortableHeader label={t("table.pendingWith")} column="pending" sort={sort} direction={direction} onSort={onSort} />
                <SortableHeader label={t("table.status")} column="status" sort={sort} direction={direction} onSort={onSort} />
                <SortableHeader label={t("table.age")} column="created" sort={sort} direction={direction} onSort={onSort} align="right" />
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

            {/* Files the requester sent. Uploaded after the ticket exists — the
                endpoint is addressed by ticket — and copied onto the task below
                if one is raised. */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("manual.attachments")}</label>
              <input
                type="file"
                multiple
                data-testid="manual-ticket-files"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-xs"
              />
              {files.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("manual.attachmentsChosen", { count: files.length })}
                </p>
              )}
            </div>

            {/* Raise the work at the same time. Optional: plenty of calls are
                answered on the call and never become a task.

                Hidden entirely when the workspace has no projects — the section
                would otherwise offer a picker whose only option is "don't", and
                a control that cannot do anything reads as a broken one. */}
            {(projects ?? []).length > 0 && (
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-medium">{t("manual.taskSection")}</p>
              {/* Stacks on a phone: side by side at 375px clipped the option
                  text ("Don't create a ta…"), and the operator is often on a
                  handset while the caller is still talking. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("manual.taskProject")}</label>
                  <select
                    value={form.task_project_id}
                    data-testid="manual-ticket-project"
                    onChange={(e) => set("task_project_id", e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  >
                    <option value="">{t("manual.taskNone")}</option>
                    {(projects ?? []).map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name}</option>
                    ))}
                  </select>
                  {/* Stated before submitting, because the ticket moving queue is
                      not something the operator asked for on this screen. */}
                  {form.task_project_id && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {taskBoardBucket
                        ? `${t("detail.convertPendingWith")}: ${stakeholderLabel(taskBoardBucket)}`
                        : t("detail.convertNoRouting")}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("manual.taskAssignee")}</label>
                  <select
                    value={form.task_assignee_id}
                    data-testid="manual-ticket-assignee"
                    disabled={!form.task_project_id}
                    onChange={(e) => set("task_assignee_id", e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">{t("manual.taskUnassigned")}</option>
                    {members
                      .filter((m) => m.status === "active")
                      .map((m) => (
                        <option key={m.developer_id} value={m.developer_id}>
                          {m.developer_name || m.developer_email || m.developer_id}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
            )}

            {logError && (
              <p className="text-sm text-destructive" data-testid="manual-ticket-error">{logError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={submit}
              data-testid="manual-ticket-submit"
              disabled={!form.subject.trim() || logging || createManual.isPending}
            >
              {logging || createManual.isPending ? t("manual.creating") : t("manual.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
