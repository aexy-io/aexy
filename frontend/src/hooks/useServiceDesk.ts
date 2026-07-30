"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  serviceDeskApi,
  Partner,
  Insurer,
  LOB,
  Mailbox,
  PendingWith,
  RequestType,
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
  partners: (ws: string) => ["service-desk", "partners", ws] as const,
  insurers: (ws: string) => ["service-desk", "insurers", ws] as const,
  lobs: (ws: string) => ["service-desk", "lobs", ws] as const,
  mailboxes: (ws: string) => ["service-desk", "mailboxes", ws] as const,
  settings: (ws: string) => ["service-desk", "settings", ws] as const,
  templates: (ws: string) => ["service-desk", "templates", ws] as const,
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

export function usePartners() {
  const ws = useWs();
  return useQuery<Partner[]>({ queryKey: keys.partners(ws ?? ""), queryFn: () => serviceDeskApi.listPartners(ws!), enabled: !!ws });
}
export function useInsurers() {
  const ws = useWs();
  return useQuery<Insurer[]>({ queryKey: keys.insurers(ws ?? ""), queryFn: () => serviceDeskApi.listInsurers(ws!), enabled: !!ws });
}
export function useLobs() {
  const ws = useWs();
  return useQuery<LOB[]>({ queryKey: keys.lobs(ws ?? ""), queryFn: () => serviceDeskApi.listLobs(ws!), enabled: !!ws });
}
export function useMailboxes() {
  const ws = useWs();
  return useQuery<Mailbox[]>({ queryKey: keys.mailboxes(ws ?? ""), queryFn: () => serviceDeskApi.listMailboxes(ws!), enabled: !!ws });
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
    qc.invalidateQueries({ queryKey: keys.partners(ws) });
    qc.invalidateQueries({ queryKey: keys.insurers(ws) });
    qc.invalidateQueries({ queryKey: keys.lobs(ws) });
    qc.invalidateQueries({ queryKey: keys.mailboxes(ws) });
  };

  return {
    changePendingWith: useMutation({
      mutationFn: ({ id, pending_with, note }: { id: string; pending_with: PendingWith; note?: string }) =>
        serviceDeskApi.changePendingWith(ws!, id, pending_with, note),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    updateTicket: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Partial<{ request_type: RequestType; lob_id: string | null; partner_id: string | null; assigned_kam_id: string | null; needs_triage: boolean }> }) =>
        serviceDeskApi.updateTicket(ws!, id, data),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    createManual: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createManual>[1]) => serviceDeskApi.createManual(ws!, data),
      onSuccess: () => invalidateTickets(),
    }),
    convertToTask: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Parameters<typeof serviceDeskApi.convertToTask>[2] }) =>
        serviceDeskApi.convertToTask(ws!, id, data),
      onSuccess: (_r, v) => invalidateTickets(v.id),
    }),
    updateSettings: useMutation({
      mutationFn: (patch: ServiceDeskSettingsPatch) => serviceDeskApi.updateSettings(ws!, patch),
      onSuccess: () => {
        if (ws) qc.invalidateQueries({ queryKey: keys.settings(ws) });
      },
    }),
    updateTemplate: useMutation({
      mutationFn: ({ key, subject, body }: { key: string; subject: string; body: string }) =>
        serviceDeskApi.updateTemplate(ws!, key, subject, body),
      onSuccess: () => {
        if (ws) qc.invalidateQueries({ queryKey: keys.templates(ws) });
      },
    }),
    createPartner: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createPartner>[1]) => serviceDeskApi.createPartner(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deletePartner: useMutation({ mutationFn: (id: string) => serviceDeskApi.deletePartner(ws!, id), onSuccess: invalidateMaster }),
    createInsurer: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createInsurer>[1]) => serviceDeskApi.createInsurer(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteInsurer: useMutation({ mutationFn: (id: string) => serviceDeskApi.deleteInsurer(ws!, id), onSuccess: invalidateMaster }),
    createLob: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createLob>[1]) => serviceDeskApi.createLob(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteLob: useMutation({ mutationFn: (id: string) => serviceDeskApi.deleteLob(ws!, id), onSuccess: invalidateMaster }),
    createMailbox: useMutation({
      mutationFn: (data: Parameters<typeof serviceDeskApi.createMailbox>[1]) => serviceDeskApi.createMailbox(ws!, data),
      onSuccess: invalidateMaster,
    }),
    deleteMailbox: useMutation({ mutationFn: (id: string) => serviceDeskApi.deleteMailbox(ws!, id), onSuccess: invalidateMaster }),
  };
}
