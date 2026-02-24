"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Crown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Trash2,
  Play,
  Power,
  PowerOff,
  Plus,
  Info,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import {
  ssoApi,
  SSOConfiguration,
  SSOConfigurationCreate,
  SSOProvider,
  SSOTestResult,
} from "@/lib/api";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    active: { color: "text-emerald-400 bg-emerald-400/10", label: "Active" },
    testing: { color: "text-yellow-400 bg-yellow-400/10", label: "Testing" },
    inactive: { color: "text-zinc-400 bg-zinc-400/10", label: "Inactive" },
  };

  const { color, label } = config[status] || config.inactive;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
      title="Copy"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function ConfigureForm({
  onSave,
  initialData,
}: {
  onSave: (data: SSOConfigurationCreate) => Promise<void>;
  initialData?: SSOConfiguration | null;
}) {
  const [provider, setProvider] = useState<SSOProvider>(initialData?.provider || "saml");
  const [displayName, setDisplayName] = useState(initialData?.display_name || "");
  const [entityId, setEntityId] = useState(initialData?.entity_id || "");
  const [ssoUrl, setSsoUrl] = useState(initialData?.sso_url || "");
  const [certificate, setCertificate] = useState(initialData?.certificate || "");
  const [clientId, setClientId] = useState(initialData?.client_id || "");
  const [issuerUrl, setIssuerUrl] = useState(initialData?.issuer_url || "");
  const [clientSecret, setClientSecret] = useState("");
  const [enforceSso, setEnforceSso] = useState(initialData?.enforce_sso || false);
  const [allowedDomains, setAllowedDomains] = useState(
    initialData?.allowed_domains?.join(", ") || ""
  );
  const [autoProvision, setAutoProvision] = useState(
    initialData?.auto_provision_users || false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const domains = allowedDomains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      await onSave({
        provider,
        display_name: displayName,
        ...(provider === "saml"
          ? { entity_id: entityId, sso_url: ssoUrl, certificate: certificate }
          : { client_id: clientId, issuer_url: issuerUrl, client_secret: clientSecret || undefined }),
        enforce_sso: enforceSso,
        allowed_domains: domains,
        auto_provision_users: autoProvision,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Protocol</label>
        <div className="flex gap-3">
          {(["saml", "oidc"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition ${
                provider === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-accent text-muted-foreground border-border hover:text-foreground hover:border-foreground/20"
              }`}
            >
              {p === "saml" ? "SAML 2.0" : "OpenID Connect"}
            </button>
          ))}
        </div>
      </div>

      {/* Display Name */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={inputClass}
          placeholder="e.g., Okta, Azure AD, Google Workspace"
          required
        />
      </div>

      {/* Provider-specific fields */}
      {provider === "saml" ? (
        <>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              IdP Entity ID
            </label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className={inputClass}
              placeholder="https://idp.example.com/entity"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The entity ID from your identity provider&apos;s SAML metadata.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              SSO Login URL
            </label>
            <input
              type="url"
              value={ssoUrl}
              onChange={(e) => setSsoUrl(e.target.value)}
              className={inputClass}
              placeholder="https://idp.example.com/sso/saml"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              X.509 Certificate
            </label>
            <textarea
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
              className={`${inputClass} h-32 font-mono text-xs`}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Paste the public certificate from your IdP for signature verification.
            </p>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Issuer URL
            </label>
            <input
              type="url"
              value={issuerUrl}
              onChange={(e) => setIssuerUrl(e.target.value)}
              className={inputClass}
              placeholder="https://accounts.google.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={inputClass}
              placeholder="your-client-id"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Client Secret
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className={inputClass}
              placeholder={initialData ? "••••••••" : "your-client-secret"}
            />
            {initialData && (
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to keep the existing secret.
              </p>
            )}
          </div>
        </>
      )}

      {/* Common Settings */}
      <div className="border-t border-border pt-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Provisioning & Enforcement</h3>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Allowed Email Domains
          </label>
          <input
            type="text"
            value={allowedDomains}
            onChange={(e) => setAllowedDomains(e.target.value)}
            className={inputClass}
            placeholder="example.com, company.org"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Comma-separated list of email domains allowed to sign in via SSO.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoProvision}
            onChange={(e) => setAutoProvision(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-accent text-primary focus:ring-primary"
          />
          <div>
            <span className="text-sm font-medium text-foreground">
              Auto-provision new users
            </span>
            <p className="text-xs text-muted-foreground">
              Automatically create accounts for users who sign in via SSO for the first time.
            </p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enforceSso}
            onChange={(e) => setEnforceSso(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-accent text-primary focus:ring-primary"
          />
          <div>
            <span className="text-sm font-medium text-foreground">
              Enforce SSO for all members
            </span>
            <p className="text-xs text-muted-foreground">
              When enabled, members must use SSO to sign in. Password and OAuth sign-in will be disabled.
            </p>
          </div>
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-3 py-2 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {initialData ? "Update Configuration" : "Save Configuration"}
        </button>
      </div>
    </form>
  );
}

export default function SSOSettingsPage() {
  const { currentWorkspace } = useWorkspace();
  const { isEnterprise } = useSubscription();
  const { user } = useAuth();
  const workspaceId = currentWorkspace?.id;

  const [config, setConfig] = useState<SSOConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SSOTestResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    loadConfig();
  }, [workspaceId]);

  const loadConfig = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await ssoApi.getConfiguration(workspaceId);
      setConfig(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data: SSOConfigurationCreate) => {
    if (!workspaceId) return;
    if (config) {
      const updated = await ssoApi.updateConfiguration(workspaceId, data);
      setConfig(updated);
    } else {
      const created = await ssoApi.createConfiguration(workspaceId, data);
      setConfig(created);
    }
    setShowForm(false);
  };

  const handleTest = async () => {
    if (!workspaceId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await ssoApi.testConfiguration(workspaceId);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, error: "Failed to reach SSO endpoint", user_attributes: null });
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = async () => {
    if (!workspaceId || !config) return;
    setToggling(true);
    try {
      const updated =
        config.status === "active"
          ? await ssoApi.deactivateConfiguration(workspaceId)
          : await ssoApi.activateConfiguration(workspaceId);
      setConfig(updated);
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!workspaceId) return;
    setDeleting(true);
    try {
      await ssoApi.deleteConfiguration(workspaceId);
      setConfig(null);
      setShowForm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!workspaceId || loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isEnterprise) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-amber-500/10 mb-6">
            <Crown className="h-8 w-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Enterprise Feature
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            SSO/SAML authentication is available on Enterprise plans. Upgrade to enable
            centralized identity management for your organization.
          </p>
          <a
            href="/settings/plans"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Crown className="h-4 w-4" />
            View Plans
          </a>
        </div>
      </div>
    );
  }

  const acsUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/saml/callback`;
  const metadataUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/saml/metadata`;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Single Sign-On</h1>
        </div>
        <p className="text-muted-foreground">
          Configure SAML 2.0 or OpenID Connect for centralized authentication.
        </p>
      </div>

      {/* Service Provider Info */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-3 flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              Service Provider Details
            </h3>
            <p className="text-xs text-muted-foreground">
              Use these values when configuring your identity provider.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground block mb-1">
                  ACS URL (Reply URL)
                </span>
                <div className="flex items-center gap-1 bg-accent rounded px-2 py-1.5">
                  <code className="text-xs text-foreground flex-1 truncate">
                    {acsUrl}
                  </code>
                  <CopyButton text={acsUrl} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">
                  Metadata URL
                </span>
                <div className="flex items-center gap-1 bg-accent rounded px-2 py-1.5">
                  <code className="text-xs text-foreground flex-1 truncate">
                    {metadataUrl}
                  </code>
                  <CopyButton text={metadataUrl} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Current Configuration */}
      {config && !showForm ? (
        <div className="space-y-4">
          <div className="bg-background/50 border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  {config.display_name}
                </h2>
                <StatusBadge status={config.status} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground bg-accent hover:bg-accent/80 rounded-lg transition-colors disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Test
                </button>
                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                    config.status === "active"
                      ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                      : "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                  }`}
                >
                  {toggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : config.status === "active" ? (
                    <PowerOff className="h-3.5 w-3.5" />
                  ) : (
                    <Power className="h-3.5 w-3.5" />
                  )}
                  {config.status === "active" ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Protocol</span>
                <p className="text-foreground font-medium">
                  {config.provider === "saml" ? "SAML 2.0" : "OpenID Connect"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Enforce SSO</span>
                <p className="text-foreground font-medium">
                  {config.enforce_sso ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Allowed Domains</span>
                <p className="text-foreground font-medium">
                  {config.allowed_domains.length > 0
                    ? config.allowed_domains.join(", ")
                    : "All domains"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Auto-provision</span>
                <p className="text-foreground font-medium">
                  {config.auto_provision_users ? "Enabled" : "Disabled"}
                </p>
              </div>
              {config.provider === "saml" && config.sso_url && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">SSO Login URL</span>
                  <p className="text-foreground font-mono text-xs truncate">
                    {config.sso_url}
                  </p>
                </div>
              )}
              {config.provider === "oidc" && config.issuer_url && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Issuer URL</span>
                  <p className="text-foreground font-mono text-xs truncate">
                    {config.issuer_url}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border">
              <button
                onClick={() => setShowForm(true)}
                className="px-3 py-1.5 text-sm font-medium text-foreground bg-accent hover:bg-accent/80 rounded-lg transition-colors"
              >
                Edit Configuration
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remove
              </button>
            </div>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`border rounded-xl p-4 ${
                testResult.success
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-red-500/20 bg-red-500/5"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="text-sm font-medium text-foreground">
                  {testResult.success ? "Connection Successful" : "Connection Failed"}
                </span>
              </div>
              {testResult.error && (
                <p className="text-sm text-red-400">{testResult.error}</p>
              )}
              {testResult.user_attributes && (
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground block mb-1">
                    Returned attributes:
                  </span>
                  <pre className="text-xs text-foreground bg-accent rounded p-2 overflow-x-auto">
                    {JSON.stringify(testResult.user_attributes, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      ) : showForm || !config ? (
        <div className="bg-background/50 border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">
              {config ? "Edit SSO Configuration" : "Configure SSO"}
            </h2>
            {config && (
              <button
                onClick={() => setShowForm(false)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
          <ConfigureForm onSave={handleSave} initialData={config} />
        </div>
      ) : null}

      {/* Help Section */}
      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Supported Identity Providers
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: "Okta", protocol: "SAML / OIDC" },
            { name: "Azure AD", protocol: "SAML / OIDC" },
            { name: "Google Workspace", protocol: "SAML / OIDC" },
            { name: "OneLogin", protocol: "SAML" },
            { name: "Auth0", protocol: "OIDC" },
            { name: "JumpCloud", protocol: "SAML" },
            { name: "PingIdentity", protocol: "SAML / OIDC" },
            { name: "Custom", protocol: "SAML / OIDC" },
          ].map((idp) => (
            <div
              key={idp.name}
              className="bg-accent rounded-lg px-3 py-2.5 text-center"
            >
              <p className="text-sm font-medium text-foreground">{idp.name}</p>
              <p className="text-[10px] text-muted-foreground">{idp.protocol}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
