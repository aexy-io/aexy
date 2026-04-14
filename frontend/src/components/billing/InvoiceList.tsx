"use client";

import { FileText, Download, ExternalLink, Loader2, CheckCircle, Clock, XCircle, Landmark, CreditCard } from "lucide-react";
import { useInvoices, formatCurrency } from "@/hooks/useBillingUsage";

interface InvoiceListProps {
  limit?: number;
  className?: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "paid":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 text-xs font-medium rounded-full">
          <CheckCircle className="h-3 w-3" />
          Paid
        </span>
      );
    case "open":
    case "draft":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-medium rounded-full">
          <Clock className="h-3 w-3" />
          {status === "open" ? "Pending" : "Draft"}
        </span>
      );
    case "uncollectible":
    case "void":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-xs font-medium rounded-full">
          <XCircle className="h-3 w-3" />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-1 bg-accent text-foreground text-xs font-medium rounded-full">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
  }
}

function getPaymentMethodBadge(method: string | undefined) {
  if (!method || method === "stripe") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium rounded-full">
        <CreditCard className="h-3 w-3" />
        Stripe
      </span>
    );
  }
  if (method === "bank_transfer") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-medium rounded-full">
        <Landmark className="h-3 w-3" />
        Bank Transfer
      </span>
    );
  }
  if (method === "manual") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-50 text-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400 text-xs font-medium rounded-full">
        Manual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-1 bg-accent text-foreground text-xs font-medium rounded-full">
      {method}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start || !end) return "-";
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function InvoiceList({ limit = 10, className = "" }: InvoiceListProps) {
  const { data: invoices, isLoading, error } = useInvoices(limit);

  if (isLoading) {
    return (
      <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Invoice History</h3>
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="h-4 w-24 bg-accent rounded" />
                <div className="h-5 w-16 bg-accent rounded-full" />
              </div>
              <div className="h-4 w-20 bg-accent rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Invoice History</h3>
        <p className="text-muted-foreground text-center py-8">Failed to load invoices</p>
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className={`bg-muted rounded-xl border border-border p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Invoice History</h3>
        <div className="text-center py-8">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No invoices yet</p>
          <p className="text-muted-foreground text-sm mt-1">
            Invoices will appear here after your first billing cycle
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-muted rounded-xl border border-border overflow-hidden ${className}`}>
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">Invoice History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-accent/50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Invoice
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Period
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Payment
              </th>
              <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Paid Date
              </th>
              <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="hover:bg-accent/30 transition">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent rounded-lg">
                      <FileText className="h-4 w-4 text-foreground" />
                    </div>
                    <span className="text-foreground font-medium">
                      {invoice.number || `INV-${invoice.id.slice(0, 8)}`}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-foreground">
                  {formatDateRange(invoice.period_start, invoice.period_end)}
                </td>
                <td className="px-6 py-4">{getStatusBadge(invoice.status)}</td>
                <td className="px-6 py-4">
                  <div>
                    {getPaymentMethodBadge(invoice.payment_method)}
                    {invoice.status === "paid" &&
                      invoice.payment_method === "bank_transfer" &&
                      invoice.bank_transfer_reference && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Ref: {invoice.bank_transfer_reference}
                        </p>
                      )}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-foreground font-medium">
                    {formatCurrency(invoice.total_cents, invoice.currency.toUpperCase())}
                  </span>
                </td>
                <td className="px-6 py-4 text-foreground">
                  {formatDate(invoice.paid_at)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {invoice.invoice_pdf && (
                      <a
                        href={invoice.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                        title="Download PDF"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                    {invoice.hosted_invoice_url && (
                      <a
                        href={invoice.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                        title="View Online"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default InvoiceList;
