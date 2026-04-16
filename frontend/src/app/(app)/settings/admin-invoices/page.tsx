"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Receipt,
  Plus,
  Loader2,
  Building2,
  CheckCircle,
  Clock,
  XCircle,
  Ban,
  FileText,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";

interface AdminInvoice {
  id: string;
  workspace_id: string | null;
  number: string | null;
  status: string;
  total_cents: number;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  description: string | null;
  due_date: string | null;
  payment_method: string;
  bank_transfer_reference: string | null;
  manual_payment_note: string | null;
  marked_paid_by: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string | null;
  paid_at: string | null;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
}

// API helpers
const adminInvoiceApi = {
  list: async (params?: Record<string, any>) => {
    const response = await api.get("/platform-admin/invoices", { params });
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post("/platform-admin/invoices", data);
    return response.data;
  },
  markPaid: async (id: string, data: any) => {
    const response = await api.post(
      `/platform-admin/invoices/${id}/mark-paid`,
      data
    );
    return response.data;
  },
  void: async (id: string) => {
    const response = await api.post(`/platform-admin/invoices/${id}/void`);
    return response.data;
  },
  generateFromUsage: async (workspaceId: string) => {
    const response = await api.post(
      `/platform-admin/workspaces/${workspaceId}/generate-invoice`
    );
    return response.data;
  },
};

function formatCurrency(cents: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case "paid":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 text-xs font-medium rounded-full">
          <CheckCircle className="h-3 w-3" />
          Paid
        </span>
      );
    case "open":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-xs font-medium rounded-full">
          <Clock className="h-3 w-3" />
          Open
        </span>
      );
    case "void":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 text-xs font-medium rounded-full">
          <XCircle className="h-3 w-3" />
          Void
        </span>
      );
    case "draft":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-500/10 text-zinc-400 text-xs font-medium rounded-full">
          <FileText className="h-3 w-3" />
          Draft
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 bg-accent text-foreground text-xs font-medium rounded-full">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
  }
}

function getPaymentMethodBadge(method: string) {
  switch (method) {
    case "stripe":
      return (
        <span className="inline-flex items-center px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs font-medium rounded-full">
          Stripe
        </span>
      );
    case "bank_transfer":
      return (
        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-full">
          Bank Transfer
        </span>
      );
    case "manual":
      return (
        <span className="inline-flex items-center px-2 py-0.5 bg-zinc-500/10 text-zinc-400 text-xs font-medium rounded-full">
          Manual
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 bg-accent text-foreground text-xs font-medium rounded-full">
          {method}
        </span>
      );
  }
}

