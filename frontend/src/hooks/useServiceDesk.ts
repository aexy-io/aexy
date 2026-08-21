"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { getApiErrorMessage, saveBlob } from "@/lib/utils";
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
  AIAccuracy,
  DigestPreview,
  ServiceDeskTicket,
  TicketQuery,
  ServiceDeskTicketDetail,
} from "@/lib/service-desk-api";

/**
 * A mutation that reports its own failure.
 *
 * Every mutation here used to declare `onSuccess` and nothing else, and the
 * settings page drives them with bare `mutateAsync` calls. A rejection
 * therefore reached no one: adding a mailbox for an address the workspace's
 * Google integration isn't connected as returned a 422 explaining exactly
 * that, the input kept its text, and the screen said nothing at all.
 *
 * The API's `detail` is the message worth showing — it is written for the
 * person who hit it — so it is preferred over the fallback.
 */
function useDeskMutation<TData, TVariables>(
  options: UseMutationOptions<TData, unknown, TVariables>,
) {
  return useMutation({
    ...options,
    onError: (error, variables, onMutateResult, context) => {
      toast.error(getApiErrorMessage(error, "Something went wrong. Please try again."));
      options.onError?.(error, variables, onMutateResult, context);
    },
  });
}

/**
 * Rewrite a blob-typed error body in place as the parsed JSON it really is.
 *
 * Only needed for responses fetched with `responseType: "blob"`. Silent when the
 * body is not JSON: the caller still throws, and the generic message stands.
 */
async function revealBlobError(error: unknown): Promise<void> {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (!response || !(response.data instanceof Blob)) return;
  try {
    response.data = JSON.parse(await response.data.text());
  } catch {
    // Not JSON — nothing to reveal.
  }
}

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

export function useServiceDeskDashboard(params?: { limit?: number; offset?: number }) {
  const ws = useWs();
  return useQuery<ServiceDeskDashboard>({
    // Paging is part of the key, or turning the page would serve the previous
    // one from cache.
    queryKey: [...keys.dashboard(ws ?? ""), params ?? {}],
    queryFn: () => serviceDeskApi.getDashboard(ws!, params),
    enabled: !!ws,
  });
}

export function useServiceDeskTickets(query?: TicketQuery) {
  const ws = useWs();
  return useQuery<ServiceDeskTicket[]>({
    // The filters are part of the key, or every filter change would serve the
    // previous one's rows from cache until the refetch landed.
    queryKey: [...keys.tickets(ws ?? ""), query ?? {}],
    queryFn: () => serviceDeskApi.listTickets(ws!, query),
    enabled: !!ws,
  });
}

/** What the digest would say right now, and who would receive it. */
export function useDigestPreview() {
  const ws = useWs();
  return useQuery<DigestPreview>({
    queryKey: ["service-desk", "digest-preview", ws ?? ""],
    queryFn: () => serviceDeskApi.previewDigest(ws!),
    enabled: !!ws,
  });
}

/** Whether the classifier is worth trusting on this desk's mail. */
export function useAiAccuracy(days = 90) {
  const ws = useWs();
  return useQuery<AIAccuracy>({
    queryKey: ["service-desk", "ai-accuracy", ws ?? "", days],
    queryFn: () => serviceDeskApi.getAiAccuracy(ws!, days),
    enabled: !!ws,
  });
}

