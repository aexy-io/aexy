"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  Globe,
  Zap,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Settings,
  Shield,
  TrendingUp,
  Mail,
  TestTube,
  Tags,
  Edit3,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useSendingDomains, useEmailProviders, useSubscriptionCategories } from "@/hooks/useEmailMarketing";
import { SendingDomain, EmailProvider, SubscriptionCategory, DNSRecord } from "@/lib/api";

type TabType = "domains" | "providers" | "categories";

function DNSRecordRow({
  record,
  label,
  description,
}: {
  record: DNSRecord;
  label: string;
  description?: string;
}) {
  const [copied, setCopied] = useState<"name" | "value" | null>(null);

  const copyToClipboard = async (text: string, field: "name" | "value") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">
            {record.record_type}
          </span>
          <span className="text-sm font-medium text-foreground">{label}</span>
          {record.verified ? (
            <CheckCircle className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-400" />
          )}
        </div>
        <span className={`text-xs ${record.verified ? "text-emerald-400" : "text-amber-400"}`}>
          {record.verified ? "Verified" : "Pending"}
        </span>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Host / Name</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-background rounded text-sm text-foreground font-mono overflow-x-auto">
              {record.name}
            </code>
            <button
              onClick={() => copyToClipboard(record.name, "name")}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition flex-shrink-0"
              title="Copy host"
            >
              {copied === "name" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Value / Content</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-background rounded text-sm text-foreground font-mono overflow-x-auto break-all">
              {record.value}
            </code>
            <button
              onClick={() => copyToClipboard(record.value, "value")}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition flex-shrink-0"
              title="Copy value"
            >
              {copied === "value" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
      {record.note && <p className="text-xs text-muted-foreground italic">{record.note}</p>}
    </div>
  );
}

function DomainCard({
  domain,
  onVerify,
  onPause,
  onResume,
  onStartWarming,
  onDelete,
}: {
  domain: SendingDomain;
  onVerify: () => Promise<unknown>;
  onPause: () => void;
  onResume: () => void;
  onStartWarming: () => void;
  onDelete: () => void;
}) {
  const [showDnsRecords, setShowDnsRecords] = useState(!domain.is_verified);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      await onVerify();
      toast.success("DNS verification complete");
    } catch (error) {
      toast.error("Failed to verify DNS records");
    } finally {
      setIsVerifying(false);
    }
  };

  const getStatusIcon = () => {
    if (!domain.is_active) return <Pause className="h-4 w-4 text-muted-foreground" />;
    if (!domain.is_verified) return <AlertCircle className="h-4 w-4 text-amber-400" />;
    if (domain.warming_status === "in_progress") return <TrendingUp className="h-4 w-4 text-amber-400" />;
    if (domain.health_score >= 90) return <CheckCircle className="h-4 w-4 text-emerald-400" />;
    if (domain.health_score >= 70) return <AlertCircle className="h-4 w-4 text-amber-400" />;
    return <XCircle className="h-4 w-4 text-red-400" />;
  };

  const getStatusText = () => {
    if (!domain.is_active) return "Paused";
    if (!domain.is_verified) return "Pending Verification";
    if (domain.warming_status === "in_progress") return `Warming (Day ${domain.warming_day})`;
    if (domain.health_score >= 90) return "Healthy";
    if (domain.health_score >= 70) return "Moderate";
    return "Poor Health";
  };

  const hasDnsRecords = domain.dns_records && (
    domain.dns_records.verification ||
    domain.dns_records.spf ||
    domain.dns_records.dkim?.length ||
    domain.dns_records.dmarc
  );

  return (
    <div className="bg-background/50 border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Globe className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-foreground font-medium">{domain.domain}</h3>
              {!domain.is_verified && (
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-medium">
                  Action Required
                </span>
              )}
              {domain.is_default && (
                <span className="px-2 py-0.5 bg-sky-500/20 text-sky-400 rounded text-xs font-medium">
                  Default
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {getStatusIcon()}
              <span className="text-sm text-muted-foreground">{getStatusText()}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!domain.is_verified && (
            <button
              onClick={handleVerify}
              disabled={isVerifying}
              className="p-2 text-amber-400 hover:bg-amber-500/20 rounded-lg transition disabled:opacity-50"
              title="Verify DNS"
            >
              <RefreshCw className={`h-4 w-4 ${isVerifying ? "animate-spin" : ""}`} />
            </button>
          )}
          {domain.is_verified && domain.warming_status === "not_started" && (
            <button
              onClick={onStartWarming}
              className="p-2 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition"
              title="Start Warming"
            >
              <TrendingUp className="h-4 w-4" />
            </button>
          )}
          {domain.is_active ? (
            <button
              onClick={onPause}
              className="p-2 text-muted-foreground hover:text-amber-400 hover:bg-muted rounded-lg transition"
              title="Pause"
            >
              <Pause className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onResume}
              className="p-2 text-muted-foreground hover:text-emerald-400 hover:bg-muted rounded-lg transition"
              title="Resume"
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-2 text-muted-foreground hover:text-red-400 hover:bg-muted rounded-lg transition"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <p className="text-lg font-semibold text-foreground">{domain.health_score}%</p>
          <p className="text-xs text-muted-foreground">Health Score</p>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <p className="text-lg font-semibold text-foreground">{domain.daily_limit.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Daily Limit</p>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <p className="text-lg font-semibold text-foreground">{domain.daily_sent.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Sent Today</p>
        </div>
      </div>

      {/* DNS Records Section */}
      {hasDnsRecords && (
        <div className="border-t border-border pt-4 mt-4">
          <button
            onClick={() => setShowDnsRecords(!showDnsRecords)}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">DNS Records</span>
              {!domain.is_verified && (
                <span className="text-xs text-amber-400">Configuration required</span>
              )}
            </div>
            {showDnsRecords ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showDnsRecords && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-muted-foreground">
                <p>Add these DNS records to your domain registrar to enable email sending.</p>
                <a
                  href="https://github.com/bhanuc/aexy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sky-400 hover:text-sky-300"
                >
                  <ExternalLink className="h-3 w-3" />
                  Documentation
                </a>
              </div>

              {domain.dns_records.verification && (
                <DNSRecordRow
                  record={domain.dns_records.verification}
                  label="Domain Verification"
                  description="Proves ownership of this domain"
                />
              )}

              {domain.dns_records.spf && (
                <DNSRecordRow
                  record={domain.dns_records.spf}
                  label="SPF Record"
                  description="Authorizes mail servers to send on your behalf"
                />
              )}

              {domain.dns_records.dkim?.map((dkimRecord, idx) => (
                <DNSRecordRow
                  key={idx}
                  record={dkimRecord}
                  label={`DKIM Record ${domain.dns_records.dkim && domain.dns_records.dkim.length > 1 ? idx + 1 : ""}`}
                  description="Cryptographically signs emails to verify authenticity"
                />
              ))}

              {domain.dns_records.dmarc && (
                <DNSRecordRow
                  record={domain.dns_records.dmarc}
                  label="DMARC Policy"
                  description="Tells receiving servers how to handle authentication failures"
                />
              )}

              {!domain.is_verified && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    After adding DNS records, click verify to check configuration.
                  </p>
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition text-sm disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Verify DNS
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fallback for domains without dns_records data */}
      {!hasDnsRecords && !domain.is_verified && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-sm text-amber-400 mb-2">DNS records need verification</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Add these DNS records to verify your domain:</p>
            <code className="block p-2 bg-muted rounded mt-2 text-foreground">
              TXT @ aexy-verification={domain.verification_token || domain.id?.slice(0, 8)}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  onToggle,
  onTest,
  onEdit,
  onDelete,
}: {
  provider: EmailProvider;
  onToggle: () => void;
  onTest: () => Promise<unknown>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await onTest();
    } finally {
      setIsTesting(false);
    }
  };

  const hasCredentials = provider.has_credentials;

  return (
    <div className="bg-background/50 border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <Zap className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-foreground font-medium">{provider.name}</h3>
            <p className="text-sm text-muted-foreground capitalize">{provider.provider_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!hasCredentials && (
            <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-medium">
              Setup Required
            </span>
          )}
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            provider.is_active
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}>
            {provider.is_active ? "Active" : "Inactive"}
          </span>
          {provider.is_default && (
            <span className="px-2 py-1 bg-sky-500/20 text-sky-400 rounded-full text-xs font-medium">
              Default
            </span>
          )}
        </div>
      </div>

      {provider.description && (
        <p className="text-sm text-muted-foreground mb-4">{provider.description}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 rounded-lg transition text-sm"
        >
          <Settings className="h-4 w-4" />
          Configure
        </button>
        <button
          onClick={handleTest}
          disabled={isTesting || !hasCredentials}
          className="flex items-center gap-2 px-3 py-1.5 bg-muted text-foreground hover:text-foreground rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title={!hasCredentials ? "Configure credentials first" : "Test connection"}
        >
          {isTesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TestTube className="h-4 w-4" />
          )}
          Test
        </button>
        <button
          onClick={onToggle}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            provider.is_active
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
          }`}
        >
          {provider.is_active ? "Disable" : "Enable"}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-muted-foreground hover:text-red-400 transition"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CategoryCard({
  category,
  onToggle,
  onEdit,
  onDelete,
}: {
  category: SubscriptionCategory;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-background/50 border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Tags className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-foreground font-medium">{category.name}</h3>
            <p className="text-xs text-muted-foreground font-mono">{category.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            category.is_active
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}>
            {category.is_active ? "Active" : "Inactive"}
          </span>
          {category.default_subscribed && (
            <span className="px-2 py-1 bg-sky-500/20 text-sky-400 rounded-full text-xs font-medium">
              Default On
            </span>
          )}
          {category.required && (
            <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-medium">
              Required
            </span>
          )}
        </div>
      </div>

      {category.description && (
        <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="flex items-center gap-2 px-3 py-1.5 bg-muted text-foreground hover:text-foreground rounded-lg transition text-sm"
        >
          <Edit3 className="h-4 w-4" />
          Edit
        </button>
        <button
          onClick={onToggle}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            category.is_active
              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
          }`}
        >
          {category.is_active ? "Disable" : "Enable"}
        </button>
        {!category.required && (
          <button
            onClick={onDelete}
            className="p-1.5 text-muted-foreground hover:text-red-400 transition"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function EmailSettingsPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  useAuth(); // Auth check
  const workspaceId = currentWorkspace?.id || null;

  const [activeTab, setActiveTab] = useState<TabType>("domains");
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SubscriptionCategory | null>(null);
  const [editingProvider, setEditingProvider] = useState<EmailProvider | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderType, setNewProviderType] = useState("ses");

  // Provider credentials state
  const [providerCredentials, setProviderCredentials] = useState<Record<string, string>>({});
  const [providerDescription, setProviderDescription] = useState("");

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [newCategoryDefaultSubscribed, setNewCategoryDefaultSubscribed] = useState(true);

  const {
    domains,
    isLoading: domainsLoading,
    error: domainsError,
    refetch: refetchDomains,
    createDomain,
    deleteDomain,
    verifyDomain,
    pauseDomain,
    resumeDomain,
    startWarming,
  } = useSendingDomains(workspaceId);

  const {
    providers,
    isLoading: providersLoading,
    error: providersError,
    refetch: refetchProviders,
    createProvider,
    updateProvider,
    deleteProvider,
    testProvider,
  } = useEmailProviders(workspaceId);

  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    refetch: refetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useSubscriptionCategories(workspaceId);

  const handleCreateDomain = async () => {
    if (!newDomain) return;
    try {
      await createDomain({ domain: newDomain });
      toast.success(`Domain ${newDomain} added successfully`);
      setNewDomain("");
      setShowAddDomain(false);
    } catch (error: unknown) {
      // Extract error message from API response
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      const message = err.response?.data?.detail || err.message || "Failed to add domain";
      toast.error(message);
    }
  };

  const handleCreateProvider = async () => {
    if (!newProviderName) return;
    try {
      await createProvider({
        name: newProviderName,
        provider_type: newProviderType,
        credentials: {},
      });
      setNewProviderName("");
      setShowAddProvider(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteDomain = async (id: string) => {
    if (confirm("Are you sure you want to delete this domain?")) {
      await deleteDomain(id);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (confirm("Are you sure you want to delete this provider?")) {
      await deleteProvider(id);
    }
  };

  const openEditProvider = (provider: EmailProvider) => {
    setEditingProvider(provider);
    setNewProviderName(provider.name);
    setProviderDescription(provider.description || "");
    // Extract credentials (they may be masked on backend, but we show what we have)
    // Convert unknown values to strings for the form
    const creds: Record<string, string> = {};
    if (provider.credentials) {
      for (const [key, value] of Object.entries(provider.credentials)) {
        creds[key] = String(value ?? "");
      }
    }
    setProviderCredentials(creds);
  };

  const closeEditProvider = () => {
    setEditingProvider(null);
    setNewProviderName("");
    setProviderDescription("");
    setProviderCredentials({});
  };

  const handleUpdateProvider = async () => {
    if (!editingProvider) return;
    try {
      await updateProvider({
        providerId: editingProvider.id,
        data: {
          name: newProviderName,
          description: providerDescription || undefined,
          credentials: providerCredentials,
        },
      });
      closeEditProvider();
    } catch {
      // Error handled by mutation
    }
  };

  type CredentialField = {
    key: string;
    label: string;
    type: "text" | "password" | "number" | "select" | "checkbox";
    placeholder?: string;
    options?: { value: string; label: string }[];
  };

  const getCredentialFields = (providerType: string): CredentialField[] => {
    switch (providerType) {
      case "ses":
        return [
          { key: "access_key_id", label: "Access Key ID", type: "text", placeholder: "AKIAIOSFODNN7EXAMPLE" },
          { key: "secret_access_key", label: "Secret Access Key", type: "password", placeholder: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" },
          { key: "region", label: "Region", type: "text", placeholder: "us-east-1" },
          { key: "configuration_set", label: "Configuration Set (optional)", type: "text", placeholder: "my-configuration-set" },
        ];
      case "sendgrid":
        return [
          { key: "api_key", label: "API Key", type: "password", placeholder: "SG.xxxxxxxxxxxxxxxxxxxx" },
        ];
      case "mailgun":
        return [
          { key: "api_key", label: "API Key", type: "password", placeholder: "key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
          { key: "domain", label: "Domain", type: "text", placeholder: "mg.example.com" },
          { key: "region", label: "Region", type: "select", options: [{ value: "us", label: "US" }, { value: "eu", label: "EU" }] },
        ];
      case "postmark":
        return [
          { key: "server_token", label: "Server Token", type: "password", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
        ];
      case "smtp":
        return [
          { key: "host", label: "SMTP Host", type: "text", placeholder: "smtp.example.com" },
          { key: "port", label: "Port", type: "number", placeholder: "587" },
          { key: "username", label: "Username", type: "text", placeholder: "user@example.com" },
          { key: "password", label: "Password", type: "password", placeholder: "password" },
          { key: "use_tls", label: "Use TLS", type: "checkbox" },
        ];
      default:
        return [];
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName) return;
    try {
      await createCategory({
        name: newCategoryName,
        slug: newCategorySlug || newCategoryName.toLowerCase().replace(/\s+/g, "-"),
        description: newCategoryDescription || undefined,
        default_subscribed: newCategoryDefaultSubscribed,
      });
      setNewCategoryName("");
      setNewCategorySlug("");
      setNewCategoryDescription("");
      setNewCategoryDefaultSubscribed(true);
      setShowAddCategory(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;
    try {
      await updateCategory({
        categoryId: editingCategory.id,
        data: {
          name: newCategoryName,
          description: newCategoryDescription || undefined,
        },
      });
      setEditingCategory(null);
      setNewCategoryName("");
      setNewCategoryDescription("");
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (confirm("Are you sure you want to delete this category? Subscribers won't be able to manage their preferences for this category anymore.")) {
      await deleteCategory(id);
    }
  };

  const openEditCategory = (category: SubscriptionCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryDescription(category.description || "");
  };

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen bg-background">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Workspace Selected</h2>
            <p className="text-muted-foreground">Please select a workspace to manage email settings.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
<div className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.push("/settings")}
              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-500/20 rounded-lg">
                  <Mail className="h-5 w-5 text-sky-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Email Settings</h1>
                  <p className="text-sm text-muted-foreground">Configure email infrastructure and providers</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 bg-background/50 border border-border rounded-xl mb-6 w-fit">
            <button
              onClick={() => setActiveTab("domains")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "domains"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe className="h-4 w-4" />
              Sending Domains ({domains.length})
            </button>
            <button
              onClick={() => setActiveTab("providers")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "providers"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="h-4 w-4" />
              Providers ({providers.length})
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "categories"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Tags className="h-4 w-4" />
              Categories ({categories.length})
            </button>
          </div>

          {/* Domains Tab */}
          {activeTab === "domains" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-muted-foreground">
                  Manage your sending domains and warming schedules
                </p>
                <button
                  onClick={() => setShowAddDomain(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition"
                >
                  <Plus className="h-4 w-4" />
                  Add Domain
                </button>
              </div>

              {domainsError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-400">Failed to load domains</p>
                  <button
                    onClick={() => refetchDomains()}
                    className="mt-2 text-sm text-sky-400 hover:text-sky-300"
                  >
                    Try Again
                  </button>
                </div>
              ) : domainsLoading ? (
                <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                  <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mx-auto" />
                </div>
              ) : domains.length === 0 ? (
                <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                  <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No sending domains</h3>
                  <p className="text-muted-foreground mb-4">Add a domain to start sending emails</p>
                  <button
                    onClick={() => setShowAddDomain(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
                  >
                    <Plus className="h-4 w-4" />
                    Add Domain
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {domains.map((domain) => (
                    <DomainCard
                      key={domain.id}
                      domain={domain}
                      onVerify={() => verifyDomain(domain.id)}
                      onPause={() => pauseDomain(domain.id)}
                      onResume={() => resumeDomain(domain.id)}
                      onStartWarming={() => startWarming({ domainId: domain.id })}
                      onDelete={() => handleDeleteDomain(domain.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Providers Tab */}
          {activeTab === "providers" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-muted-foreground">
                  Configure email service providers for sending
                </p>
                <button
                  onClick={() => setShowAddProvider(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition"
                >
                  <Plus className="h-4 w-4" />
                  Add Provider
                </button>
              </div>

              {providersError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-400">Failed to load providers</p>
                  <button
                    onClick={() => refetchProviders()}
                    className="mt-2 text-sm text-sky-400 hover:text-sky-300"
                  >
                    Try Again
                  </button>
                </div>
              ) : providersLoading ? (
                <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                  <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mx-auto" />
                </div>
              ) : providers.length === 0 ? (
                <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                  <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No email providers</h3>
                  <p className="text-muted-foreground mb-4">Add a provider to start sending emails</p>
                  <button
                    onClick={() => setShowAddProvider(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
                  >
                    <Plus className="h-4 w-4" />
                    Add Provider
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {providers.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onToggle={() => updateProvider({
                        providerId: provider.id,
                        data: { is_active: !provider.is_active }
                      })}
                      onTest={() => testProvider(provider.id)}
                      onEdit={() => openEditProvider(provider)}
                      onDelete={() => handleDeleteProvider(provider.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Categories Tab */}
          {activeTab === "categories" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-muted-foreground">
                  Manage subscription categories for your emails
                </p>
                <button
                  onClick={() => setShowAddCategory(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition"
                >
                  <Plus className="h-4 w-4" />
                  Add Category
                </button>
              </div>

              {categoriesError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-400">Failed to load categories</p>
                  <button
                    onClick={() => refetchCategories()}
                    className="mt-2 text-sm text-sky-400 hover:text-sky-300"
                  >
                    Try Again
                  </button>
                </div>
              ) : categoriesLoading ? (
                <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                  <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mx-auto" />
                </div>
              ) : categories.length === 0 ? (
                <div className="bg-background/50 border border-border rounded-xl p-12 text-center">
                  <Tags className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No subscription categories</h3>
                  <p className="text-muted-foreground mb-4">Create categories to let users manage their email preferences</p>
                  <button
                    onClick={() => setShowAddCategory(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
                  >
                    <Plus className="h-4 w-4" />
                    Add Category
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {categories.map((category) => (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      onToggle={() => updateCategory({
                        categoryId: category.id,
                        data: { is_active: !category.is_active }
                      })}
                      onEdit={() => openEditCategory(category)}
                      onDelete={() => handleDeleteCategory(category.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Domain Modal */}
      {showAddDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-background border border-border rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Add Sending Domain</h3>
            </div>
            <div className="p-4">
              <label className="block text-sm text-muted-foreground mb-2">Domain</label>
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="mail.example.com"
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-xs text-muted-foreground mt-2">
                You'll need to add DNS records to verify ownership
              </p>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setShowAddDomain(false)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDomain}
                disabled={!newDomain}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
              >
                Add Domain
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-background border border-border rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Add Email Provider</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Provider Name</label>
                <input
                  type="text"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  placeholder="My SES Provider"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Provider Type</label>
                <select
                  value={newProviderType}
                  onChange={(e) => setNewProviderType(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="ses">Amazon SES</option>
                  <option value="sendgrid">SendGrid</option>
                  <option value="mailgun">Mailgun</option>
                  <option value="postmark">Postmark</option>
                  <option value="smtp">SMTP</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                You can configure credentials after adding the provider
              </p>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setShowAddProvider(false)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProvider}
                disabled={!newProviderName}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
              >
                Add Provider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Provider Modal */}
      {editingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-background border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">
                Configure {editingProvider.provider_type.toUpperCase()} Provider
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Provider Name</label>
                <input
                  type="text"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                  placeholder="My Provider"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={providerDescription}
                  onChange={(e) => setProviderDescription(e.target.value)}
                  placeholder="Production email provider"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Credentials</h4>
                <div className="space-y-3">
                  {getCredentialFields(editingProvider.provider_type).map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm text-muted-foreground mb-1">{field.label}</label>
                      {field.type === "select" && field.options ? (
                        <select
                          value={providerCredentials[field.key] || ""}
                          onChange={(e) => setProviderCredentials({
                            ...providerCredentials,
                            [field.key]: e.target.value,
                          })}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          <option value="">Select...</option>
                          {field.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : field.type === "checkbox" ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={providerCredentials[field.key] === "true"}
                            onChange={(e) => setProviderCredentials({
                              ...providerCredentials,
                              [field.key]: e.target.checked ? "true" : "false",
                            })}
                            className="w-4 h-4 rounded border-border bg-muted text-sky-500 focus:ring-sky-500"
                          />
                          <span className="text-sm text-foreground">Enable TLS encryption</span>
                        </label>
                      ) : (
                        <input
                          type={field.type}
                          value={providerCredentials[field.key] || ""}
                          onChange={(e) => setProviderCredentials({
                            ...providerCredentials,
                            [field.key]: e.target.value,
                          })}
                          placeholder={field.placeholder}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Security note:</strong> Credentials are encrypted and stored securely.
                  After saving, some credential values may be masked for security.
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={closeEditProvider}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateProvider}
                disabled={!newProviderName}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-background border border-border rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Add Subscription Category</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Category Name *</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Product Updates"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Slug (optional)</label>
                <input
                  type="text"
                  value={newCategorySlug}
                  onChange={(e) => setNewCategorySlug(e.target.value)}
                  placeholder="product-updates"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-xs text-muted-foreground mt-1">Auto-generated from name if left empty</p>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Description (optional)</label>
                <textarea
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  placeholder="Get notified about new features and improvements"
                  rows={3}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="defaultSubscribed"
                  checked={newCategoryDefaultSubscribed}
                  onChange={(e) => setNewCategoryDefaultSubscribed(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-muted text-sky-500 focus:ring-sky-500"
                />
                <label htmlFor="defaultSubscribed" className="text-sm text-foreground">
                  Subscribe new users by default
                </label>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddCategory(false);
                  setNewCategoryName("");
                  setNewCategorySlug("");
                  setNewCategoryDescription("");
                  setNewCategoryDefaultSubscribed(true);
                }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={!newCategoryName}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-background border border-border rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Edit Category</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Category Name *</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Product Updates"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Slug</label>
                <input
                  type="text"
                  value={editingCategory.slug}
                  disabled
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-muted-foreground cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-1">Slug cannot be changed after creation</p>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Description (optional)</label>
                <textarea
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  placeholder="Get notified about new features and improvements"
                  rows={3}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditingCategory(null);
                  setNewCategoryName("");
                  setNewCategoryDescription("");
                }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateCategory}
                disabled={!newCategoryName}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
