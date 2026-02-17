"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ExternalLink,
  X,
  AlertCircle,
  Loader2,
  Key,
  Link2,
  Mail,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";
import { repositoriesApi, integrationsApi } from "@/lib/api";

// Icons as components
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
      <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
      <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>
      <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  );
}

function JiraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#2684FF" d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/>
    </svg>
  );
}

function LinearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.513 12.833l8.662 8.662a9.963 9.963 0 0 1-8.662-8.662zm-.317-2.67a10.026 10.026 0 0 1 2.634-5.2l10.199 10.198a10.026 10.026 0 0 1-5.199 2.634L2.196 10.162zm3.839-6.405a10.026 10.026 0 0 1 4.298-1.56L21.802 13.67a10.027 10.027 0 0 1-1.561 4.298L6.035 3.758zm5.831-1.754a9.913 9.913 0 0 1 2.136-.004l7.993 7.994a9.914 9.914 0 0 1-.004 2.135L11.866 2.004zm4.57.503l7.405 7.405a10.022 10.022 0 0 1-7.405-7.405z"/>
    </svg>
  );
}

interface Integration {
  id: keyof typeof integrationConfig;
  name: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  recommendedFor: string[];
}

const integrationConfig = {
  github: {
    name: "GitHub",
    description: "Track commits, PRs, code reviews, and engineering metrics",
    icon: GitHubIcon,
    color: "from-slate-600 to-slate-700",
    recommendedFor: ["developer", "full-team"],
  },
  google: {
    name: "Google",
    description: "Sync Gmail, Calendar, and contacts for CRM",
    icon: GoogleIcon,
    color: "from-white to-slate-100",
    recommendedFor: ["sales", "customer-success", "full-team"],
  },
  slack: {
    name: "Slack",
    description: "Team communication and notifications",
    icon: SlackIcon,
    color: "from-purple-600 to-purple-700",
    recommendedFor: ["customer-success", "full-team"],
  },
  jira: {
    name: "Jira",
    description: "Issue tracking and project management",
    icon: JiraIcon,
    color: "from-blue-600 to-blue-700",
    recommendedFor: ["developer", "full-team"],
  },
  linear: {
    name: "Linear",
    description: "Modern issue tracking for fast-moving teams",
    icon: LinearIcon,
    color: "from-indigo-600 to-indigo-700",
    recommendedFor: ["developer", "full-team"],
  },
} as const;

