"use client";

import { useState, useRef } from "react";
import {
  Upload,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Users,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useOutreachSequences } from "@/hooks/useGTM";
import { gtmApi, ImportRowResult, BulkImportResponse } from "@/lib/api";

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  created: {
    bg: "bg-emerald-500/20",
    text: "text-emerald-400",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  duplicate: {
    bg: "bg-amber-500/20",
    text: "text-amber-400",
    icon: <Copy className="w-3.5 h-3.5" />,
  },
  invalid_email: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  error: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.error;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.icon}
      {status.replace("_", " ")}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

export default function ImportPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [csvContent, setCsvContent] = useState("");
  const [verifyEmails, setVerifyEmails] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [sequenceId, setSequenceId] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<BulkImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { sequences } = useOutreachSequences(workspaceId, {
    status: "active",
    per_page: 100,
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
    };
    reader.readAsText(file);

    // Reset file input so the same file can be uploaded again
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!workspaceId || !csvContent.trim()) return;

    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      const response = await gtmApi.import.run(workspaceId, {
        csv_content: csvContent,
        verify_emails: verifyEmails,
        skip_duplicates: skipDuplicates,
        sequence_id: sequenceId || undefined,
      });
      setResult(response);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            "Import failed. Please check your CSV format and try again.";
      setError(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setCsvContent("");
    setResult(null);
    setError(null);
    setSequenceId("");
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bulk Import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import contacts from CSV data. Paste your CSV content or upload a file.
        </p>
      </div>

      {/* Import form */}
      {!result && (
        <div className="space-y-6">
          {/* CSV Input Area */}
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-foreground">
                CSV Content
              </label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted/50 text-foreground hover:bg-muted rounded-lg text-xs font-medium transition-colors border border-border"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder={"email,first_name,last_name,company\njohn@example.com,John,Doe,Acme Inc\njane@example.com,Jane,Smith,Widget Co"}
              rows={10}
              className="w-full bg-black/30 border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
            />
            {csvContent && (
              <p className="text-xs text-muted-foreground mt-2">
                {csvContent.split("\n").filter((l) => l.trim()).length} lines
                detected (including header)
              </p>
            )}
          </div>

          {/* Options */}
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <h3 className="text-sm font-medium text-foreground mb-4">
              Import Options
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Verify Emails */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyEmails}
                  onChange={(e) => setVerifyEmails(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-muted/50 text-indigo-500 focus:ring-indigo-500/50 focus:ring-offset-0"
                />
                <div>
                  <div className="text-sm text-foreground">Verify Emails</div>
                  <div className="text-xs text-muted-foreground">
                    Check email format and deliverability
                  </div>
                </div>
              </label>

              {/* Skip Duplicates */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-muted/50 text-indigo-500 focus:ring-indigo-500/50 focus:ring-offset-0"
                />
                <div>
                  <div className="text-sm text-foreground">Skip Duplicates</div>
                  <div className="text-xs text-muted-foreground">
                    Skip contacts that already exist
                  </div>
                </div>
              </label>

              {/* Sequence Selector */}
              <div>
                <div className="text-sm text-foreground mb-1">
                  Enroll in Sequence
                </div>
                <select
                  value={sequenceId}
                  onChange={(e) => setSequenceId(e.target.value)}
                  className="w-full bg-black/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none"
                >
                  <option value="">None (import only)</option>
                  {sequences.map((seq) => (
                    <option key={seq.id} value={seq.id}>
                      {seq.name}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-muted-foreground mt-1">
                  Optionally auto-enroll imported contacts
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium text-red-400">
                  Import Error
                </div>
                <div className="text-sm text-red-300 mt-1">{error}</div>
              </div>
            </div>
          )}

          {/* Import Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={!csvContent.trim() || isImporting || !workspaceId}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import Contacts
                </>
              )}
            </button>
            {csvContent && (
              <button
                onClick={handleReset}
                className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary Stats Bar */}
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-medium text-foreground">
                Import Complete
              </h3>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
              <SummaryCard
                label="Total"
                value={result.total_rows}
                color="text-foreground"
              />
              <SummaryCard
                label="Created"
                value={result.created}
                color="text-emerald-400"
              />
              <SummaryCard
                label="Duplicates"
                value={result.duplicates}
                color="text-amber-400"
              />
              <SummaryCard
                label="Invalid"
                value={result.invalid_emails}
                color="text-red-400"
              />
              <SummaryCard
                label="Errors"
                value={result.errors}
                color="text-red-400"
              />
              <SummaryCard
                label="Skipped"
                value={result.skipped}
                color="text-muted-foreground"
              />
              <SummaryCard
                label="Enrolled"
                value={result.enrolled}
                color="text-blue-400"
              />
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                      Row
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                      Email
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                      Status
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                      Record ID
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {result.rows.map((row: ImportRowResult) => (
                    <tr
                      key={row.row}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {row.row}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground font-mono">
                        {row.email}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                        {row.record_id
                          ? row.record_id.substring(0, 8) + "..."
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {row.duplicate_of
                          ? `Duplicate of ${row.duplicate_of.substring(0, 8)}...`
                          : row.error || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.rows.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No rows processed</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import More
            </button>
          </div>
        </div>
      )}

      {/* Empty state when no CSV content */}
      {!csvContent && !result && (
        <div className="bg-muted/50 border border-border border-dashed rounded-xl p-12 text-center">
          <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Paste or upload a CSV
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Your CSV should include an &quot;email&quot; column at minimum.
            Additional columns like first_name, last_name, and company will be
            used if present.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload CSV File
          </button>
        </div>
      )}
    </div>
  );
}