export default function AdminInvoicesPage() {
  const queryClient = useQueryClient();

  // Create invoice form state
  const [createForm, setCreateForm] = useState({
    workspace_id: "",
    amount_dollars: "",
    description: "",
    due_date: "",
    payment_method: "stripe",
  });

  // Generate from usage state
  const [generateWorkspaceId, setGenerateWorkspaceId] = useState("");

  // Mark paid inline state
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [markPaidForm, setMarkPaidForm] = useState({
    bank_transfer_reference: "",
    note: "",
  });

  const {
    data: invoices,
    isLoading,
    error,
  } = useQuery<AdminInvoice[]>({
    queryKey: ["admin-invoices"],
    queryFn: () => adminInvoiceApi.list(),
    retry: 1,
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => adminInvoiceApi.create(data),
    onSuccess: () => {
      toast.success("Invoice created successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      setCreateForm({
        workspace_id: "",
        amount_dollars: "",
        description: "",
        due_date: "",
        payment_method: "stripe",
      });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to create invoice"
      );
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      adminInvoiceApi.markPaid(id, data),
    onSuccess: () => {
      toast.success("Invoice marked as paid");
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      setMarkingPaidId(null);
      setMarkPaidForm({ bank_transfer_reference: "", note: "" });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to mark invoice as paid"
      );
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => adminInvoiceApi.void(id),
    onSuccess: () => {
      toast.success("Invoice voided");
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to void invoice"
      );
    },
  });

  const generateMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      adminInvoiceApi.generateFromUsage(workspaceId),
    onSuccess: () => {
      toast.success("Invoice generated from usage");
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      setGenerateWorkspaceId("");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to generate invoice from usage"
      );
    },
  });

  const handleCreate = () => {
    if (!createForm.workspace_id || !createForm.amount_dollars) return;
    const amountCents = Math.round(parseFloat(createForm.amount_dollars) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    createMutation.mutate({
      workspace_id: createForm.workspace_id,
      amount_cents: amountCents,
      description: createForm.description || undefined,
      due_date: createForm.due_date || undefined,
      payment_method: createForm.payment_method,
    });
  };

  const handleMarkPaid = (invoiceId: string) => {
    markPaidMutation.mutate({
      id: invoiceId,
      data: {
        bank_transfer_reference:
          markPaidForm.bank_transfer_reference || undefined,
        note: markPaidForm.note || undefined,
      },
    });
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Invoices</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Platform admin access required
          </p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">
          You don&apos;t have permission to access this page. Only platform
          admins can manage invoices.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Invoices</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create, manage, and reconcile invoices for B2B customers
        </p>
      </div>

      {/* Create Invoice */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create Invoice
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Workspace ID
              </label>
              <input
                type="text"
                value={createForm.workspace_id}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    workspace_id: e.target.value,
                  }))
                }
                placeholder="Enter workspace UUID"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Amount (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={createForm.amount_dollars}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    amount_dollars: e.target.value,
                  }))
                }
                placeholder="e.g. 499.00"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Description
            </label>
            <textarea
              value={createForm.description}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Invoice description (optional)"
              rows={2}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Due Date
              </label>
              <input
                type="date"
                value={createForm.due_date}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    due_date: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Payment Method
              </label>
              <select
                value={createForm.payment_method}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    payment_method: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
              >
                <option value="stripe">Stripe</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={
              !createForm.workspace_id ||
              !createForm.amount_dollars ||
              createMutation.isPending
            }
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create Invoice
          </button>
        </div>
      </div>

      {/* Generate from Usage */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Generate Invoice from Usage
        </h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              Workspace ID
            </label>
            <input
              type="text"
              value={generateWorkspaceId}
              onChange={(e) => setGenerateWorkspaceId(e.target.value)}
              placeholder="Enter workspace UUID"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={() => generateMutation.mutate(generateWorkspaceId)}
            disabled={!generateWorkspaceId || generateMutation.isPending}
            className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            Generate from Usage
          </button>
        </div>
      </div>

      {/* Invoice List */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          All Invoices
        </h2>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading invoices...
          </div>
        ) : !invoices?.length ? (
          <p className="text-sm text-muted-foreground">No invoices found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    ID
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Workspace
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-3 py-3">
                      <span className="text-sm font-mono text-foreground">
                        {invoice.number ||
                          `INV-${invoice.id.slice(0, 8)}`}
                      </span>
                      {invoice.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-48">
                          {invoice.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-mono text-foreground">
                          {invoice.workspace_id
                            ? `${invoice.workspace_id.slice(0, 8)}...`
                            : "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(
                          invoice.total_cents,
                          invoice.currency
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="px-3 py-3">
                      {getPaymentMethodBadge(invoice.payment_method)}
                      {invoice.status === "paid" &&
                        invoice.payment_method === "bank_transfer" &&
                        invoice.bank_transfer_reference && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Ref: {invoice.bank_transfer_reference}
                          </p>
                        )}
                    </td>
                    <td className="px-3 py-3 text-sm text-foreground">
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {invoice.status === "open" && (
                          <>
                            <button
                              onClick={() => {
                                if (markingPaidId === invoice.id) {
                                  setMarkingPaidId(null);
                                } else {
                                  setMarkingPaidId(invoice.id);
                                  setMarkPaidForm({
                                    bank_transfer_reference: "",
                                    note: "",
                                  });
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-lg transition"
                            >
                              <CheckCircle className="h-3.5 w-3.5 inline mr-1" />
                              Mark Paid
                            </button>
                            <button
                              onClick={() => voidMutation.mutate(invoice.id)}
                              disabled={voidMutation.isPending}
                              className="px-2.5 py-1 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition"
                            >
                              <Ban className="h-3.5 w-3.5 inline mr-1" />
                              Void
                            </button>
                          </>
                        )}
                      </div>

                      {/* Mark Paid Inline Form */}
                      {markingPaidId === invoice.id && (
                        <div className="mt-2 p-3 bg-background border border-border rounded-lg space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              Bank Transfer Reference
                            </label>
                            <input
                              type="text"
                              value={markPaidForm.bank_transfer_reference}
                              onChange={(e) =>
                                setMarkPaidForm((prev) => ({
                                  ...prev,
                                  bank_transfer_reference: e.target.value,
                                }))
                              }
                              placeholder="e.g. Wire ref #12345"
                              className="w-full px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted-foreground"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              Note
                            </label>
                            <input
                              type="text"
                              value={markPaidForm.note}
                              onChange={(e) =>
                                setMarkPaidForm((prev) => ({
                                  ...prev,
                                  note: e.target.value,
                                }))
                              }
                              placeholder="Optional note"
                              className="w-full px-2 py-1.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted-foreground"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleMarkPaid(invoice.id)}
                              disabled={markPaidMutation.isPending}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition disabled:opacity-50 flex items-center gap-1"
                            >
                              {markPaidMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3 w-3" />
                              )}
                              Confirm
                            </button>
                            <button
                              onClick={() => setMarkingPaidId(null)}
                              className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs rounded transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