/** How many tickets match — what the page is one page of. */
export function useServiceDeskTicketCount(query?: TicketQuery) {
  const ws = useWs();
  return useQuery<{ total: number }>({
    queryKey: [...keys.tickets(ws ?? ""), "count", query ?? {}],
    queryFn: () => serviceDeskApi.countTickets(ws!, query),
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
    /**
     * Buckets a ticket may be *moved into*.
     *
     * Retiring a bucket only ever hid it from new work in principle — nothing
     * filtered `is_active`, so a retired bucket stayed in the hand-off picker and
     * a ticket could still be parked in one. Harmless while nobody could retire
     * anything; the settings editor makes it reachable, so the filter has to be
     * real. Reads stay on the unfiltered list: a ticket already sitting in a
     * retired bucket still has to render its own label.
     */
    assignableStakeholders: orderedStakeholders.filter((s) => s.is_active),
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
    /**
     * Hand a ticket's own attachment to the person reading it.
     *
     * A mutation rather than a query: it is an action with a side effect on the
     * browser (a file lands in Downloads), it must not be cached, and the shared
     * `onError` toast is exactly what a failed fetch needs — the alternative was
     * a filename rendered as dead text.
     */
    downloadAttachment: useDeskMutation({
      mutationFn: async ({ id, index, filename }: { id: string; index: number; filename: string }) => {
        let blob: Blob;
        try {
          blob = await serviceDeskApi.downloadAttachment(ws!, id, index);
        } catch (error) {
          // Asking for a blob makes axios hand back the *error* body as a blob
          // too, so `detail` is unreadable and every failure would have read
          // "Something went wrong". These failures are the ones worth quoting —
          // an expired Gmail token, a file the mailbox no longer holds — so the
          // body is decoded back into the shape `getApiErrorMessage` expects.
          await revealBlobError(error);
          throw error;
        }
        saveBlob(blob, filename);
      },
    }),
    splitDetectedIssues: useDeskMutation({
      mutationFn: ({ id, issue_indexes }: { id: string; issue_indexes: number[] }) =>
        serviceDeskApi.splitDetectedIssues(ws!, id, issue_indexes),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    changePendingWith: useDeskMutation({
      mutationFn: ({ id, pending_with, note }: { id: string; pending_with: PendingWith; note?: string }) =>
        serviceDeskApi.changePendingWith(ws!, id, pending_with, note),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    updateTicket: useDeskMutation({
      mutationFn: ({ id, data }: { id: string; data: Partial<{ request_type: RequestType; product_id: string | null; account_id: string | null; assigned_owner_id: string | null; needs_triage: boolean }> }) =>
        serviceDeskApi.updateTicket(ws!, id, data),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    createManual: useDeskMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createManual>[1]) => serviceDeskApi.createManual(ws!, data),
      onSuccess: () => invalidateTickets(),
    }),
    emailStakeholder: useDeskMutation({
      mutationFn: ({ id, data }: { id: string; data: { to: string; cc?: string[]; subject: string; body: string; attachment_filenames?: string[]; move_ticket?: boolean } }) =>
        serviceDeskApi.emailStakeholder(ws!, id, data),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    convertToTask: useDeskMutation({
      mutationFn: ({ id, data }: { id: string; data: Parameters<typeof serviceDeskApi.convertToTask>[2] }) =>
        serviceDeskApi.convertToTask(ws!, id, data),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    updateSettings: useDeskMutation({
      mutationFn: (patch: ServiceDeskSettingsPatch) => serviceDeskApi.updateSettings(ws!, patch),
      onSuccess: () => {
        if (ws) {
          qc.invalidateQueries({ queryKey: keys.settings(ws) });
          invalidateTickets();
        }
      },
    }),
    updateTemplate: useDeskMutation({
      mutationFn: ({ key, subject, body }: { key: string; subject: string; body: string }) =>
        serviceDeskApi.updateTemplate(ws!, key, subject, body),
      onSuccess: () => {
        if (ws) qc.invalidateQueries({ queryKey: keys.templates(ws) });
      },
    }),
    createAccount: useDeskMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createAccount>[1]) => serviceDeskApi.createAccount(ws!, data),
      onSuccess: invalidateMaster,
    }),
    updateAccount: useDeskMutation({
      mutationFn: ({ id, data }: { id: string; data: Parameters<typeof serviceDeskApi.updateAccount>[2] }) =>
        serviceDeskApi.updateAccount(ws!, id, data),
      onSuccess: invalidateMaster,
    }),
    deleteAccount: useDeskMutation({ mutationFn: (id: string) => serviceDeskApi.deleteAccount(ws!, id), onSuccess: invalidateMaster }),
    createVendor: useDeskMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createVendor>[1]) => serviceDeskApi.createVendor(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteVendor: useDeskMutation({ mutationFn: (id: string) => serviceDeskApi.deleteVendor(ws!, id), onSuccess: invalidateMaster }),
    createProduct: useDeskMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createProduct>[1]) => serviceDeskApi.createProduct(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteProduct: useDeskMutation({ mutationFn: (id: string) => serviceDeskApi.deleteProduct(ws!, id), onSuccess: invalidateMaster }),
    createMailbox: useDeskMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createMailbox>[1]) => serviceDeskApi.createMailbox(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteMailbox: useDeskMutation({ mutationFn: (id: string) => serviceDeskApi.deleteMailbox(ws!, id), onSuccess: invalidateMaster }),

    // Taxonomy. Editing a stakeholder relabels or re-orders live queue columns,
    // so the dashboard and ticket lists are invalidated alongside it.
    createStakeholder: useDeskMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createStakeholder>[1]) =>
        serviceDeskApi.createStakeholder(ws!, data),
      onSuccess: invalidateTaxonomy,
    }),
    updateStakeholder: useDeskMutation({
      mutationFn: ({ id, data }: { id: string; data: Parameters<typeof serviceDeskApi.updateStakeholder>[2] }) =>
        serviceDeskApi.updateStakeholder(ws!, id, data),
      onSuccess: invalidateTaxonomy,
    }),
    deleteStakeholder: useDeskMutation({
      mutationFn: (id: string) => serviceDeskApi.deleteStakeholder(ws!, id),
      onSuccess: invalidateTaxonomy,
    }),
    createRequestType: useDeskMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createRequestType>[1]) =>
        serviceDeskApi.createRequestType(ws!, data),
      onSuccess: invalidateTaxonomy,
    }),
    updateRequestType: useDeskMutation({
      mutationFn: ({ id, data }: { id: string; data: Parameters<typeof serviceDeskApi.updateRequestType>[2] }) =>
        serviceDeskApi.updateRequestType(ws!, id, data),
      onSuccess: invalidateTaxonomy,
    }),
    deleteRequestType: useDeskMutation({
      mutationFn: (id: string) => serviceDeskApi.deleteRequestType(ws!, id),
      onSuccess: invalidateTaxonomy,
    }),

    applyIndustryTemplate: useDeskMutation({
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
