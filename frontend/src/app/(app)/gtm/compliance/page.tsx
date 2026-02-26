"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Search,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Code,
  Copy,
  Check,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gtmApi, SuppressionEntry, ComplianceAuditEntry, SendPermissionCheck } from "@/lib/api";

type Tab = "tracking" | "suppression" | "audit" | "check";

export default function CompliancePage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>("tracking");
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [suppressionPage, setSuppressionPage] = useState(1);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [auditPage, _setAuditPage] = useState(1);
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

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const apiBase = typeof window !== "undefined" ? window.location.origin : "https://yourapp.com";

  const gdprSnippet = `<script src="${apiBase}/aexy-track.js"
  data-workspace="${workspaceId || "YOUR_WORKSPACE_ID"}"
  data-api="${apiBase}/api/v1"
  data-consent="denied"></script>`;

  const canSpamSnippet = `<script src="${apiBase}/aexy-track.js"
  data-workspace="${workspaceId || "YOUR_WORKSPACE_ID"}"
  data-api="${apiBase}/api/v1"></script>`;

  const cmpSnippet = `<!-- After your CMP collects consent: -->
<script>
  // Grant consent (starts tracking)
  window.aexy.consent("granted");

  // Revoke consent (stops tracking, deletes cookies)
  window.aexy.consent("denied");
</script>`;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "tracking", label: "Tracking Setup", icon: <Code className="w-4 h-4" /> },
    { key: "suppression", label: "Suppression List", icon: <XCircle className="w-4 h-4" /> },
    { key: "audit", label: "Audit Log", icon: <FileText className="w-4 h-4" /> },
    { key: "check", label: "Send Check", icon: <Search className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
              Compliance
            </h1>
            <p className="text-muted-foreground mt-1">
              Tracking consent, suppression lists, pre-send checks, and audit trails for GDPR, CAN-SPAM, and CASL.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-muted/50 border border-border rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-border text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tracking Setup Tab */}
        {activeTab === "tracking" && (
          <div className="space-y-6">
            {/* Overview */}
            <div className="bg-muted/50 border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">Visitor Tracking Script</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add this script to your website to track anonymous visitors. The script is consent-aware
                and respects GDPR, ePrivacy, and Global Privacy Control (GPC) signals.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-background/50 border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-medium text-foreground">Consent-Gated</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No cookies set and no PII collected until consent is granted. Tracking blocked when denied.
                  </p>
                </div>
                <div className="bg-background/50 border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-medium text-foreground">GPC Support</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Automatically respects <code className="text-xs bg-muted px-1 rounded">navigator.globalPrivacyControl</code> browser signal.
                  </p>
                </div>
                <div className="bg-background/50 border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-medium text-foreground">GDPR Erasure</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All tracked data is included in right-to-erasure requests processed via the compliance API.
                  </p>
                </div>
              </div>
            </div>

            {/* GDPR Snippet */}
            <div className="bg-muted/50 border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">GDPR / ePrivacy (EU, UK, EEA)</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Starts with tracking <strong>disabled</strong>. Use your Consent Management Platform (CMP)
                    to call <code className="text-xs bg-muted px-1 rounded">window.aexy.consent(&quot;granted&quot;)</code> after the user opts in.
                  </p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Recommended
                </span>
              </div>
              <div className="relative">
                <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-300 overflow-x-auto"><code>{gdprSnippet}</code></pre>
                <button
                  onClick={() => copyToClipboard(gdprSnippet, "gdpr")}
                  className="absolute top-3 right-3 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {copiedSnippet === "gdpr" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* CAN-SPAM Snippet */}
            <div className="bg-muted/50 border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">CAN-SPAM / CASL (US, Canada)</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Starts with tracking <strong>enabled</strong> (opt-out model). GPC signal is still respected.
                    Users can opt out via <code className="text-xs bg-muted px-1 rounded">window.aexy.consent(&quot;denied&quot;)</code>.
                  </p>
                </div>
              </div>
              <div className="relative">
                <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-300 overflow-x-auto"><code>{canSpamSnippet}</code></pre>
                <button
                  onClick={() => copyToClipboard(canSpamSnippet, "canspam")}
                  className="absolute top-3 right-3 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {copiedSnippet === "canspam" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* CMP Integration */}
            <div className="bg-muted/50 border border-border rounded-xl p-6">
              <h4 className="text-sm font-semibold text-foreground mb-1">CMP Integration</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Use the <code className="text-xs bg-muted px-1 rounded">window.aexy.consent()</code> API to integrate
                with any Consent Management Platform (OneTrust, Cookiebot, etc.).
              </p>
              <div className="relative">
                <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-300 overflow-x-auto"><code>{cmpSnippet}</code></pre>
                <button
                  onClick={() => copyToClipboard(cmpSnippet, "cmp")}
                  className="absolute top-3 right-3 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {copiedSnippet === "cmp" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Data collected */}
            <div className="bg-muted/50 border border-border rounded-xl p-6">
              <h4 className="text-sm font-semibold text-foreground mb-3">What Data Is Collected</h4>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/50">
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5">Data</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5">When</th>
                      <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5">Retention</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 text-sm">
                    <tr>
                      <td className="px-4 py-2.5 text-foreground">Anonymous ID (cookie)</td>
                      <td className="px-4 py-2.5 text-muted-foreground">After consent granted</td>
                      <td className="px-4 py-2.5 text-muted-foreground">1 year (deleted on revoke)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-foreground">Page views, scroll depth, time on page</td>
                      <td className="px-4 py-2.5 text-muted-foreground">After consent granted</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Configurable (default 365 days)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-foreground">UTM parameters</td>
                      <td className="px-4 py-2.5 text-muted-foreground">After consent granted</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Stored with event</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-foreground">IP address</td>
                      <td className="px-4 py-2.5 text-muted-foreground">With each event batch</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Anonymized after 90 days</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-foreground">Email (via identify)</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Only after explicit consent + identify() call</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Until erasure request</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Suppression Tab */}
        {activeTab === "suppression" && (
          <div>
            {/* Add form */}
            <div className="bg-muted/50 border border-border rounded-xl p-4 mb-6 flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email Address</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div className="w-40">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Reason</label>
                <select
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-indigo-500/50"
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
            <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Email</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Domain</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Reason</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Source</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Added</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(suppressionData?.entries || []).map((entry: SuppressionEntry) => (
                    <tr key={entry.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-3 text-sm text-foreground">{entry.email}</td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">{entry.domain || "—"}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                          {entry.reason}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">{entry.source}</td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">
                        {new Date(entry.added_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => removeMutation.mutate(entry.email)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors"
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
                <div className="px-6 py-12 text-center text-muted-foreground">
                  No suppressed contacts. This is where unsubscribes, bounces, and complaints are tracked.
                </div>
              )}
              {(suppressionData?.total || 0) > 25 && (
                <div className="px-6 py-3 border-t border-border/50 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {suppressionData?.total} total entries
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setSuppressionPage((p) => Math.max(1, p - 1))} disabled={suppressionPage <= 1} className="p-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors">
                      <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => setSuppressionPage((p) => p + 1)} disabled={suppressionPage >= Math.ceil((suppressionData?.total || 0) / 25)} className="p-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === "audit" && (
          <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Action</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Reason</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Jurisdiction</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(auditData?.entries || []).map((entry: ComplianceAuditEntry) => {
                  const isBlock = entry.action.includes("blocked");
                  const isApprove = entry.action.includes("approved");
                  return (
                    <tr key={entry.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-3 text-sm text-foreground">{entry.email}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                          isBlock ? "bg-red-500/20 text-red-400 border-red-500/30" :
                          isApprove ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                          "bg-zinc-500/20 text-muted-foreground border-zinc-500/30"
                        }`}>
                          {isBlock ? <XCircle className="w-3 h-3" /> : isApprove ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">{entry.reason || "—"}</td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">{entry.jurisdiction || "—"}</td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">
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
              <div className="px-6 py-12 text-center text-muted-foreground">
                No audit entries yet. All send decisions and compliance actions are logged here.
              </div>
            )}
          </div>
        )}

        {/* Send Check Tab */}
        {activeTab === "check" && (
          <div>
            <div className="bg-muted/50 border border-border rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Pre-Send Compliance Check</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Check if an email address passes all compliance checks before sending.
              </p>
              <div className="flex gap-3">
                <input
                  type="email"
                  value={checkEmail}
                  onChange={(e) => setCheckEmail(e.target.value)}
                  placeholder="email@example.com"
                  onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                  className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-indigo-500/50"
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
              <div className={`bg-muted/50 border rounded-xl p-6 ${
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
                    <p className="text-sm text-muted-foreground">{checkResult.reason}</p>
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
                      <span className="text-foreground">{check.check}</span>
                      <span className="text-muted-foreground">— {check.detail}</span>
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
