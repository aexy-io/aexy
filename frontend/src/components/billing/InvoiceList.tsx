"use client";

import { FileText, Download, ExternalLink, Loader2, CheckCircle, Clock, XCircle } from "lucide-react";
import { useInvoices, formatCurrency } from "@/hooks/useBillingUsage";

interface InvoiceListProps {
  limit?: number;
  className?: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "paid":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-900/30 text-green-400 text-xs font-medium rounded-full">
          <CheckCircle className="h-3 w-3" />
          Paid
        </span>
      );
    case "open":
    case "draft":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-900/30 text-amber-400 text-xs font-medium rounded-full">
          <Clock className="h-3 w-3" />
          {status === "open" ? "Pending" : "Draft"}
        </span>
      );
    case "uncollectible":
    case "void":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-900/30 text-red-400 text-xs font-medium rounded-full">
          <XCircle className="h-3 w-3" />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-1 bg-slate-700 text-slate-300 text-xs font-medium rounded-full">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
  }
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
      <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-white mb-4">Invoice History</h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-white mb-4">Invoice History</h3>
        <p className="text-slate-400 text-center py-8">Failed to load invoices</p>
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className={`bg-slate-800 rounded-xl border border-slate-700 p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-white mb-4">Invoice History</h3>
        <div className="text-center py-8">
          <FileText className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No invoices yet</p>
          <p className="text-slate-500 text-sm mt-1">
            Invoices will appear here after your first billing cycle
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-800 rounded-xl border border-slate-700 overflow-hidden ${className}`}>
      <div className="p-6 border-b border-slate-700">
        <h3 className="text-lg font-semibold text-white">Invoice History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Invoice
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Period
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Amount
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Paid Date
              </th>
              <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="hover:bg-slate-700/30 transition">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-700 rounded-lg">
                      <FileText className="h-4 w-4 text-slate-300" />
                    </div>
                    <span className="text-white font-medium">
                      {invoice.number || `INV-${invoice.id.slice(0, 8)}`}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-300">
                  {formatDateRange(invoice.period_start, invoice.period_end)}
                </td>
                <td className="px-6 py-4">{getStatusBadge(invoice.status)}</td>
                <td className="px-6 py-4 text-right">
                  <span className="text-white font-medium">
                    {formatCurrency(invoice.amount_due, invoice.currency.toUpperCase())}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-300">
                  {formatDate(invoice.paid_at)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {invoice.invoice_pdf && (
                      <a
                        href={invoice.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
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
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
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
