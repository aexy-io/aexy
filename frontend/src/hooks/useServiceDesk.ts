"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  serviceDeskApi,
  Account,
  Vendor,
  Product,
  Mailbox,
  IndustryTemplate,
  PendingWith,
  RequestType,
  RequestTypeRow,
  Stakeholder,
  ServiceDeskDashboard,
  ServiceDeskSettings,
  ServiceDeskSettingsPatch,
  ServiceDeskTemplate,
  ServiceDeskTicket,
  ServiceDeskTicketDetail,
} from "@/lib/service-desk-api";

const keys = {
  dashboard: (ws: string) => ["service-desk", "dashboard", ws] as const,
  tickets: (ws: string) => ["service-desk", "tickets", ws] as const,
  ticket: (ws: string, id: string) => ["service-desk", "ticket", ws, id] as const,
  accounts: (ws: string) => ["service-desk", "accounts", ws] as const,
  vendors: (ws: string) => ["service-desk", "vendors", ws] as const,
  products: (ws: string) => ["service-desk", "products", ws] as const,
  mailboxes: (ws: string) => ["service-desk", "mailboxes", ws] as const,
  settings: (ws: string) => ["service-desk", "settings", ws] as const,
  templates: (ws: string) => ["service-desk", "templates", ws] as const,
  stakeholders: (ws: string) => ["service-desk", "stakeholders", ws] as const,
  requestTypes: (ws: string) => ["service-desk", "request-types", ws] as const,
  industryTemplates: (ws: string) => ["service-desk", "industry-templates", ws] as const,
};

export function useServiceDeskSettings() {
  const ws = useWs();
  return useQuery<ServiceDeskSettings>({
    queryKey: keys.settings(ws ?? ""),
    queryFn: () => serviceDeskApi.getSettings(ws!),
    enabled: !!ws,
  });
}

export function useServiceDeskTemplates() {
  const ws = useWs();
  return useQuery<ServiceDeskTemplate[]>({
    queryKey: keys.templates(ws ?? ""),
    queryFn: () => serviceDeskApi.listTemplates(ws!),
    enabled: !!ws,
  });
}

function useWs() {
  const { currentWorkspace } = useWorkspace();
  return currentWorkspace?.id;
}

export function useServiceDeskDashboard() {
  const ws = useWs();
  return useQuery<ServiceDeskDashboard>({
    queryKey: keys.dashboard(ws ?? ""),
    queryFn: () => serviceDeskApi.getDashboard(ws!),
    enabled: !!ws,
  });
}

export function useServiceDeskTickets() {
  const ws = useWs();
  return useQuery<ServiceDeskTicket[]>({
    queryKey: keys.tickets(ws ?? ""),
    queryFn: () => serviceDeskApi.listTickets(ws!),
    enabled: !!ws,
  });
}

export function useServiceDeskTicket(id: string | null | undefined) {
  const ws = useWs();
  return useQuery<ServiceDeskTicketDetail>({
    queryKey: keys.ticket(ws ?? "", id ?? ""),
    queryFn: () => serviceDeskApi.getTicket(ws!, id!),
    enabled: !!ws && !!id,
  });
}

export function useAccounts() {
  const ws = useWs();
  return useQuery<Account[]>({ queryKey: keys.accounts(ws ?? ""), queryFn: () => serviceDeskApi.listAccounts(ws!), enabled: !!ws });
}
export function useVendors() {
  const ws = useWs();
  return useQuery<Vendor[]>({ queryKey: keys.vendors(ws ?? ""), queryFn: () => serviceDeskApi.listVendors(ws!), enabled: !!ws });
}
export function useProducts() {
  const ws = useWs();
  return useQuery<Product[]>({ queryKey: keys.products(ws ?? ""), queryFn: () => serviceDeskApi.listProducts(ws!), enabled: !!ws });
}
export function useMailboxes() {
  const ws = useWs();
  return useQuery<Mailbox[]>({ queryKey: keys.mailboxes(ws ?? ""), queryFn: () => serviceDeskApi.listMailboxes(ws!), enabled: !!ws });
}

export function useStakeholders() {
  const ws = useWs();
  return useQuery<Stakeholder[]>({
    queryKey: keys.stakeholders(ws ?? ""),
    queryFn: () => serviceDeskApi.listStakeholders(ws!),
    enabled: !!ws,
    // The vocabulary changes when an admin edits it, not while someone works a
    // queue — so don't re-fetch it on every window focus.
    staleTime: 5 * 60_000,
  });
}