// Jira Connection Modal
function JiraModal({
  isOpen,
  onClose,
  onConnect,
  isLoading,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (siteUrl: string, email: string, apiToken: string) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [siteUrl, setSiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md mx-4 bg-background border border-border rounded-2xl p-6 shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
            <JiraIcon className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Connect Jira</h3>
            <p className="text-sm text-muted-foreground">Enter your Jira credentials</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Jira Site URL
            </label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://yourcompany.atlassian.net"
                className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@company.com"
                className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              API Token
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Enter your Jira API token"
                className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-xs text-primary-400 hover:text-primary-300"
            >
              Get your API token
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={() => onConnect(siteUrl, email, apiToken)}
            disabled={isLoading || !siteUrl || !email || !apiToken}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                Connect Jira
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Linear Connection Modal
function LinearModal({
  isOpen,
  onClose,
  onConnect,
  isLoading,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (apiKey: string) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [apiKey, setApiKey] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md mx-4 bg-background border border-border rounded-2xl p-6 shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center">
            <LinearIcon className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Connect Linear</h3>
            <p className="text-sm text-muted-foreground">Enter your Linear API key</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              API Key
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="lin_api_..."
                className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary-500"
              />
            </div>
            <a
              href="https://linear.app/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-xs text-primary-400 hover:text-primary-300"
            >
              Get your API key from Linear settings
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={() => onConnect(apiKey)}
            disabled={isLoading || !apiKey}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-medium hover:from-indigo-700 hover:to-indigo-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                Connect Linear
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function ConnectIntegrations() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, updateConnections, setCurrentStep, getNextRoute } = useOnboarding();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, boolean>>({});

  // Modal states
  const [showJiraModal, setShowJiraModal] = useState(false);
  const [showLinearModal, setShowLinearModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentStep(4);
  }, [setCurrentStep]);

  // Check for OAuth callbacks
  useEffect(() => {
    const github = searchParams.get("github");
    const google = searchParams.get("google");
    const slack = searchParams.get("slack");

    if (github === "connected") {
      updateConnections({ github: true });
      setConnectionStatus(prev => ({ ...prev, github: true }));
    }
    if (google === "connected") {
      updateConnections({ google: true });
      setConnectionStatus(prev => ({ ...prev, google: true }));
    }
    if (slack === "connected") {
      updateConnections({ slack: true });
      setConnectionStatus(prev => ({ ...prev, slack: true }));
    }
  }, [searchParams, updateConnections]);

  // Check existing connection status (only once)
  const hasCheckedConnections = useRef(false);
  useEffect(() => {
    if (hasCheckedConnections.current) return;
    hasCheckedConnections.current = true;

    const checkConnections = async () => {
      try {
        // Check GitHub
        const installStatus = await repositoriesApi.getInstallationStatus();
        if (installStatus.has_installation) {
          updateConnections({ github: true });
          setConnectionStatus(prev => ({ ...prev, github: true }));
        }
      } catch {
        // Not connected
      }
      // Note: Google and Slack status will be checked via callback params
    };

    checkConnections();
  }, [updateConnections]);

  const handleConnect = async (integrationId: string) => {
    setConnecting(integrationId);
    // API base URL - may or may not include /api/v1 depending on env
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    // Clean redirect URL (without query params from previous OAuth callbacks)
    const cleanRedirectBase = `${window.location.origin}/onboarding/connect`;

    try {
      switch (integrationId) {
        case "github": {
          // Get GitHub App install URL
          const status = await repositoriesApi.getInstallationStatus();
          if (status.install_url) {
            // Store return URL and redirect
            localStorage.setItem("onboarding_return_url", `${cleanRedirectBase}?github=connected`);
            window.location.href = status.install_url;
          }
          break;
        }
        case "google": {
          // Use the CRM OAuth endpoint which requests Gmail + Calendar scopes
          const redirectUrl = encodeURIComponent(`${cleanRedirectBase}?google=connected`);
          window.location.href = `${apiBase}/auth/google/connect-crm?redirect_url=${redirectUrl}`;
          break;
        }
        case "slack": {
          // Slack OAuth - use the /slack/connect endpoint for onboarding
          const redirectUrl = encodeURIComponent(`${cleanRedirectBase}?slack=connected`);
          window.location.href = `${apiBase}/slack/connect?redirect_url=${redirectUrl}`;
          break;
        }
        case "jira":
          if (!data.workspace.id) {
            console.warn("Cannot connect Jira without a workspace");
            break;
          }
          setModalError(null);
          setShowJiraModal(true);
          break;
        case "linear":
          if (!data.workspace.id) {
            console.warn("Cannot connect Linear without a workspace");
            break;
          }
          setModalError(null);
          setShowLinearModal(true);
          break;
      }
    } catch (error) {
      console.error(`Failed to connect ${integrationId}:`, error);
    } finally {
      setConnecting(null);
    }
  };

  const handleJiraConnect = async (siteUrl: string, email: string, apiToken: string) => {
    if (!data.workspace.id) return;

    setModalLoading(true);
    setModalError(null);

    try {
      await integrationsApi.createJiraIntegration(data.workspace.id, {
        site_url: siteUrl,
        user_email: email,
        api_token: apiToken,
      });

      updateConnections({ jira: true });
      setConnectionStatus(prev => ({ ...prev, jira: true }));
      setShowJiraModal(false);
    } catch (err: unknown) {
      console.error("Failed to connect Jira:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to connect Jira. Please check your credentials.";
      setModalError(errorMessage);
    } finally {
      setModalLoading(false);
    }
  };

  const handleLinearConnect = async (apiKey: string) => {
    if (!data.workspace.id) return;

    setModalLoading(true);
    setModalError(null);

    try {
      await integrationsApi.createLinearIntegration(data.workspace.id, {
        api_key: apiKey,
      });

      updateConnections({ linear: true });
      setConnectionStatus(prev => ({ ...prev, linear: true }));
      setShowLinearModal(false);
    } catch (err: unknown) {
      console.error("Failed to connect Linear:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to connect Linear. Please check your API key.";
      setModalError(errorMessage);
    } finally {
      setModalLoading(false);
    }
  };

  const isRecommended = (integrationId: string) => {
    const config = integrationConfig[integrationId as keyof typeof integrationConfig];
    return data.useCases.some(uc => (config.recommendedFor as readonly string[]).includes(uc));
  };

  const handleContinue = () => {
    const nextRoute = getNextRoute();
    router.push(nextRoute);
  };

  const integrations = Object.entries(integrationConfig).map(([id, config]) => ({
    id: id as keyof typeof integrationConfig,
    ...config,
  }));

  // Sort to show recommended first
  const sortedIntegrations = [...integrations].sort((a, b) => {
    const aRec = isRecommended(a.id);
    const bRec = isRecommended(b.id);
    if (aRec && !bRec) return -1;
    if (!aRec && bRec) return 1;
    return 0;
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 4
                ? "w-8 bg-primary-500"
                : "w-4 bg-accent"
            }`}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Connect your tools
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Connect the services you use. All integrations are optional -
            you can always add more later from settings.
          </p>
        </div>

        {/* Integration grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {sortedIntegrations.map((integration, index) => {
            const isConnected = connectionStatus[integration.id] || data.connections[integration.id];
            const recommended = isRecommended(integration.id);

            return (
              <motion.div
                key={integration.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * index }}
                className={`relative p-5 rounded-xl border transition-all ${
                  isConnected
                    ? "bg-muted/80 border-green-500/50 ring-2 ring-green-500/20"
                    : recommended
                    ? "bg-muted/50 border-primary-500/30"
                    : "bg-muted/30 border-border/50"
                }`}
              >
                {/* Recommended badge */}
                {recommended && !isConnected && (
                  <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-primary-500/20 border border-primary-500/30 text-primary-400 text-xs flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Recommended
                  </div>
                )}

                {/* Connected badge */}
                {isConnected && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  </div>
                )}

                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${integration.color} flex items-center justify-center mb-4 ${integration.id === 'google' ? '' : ''}`}>
                  <integration.icon className={`w-6 h-6 ${integration.id === 'google' ? '' : 'text-foreground'}`} />
                </div>

                <h3 className="font-semibold text-foreground mb-1">{integration.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{integration.description}</p>

                {isConnected ? (
                  <div className="text-sm text-green-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Connected
                  </div>
                ) : (
                  <button
                    onClick={() => handleConnect(integration.id)}
                    disabled={connecting === integration.id}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-muted text-foreground text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {connecting === integration.id ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        Connect
                        <ExternalLink className="w-3 h-3" />
                      </>
                    )}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Info box */}
        <div className="bg-muted/20 border border-border/30 rounded-xl p-4 mb-8">
          <p className="text-sm text-muted-foreground text-center">
            Don&apos;t see your tool? We&apos;re adding new integrations regularly.
            You can also connect more tools from Settings after onboarding.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-border">
          <button
            onClick={() => router.push("/onboarding/workspace")}
            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/onboarding/invite")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip all
            </button>
            <button
              onClick={handleContinue}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/25"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Jira Modal */}
      <AnimatePresence>
        <JiraModal
          isOpen={showJiraModal}
          onClose={() => {
            setShowJiraModal(false);
            setModalError(null);
          }}
          onConnect={handleJiraConnect}
          isLoading={modalLoading}
          error={modalError}
        />
      </AnimatePresence>

      {/* Linear Modal */}
      <AnimatePresence>
        <LinearModal
          isOpen={showLinearModal}
          onClose={() => {
            setShowLinearModal(false);
            setModalError(null);
          }}
          onConnect={handleLinearConnect}
          isLoading={modalLoading}
          error={modalError}
        />
      </AnimatePresence>
    </div>
  );
}
