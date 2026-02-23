"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Search,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gtmApi, SuppressionEntry, ComplianceAuditEntry, SendPermissionCheck } from "@/lib/api";

type Tab = "suppression" | "audit" | "check";

export default function CompliancePage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>("suppression");
  const [suppressionPage, setSuppressionPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [checkEmail, setCheckEmail] = useState("");
  const [checkResult, setCheckResult] = useState<SendPermissionCheck | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addReason, setAddReason] = useState("manual");

  // Suppression list query
  const { data: suppressionData, isLoading: suppressionLoading } = useQuery({
    queryKey: ["gtmSuppression", workspaceId, suppressionPage],
    queryFn: () => gtmApi.compliance.listSuppression(workspaceId!, { page: suppressionPage, per_page: 25 }),
    enabled: !!workspaceId && activeTab === "suppression",
  });

  // Audit log query
  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["gtmAudit", workspaceId, auditPage],
    queryFn: () => gtmApi.compliance.auditLog(workspaceId!, { page: auditPage, per_page: 25 }),
    enabled: !!workspaceId && activeTab === "audit",
  });

  // Add to suppression
  const addMutation = useMutation({
    mutationFn: (data: { email: string; reason: string; source: string }) =>
      gtmApi.compliance.addSuppression(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gtmSuppression", workspaceId] });
      toast.success("Added to suppression list");
      setAddEmail("");
    },
    onError: () => toast.error("Failed to add to suppression list"),
  });

  // Remove from suppression
  const removeMutation = useMutation({
    mutationFn: (email: string) => gtmApi.compliance.removeSuppression(workspaceId!, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gtmSuppression", workspaceId] });
      toast.success("Removed from suppression list");
    },
    onError: () => toast.error("Failed to remove from suppression list"),
  });

  const handleCheck = async () => {
    if (!checkEmail.trim() || !workspaceId) return;
    setIsChecking(true);
    try {
      const result = await gtmApi.compliance.checkSend(workspaceId, checkEmail.trim());
      setCheckResult(result);
    } catch {
      toast.error("Failed to check send permission");
    } finally {
      setIsChecking(false);
    }
  };

  const handleAdd = () => {
    if (!addEmail.trim()) return;
    addMutation.mutate({ email: addEmail.trim(), reason: addReason, source: "manual" });
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "suppression", label: "Suppression List", icon: <XCircle className="w-4 h-4" /> },
    { key: "audit", label: "Audit Log", icon: <FileText className="w-4 h-4" /> },
    { key: "check", label: "Send Check", icon: <Search className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
              Compliance
            </h1>
            <p className="text-zinc-400 mt-1">
              GDPR, CAN-SPAM, and CASL compliance infrastructure. Pre-send checks, suppression lists, and audit trails.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 border border-white/10 rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Suppression Tab */}
        {activeTab === "suppression" && (
          <div>
            {/* Add form */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-400 mb-1">Email Address</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div className="w-40">
                <label className="block text-xs font-medium text-zinc-400 mb-1">Reason</label>
                <select
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="manual">Manual</option>
                  <option value="unsubscribe">Unsubscribe</option>
                  <option value="bounce">Bounce</option>
                  <option value="complaint">Complaint</option>
                  <option value="legal">Legal</option>
                </select>
              </div>
              <button
                onClick={handleAdd}
                disabled={!addEmail.trim() || addMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            {/* Suppression table */}
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Email</th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Domain</th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Reason</th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Source</th>
                    <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Added</th>
                    <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(suppressionData?.entries || []).map((entry: SuppressionEntry) => (
                    <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-3 text-sm text-white">{entry.email}</td>
                      <td className="px-6 py-3 text-sm text-zinc-400">{entry.domain || "—"}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                          {entry.reason}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-zinc-400">{entry.source}</td>
                      <td className="px-6 py-3 text-sm text-zinc-500">
                        {new Date(entry.added_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => removeMutation.mutate(entry.email)}
                          className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {suppressionLoading && (
                <div className="px-6 py-12 text-center">
                  <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
                </div>
              )}
              {!suppressionLoading && (suppressionData?.entries || []).length === 0 && (
                <div className="px-6 py-12 text-center text-zinc-500">
                  No suppressed contacts. This is where unsubscribes, bounces, and complaints are tracked.
                </div>
              )}
              {(suppressionData?.total || 0) > 25 && (
                <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    {suppressionData?.total} total entries
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setSuppressionPage((p) => Math.max(1, p - 1))} disabled={suppressionPage <= 1} className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors">
                      <ChevronLeft className="w-4 h-4 text-zinc-400" />
                    </button>
                    <button onClick={() => setSuppressionPage((p) => p + 1)} disabled={suppressionPage >= Math.ceil((suppressionData?.total || 0) / 25)} className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors">
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === "audit" && (
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Action</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Reason</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Jurisdiction</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(auditData?.entries || []).map((entry: ComplianceAuditEntry) => {
                  const isBlock = entry.action.includes("blocked");
                  const isApprove = entry.action.includes("approved");
                  return (
                    <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-3 text-sm text-white">{entry.email}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                          isBlock ? "bg-red-500/20 text-red-400 border-red-500/30" :
                          isApprove ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                          "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
                        }`}>
                          {isBlock ? <XCircle className="w-3 h-3" /> : isApprove ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-zinc-400">{entry.reason || "—"}</td>
                      <td className="px-6 py-3 text-sm text-zinc-400">{entry.jurisdiction || "—"}</td>
                      <td className="px-6 py-3 text-sm text-zinc-500">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {auditLoading && (
              <div className="px-6 py-12 text-center">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
              </div>
            )}
            {!auditLoading && (auditData?.entries || []).length === 0 && (
              <div className="px-6 py-12 text-center text-zinc-500">
                No audit entries yet. All send decisions and compliance actions are logged here.
              </div>
            )}
          </div>
        )}

        {/* Send Check Tab */}
        {activeTab === "check" && (
          <div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Pre-Send Compliance Check</h3>
              <p className="text-sm text-zinc-400 mb-4">
                Check if an email address passes all compliance checks before sending.
              </p>
              <div className="flex gap-3">
                <input
                  type="email"
                  value={checkEmail}
                  onChange={(e) => setCheckEmail(e.target.value)}
                  placeholder="email@example.com"
                  onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-indigo-500/50"
                />
                <button
                  onClick={handleCheck}
                  disabled={!checkEmail.trim() || isChecking}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Check
                </button>
              </div>
            </div>

            {checkResult && (
              <div className={`bg-white/5 border rounded-xl p-6 ${
                checkResult.allowed ? "border-emerald-500/30" : "border-red-500/30"
              }`}>
                <div className="flex items-center gap-3 mb-4">
                  {checkResult.allowed ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400" />
                  )}
                  <div>
                    <h3 className={`text-lg font-semibold ${checkResult.allowed ? "text-emerald-400" : "text-red-400"}`}>
                      {checkResult.allowed ? "Send Allowed" : "Send Blocked"}
                    </h3>
                    <p className="text-sm text-zinc-400">{checkResult.reason}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {checkResult.checks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {check.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <span className="text-zinc-300">{check.check}</span>
                      <span className="text-zinc-500">— {check.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