export function useRequestTypes() {
  const ws = useWs();
  return useQuery<RequestTypeRow[]>({
    queryKey: keys.requestTypes(ws ?? ""),
    queryFn: () => serviceDeskApi.listRequestTypes(ws!),
    enabled: !!ws,
    staleTime: 5 * 60_000,
  });
}

export function useIndustryTemplates() {
  const ws = useWs();
  return useQuery<IndustryTemplate[]>({
    queryKey: keys.industryTemplates(ws ?? ""),
    queryFn: () => serviceDeskApi.listIndustryTemplates(ws!),
    enabled: !!ws,
    // A static catalogue — it only changes when the app is redeployed.
    staleTime: Infinity,
  });
}

/**
 * The workspace's vocabulary, ready to render.
 *
 * Every component used to keep its own copy of the stakeholder ordering as a
 * hardcoded array of insurance slugs (`["kam", "insurer", "partner", …]`), which
 * meant a workspace's own stakeholders were either mis-ordered or invisible.
 * Ordering now comes from `position`, and labels from the rows themselves.
 */
export function useServiceDeskTaxonomy() {
  const stakeholders = useStakeholders();
  const requestTypes = useRequestTypes();

  const byPosition = <T extends { position: number; slug: string }>(rows: T[] | undefined) =>
    [...(rows ?? [])].sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug));

  const orderedStakeholders = byPosition(stakeholders.data);
  const orderedRequestTypes = byPosition(requestTypes.data);

  const stakeholderLabels: Record<string, string> = {};
  for (const s of orderedStakeholders) stakeholderLabels[s.slug] = s.label;
  const requestTypeLabels: Record<string, string> = {};
  for (const r of orderedRequestTypes) requestTypeLabels[r.slug] = r.label;

  return {
    stakeholders: orderedStakeholders,
    requestTypes: orderedRequestTypes,
    /** Non-terminal buckets, in the workspace's order — the queue columns. */
    openStakeholders: orderedStakeholders.filter((s) => s.semantics !== "closed"),
    /** The terminal bucket's slug, for the "close this ticket" action. */
    closedSlug: orderedStakeholders.find((s) => s.semantics === "closed")?.slug ?? null,
    /**
     * A slug's label, falling back to the slug itself. A ticket can hold a
     * retired slug, and showing `third_party` is better than showing nothing.
     */
    stakeholderLabel: (slug: string | null | undefined) =>
      (slug && stakeholderLabels[slug]) || slug || "—",
    requestTypeLabel: (slug: string | null | undefined) =>
      (slug && requestTypeLabels[slug]) || slug || "—",
    isLoading: stakeholders.isLoading || requestTypes.isLoading,
    /** True once a desk has been set up — drives the first-run template picker. */
    isConfigured: orderedStakeholders.length > 0,
  };
}

export function useServiceDeskMutations() {
  const ws = useWs();
  const qc = useQueryClient();
  const invalidateTickets = (id?: string) => {
    if (!ws) return;
    qc.invalidateQueries({ queryKey: keys.dashboard(ws) });
    qc.invalidateQueries({ queryKey: keys.tickets(ws) });
    if (id) qc.invalidateQueries({ queryKey: keys.ticket(ws, id) });
  };
  const invalidateMaster = () => {
    if (!ws) return;
    qc.invalidateQueries({ queryKey: keys.accounts(ws) });
    qc.invalidateQueries({ queryKey: keys.vendors(ws) });
    qc.invalidateQueries({ queryKey: keys.products(ws) });
    qc.invalidateQueries({ queryKey: keys.mailboxes(ws) });
  };
  const invalidateTaxonomy = () => {
    if (!ws) return;
    qc.invalidateQueries({ queryKey: keys.stakeholders(ws) });
    qc.invalidateQueries({ queryKey: keys.requestTypes(ws) });
    // Relabelling or re-ordering a stakeholder changes what the queue board
    // renders, so the views that read those labels have to refetch too.
    qc.invalidateQueries({ queryKey: keys.dashboard(ws) });
    qc.invalidateQueries({ queryKey: keys.tickets(ws) });
  };

  return {
    splitDetectedIssues: useMutation({
      mutationFn: ({ id, issue_indexes }: { id: string; issue_indexes: number[] }) =>
        serviceDeskApi.splitDetectedIssues(ws!, id, issue_indexes),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    changePendingWith: useMutation({
      mutationFn: ({ id, pending_with, note }: { id: string; pending_with: PendingWith; note?: string }) =>
        serviceDeskApi.changePendingWith(ws!, id, pending_with, note),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    updateTicket: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Partial<{ request_type: RequestType; product_id: string | null; account_id: string | null; assigned_owner_id: string | null; needs_triage: boolean }> }) =>
        serviceDeskApi.updateTicket(ws!, id, data),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    createManual: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createManual>[1]) => serviceDeskApi.createManual(ws!, data),
      onSuccess: () => invalidateTickets(),
    }),
    emailStakeholder: useMutation({
      mutationFn: ({ id, data }: { id: string; data: { to: string; subject: string; body: string; attachment_filenames?: string[]; move_ticket?: boolean } }) =>
        serviceDeskApi.emailStakeholder(ws!, id, data),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    convertToTask: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Parameters<typeof serviceDeskApi.convertToTask>[2] }) =>
        serviceDeskApi.convertToTask(ws!, id, data),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    updateSettings: useMutation({
      mutationFn: (patch: ServiceDeskSettingsPatch) => serviceDeskApi.updateSettings(ws!, patch),
      onSuccess: () => {
        if (ws) {
          qc.invalidateQueries({ queryKey: keys.settings(ws) });
          invalidateTickets();
        }
      },
    }),
    updateTemplate: useMutation({
      mutationFn: ({ key, subject, body }: { key: string; subject: string; body: string }) =>
        serviceDeskApi.updateTemplate(ws!, key, subject, body),
      onSuccess: () => {
        if (ws) qc.invalidateQueries({ queryKey: keys.templates(ws) });
      },
    }),
    createAccount: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createAccount>[1]) => serviceDeskApi.createAccount(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteAccount: useMutation({ mutationFn: (id: string) => serviceDeskApi.deleteAccount(ws!, id), onSuccess: invalidateMaster }),
    createVendor: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createVendor>[1]) => serviceDeskApi.createVendor(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteVendor: useMutation({ mutationFn: (id: string) => serviceDeskApi.deleteVendor(ws!, id), onSuccess: invalidateMaster }),
    createProduct: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createProduct>[1]) => serviceDeskApi.createProduct(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteProduct: useMutation({ mutationFn: (id: string) => serviceDeskApi.deleteProduct(ws!, id), onSuccess: invalidateMaster }),
    createMailbox: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createMailbox>[1]) => serviceDeskApi.createMailbox(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteMailbox: useMutation({ mutationFn: (id: string) => serviceDeskApi.deleteMailbox(ws!, id), onSuccess: invalidateMaster }),

    // Taxonomy. Editing a stakeholder relabels or re-orders live queue columns,
    // so the dashboard and ticket lists are invalidated alongside it.
    createStakeholder: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createStakeholder>[1]) =>
        serviceDeskApi.createStakeholder(ws!, data),
      onSuccess: invalidateTaxonomy,
    }),
    updateStakeholder: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Parameters<typeof serviceDeskApi.updateStakeholder>[2] }) =>
        serviceDeskApi.updateStakeholder(ws!, id, data),
      onSuccess: invalidateTaxonomy,
    }),
    deleteStakeholder: useMutation({
      mutationFn: (id: string) => serviceDeskApi.deleteStakeholder(ws!, id),
      onSuccess: invalidateTaxonomy,
    }),
    createRequestType: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createRequestType>[1]) =>
        serviceDeskApi.createRequestType(ws!, data),
      onSuccess: invalidateTaxonomy,
    }),
    updateRequestType: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Parameters<typeof serviceDeskApi.updateRequestType>[2] }) =>
        serviceDeskApi.updateRequestType(ws!, id, data),
      onSuccess: invalidateTaxonomy,
    }),
    deleteRequestType: useMutation({
      mutationFn: (id: string) => serviceDeskApi.deleteRequestType(ws!, id),
      onSuccess: invalidateTaxonomy,
    }),

    applyIndustryTemplate: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.applyIndustryTemplate>[1]) =>
        serviceDeskApi.applyIndustryTemplate(ws!, data),
      // Touches taxonomy, terminology (settings) and departments at once.
      onSuccess: () => {
        invalidateTaxonomy();
        invalidateMaster();
        if (ws) qc.invalidateQueries({ queryKey: keys.settings(ws) });
      },
    }),
  };
}
