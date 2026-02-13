"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Mail,
  Calendar,
  Sparkles,
  CheckCircle2,
  Shield,
  Users,
  RefreshCw,
  Lock,
} from "lucide-react";
import { motion } from "framer-motion";
import { useWorkspace } from "@/hooks/useWorkspace";
import { api, developerApi } from "@/lib/api";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function ConnectGoogleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionEmail, setConnectionEmail] = useState<string | null>(null);
  const [syncSettings, setSyncSettings] = useState({
    gmail: true,
    calendar: true,
    autoCreateContacts: true,
    enrichWithAI: true,
  });

  // Check for callback status
  useEffect(() => {
    const googleStatus = searchParams.get("google");
    if (googleStatus === "connected") {
      setIsConnected(true);
      // Fetch the connected email
      fetchConnectionStatus();
    }
  }, [searchParams]);

  const fetchConnectionStatus = async () => {
    // First check if Google is connected at developer level (from main onboarding)
    try {
      const developerGoogleStatus = await developerApi.getGoogleStatus();
      if (developerGoogleStatus.is_connected) {
        setIsConnected(true);
        setConnectionEmail(developerGoogleStatus.google_email);
        return; // Already connected at developer level
      }
    } catch {
      // Continue to check workspace level
    }

    // Then check workspace level
    if (!currentWorkspace?.id) return;
    try {
      const response = await api.get(`/workspaces/${currentWorkspace.id}/integrations/google/status`);
      if (response.data.is_connected) {
        setIsConnected(true);
        setConnectionEmail(response.data.google_email);
      }
    } catch {
      // Not connected yet
    }
  };

  useEffect(() => {
    fetchConnectionStatus();
  }, [currentWorkspace?.id]);

  const handleConnect = async () => {
    if (!currentWorkspace?.id) return;

    setIsConnecting(true);
    try {
      const response = await api.get(`/workspaces/${currentWorkspace.id}/integrations/google/connect`, {
        params: {
          redirect_url: window.location.href,
        },
      });
      // Redirect to Google OAuth
      window.location.href = response.data.auth_url;
    } catch (error) {
      console.error("Failed to get connect URL:", error);
      setIsConnecting(false);
    }
  };

  const handleContinue = () => {
    // Save sync settings
    localStorage.setItem("crm_onboarding_google_settings", JSON.stringify(syncSettings));
    router.push("/crm/onboarding/invite");
  };

  const features = [
    {
      icon: Mail,
      title: "Email Sync",
      description: "Automatically sync emails and create contacts from conversations",
      enabled: syncSettings.gmail,
      onToggle: () => setSyncSettings(s => ({ ...s, gmail: !s.gmail })),
    },
    {
      icon: Calendar,
      title: "Calendar Sync",
      description: "Track meetings and events linked to your contacts",
      enabled: syncSettings.calendar,
      onToggle: () => setSyncSettings(s => ({ ...s, calendar: !s.calendar })),
    },
    {
      icon: Users,
      title: "Auto-Create Contacts",
      description: "Automatically create people and companies from email addresses",
      enabled: syncSettings.autoCreateContacts,
      onToggle: () => setSyncSettings(s => ({ ...s, autoCreateContacts: !s.autoCreateContacts })),
    },
    {
      icon: Sparkles,
      title: "AI Enrichment",
      description: "Extract contact details from email signatures using AI",
      enabled: syncSettings.enrichWithAI,
      onToggle: () => setSyncSettings(s => ({ ...s, enrichWithAI: !s.enrichWithAI })),
    },
  ];

  const privacyPoints = [
    "We only read email metadata and signatures",
    "Your data stays in your workspace",
    "You can disconnect anytime",
    "We never share your data with third parties",
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator - now 6 steps */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 4
                ? "w-8 bg-purple-500"
                : "w-4 bg-slate-700"
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
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            <span>Recommended</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Connect Google
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            Sync your Gmail and Calendar to automatically populate your CRM
            with contacts, emails, and meetings.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left - Connect card */}
          <div className="space-y-6">
            {/* Connection status card */}
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6">
              {isConnected ? (
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Connected</h3>
                  {connectionEmail && (
                    <p className="text-slate-400 mb-4">{connectionEmail}</p>
                  )}
                  <button
                    onClick={() => setIsConnected(false)}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 inline mr-1" />
                    Connect different account
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <GoogleIcon className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Connect your Google account
                  </h3>
                  <p className="text-sm text-slate-400 mb-6">
                    We&apos;ll sync your emails and calendar events to build your CRM automatically.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl bg-white text-slate-900 font-medium hover:bg-slate-100 transition-all shadow-lg disabled:opacity-50"
                  >
                    {isConnecting ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <GoogleIcon className="w-5 h-5" />
                    )}
                    {isConnecting ? "Connecting..." : "Continue with Google"}
                  </button>
                </div>
              )}
            </div>

            {/* Privacy notice */}
            <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Your privacy matters</h4>
                  <ul className="space-y-1">
                    {privacyPoints.map((point, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                        <Lock className="w-3 h-3 text-slate-500" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right - Features & Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
              Sync Settings
            </h3>
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
                className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-white">{feature.title}</h4>
                  <p className="text-sm text-slate-400">{feature.description}</p>
                </div>
                <button
                  onClick={feature.onToggle}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    feature.enabled ? "bg-purple-500" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      feature.enabled ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </motion.div>
            ))}

            {/* What gets synced */}
            <div className="mt-6 p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <h4 className="text-sm font-medium text-purple-400 mb-2">What happens next?</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400" />
                  Your recent emails will be scanned for contacts
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400" />
                  People & companies will be created automatically
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400" />
                  Calendar events will appear in your CRM timeline
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 mt-8 border-t border-slate-800">
          <button
            onClick={() => router.push("/crm/onboarding/import")}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleContinue}
              className="text-slate-400 hover:text-white transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={handleContinue}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/25"
            >
              {isConnected ? "Continue" : "Skip & Continue"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function ConnectGoogle() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" /></div>}>
      <ConnectGoogleContent />
    </Suspense>
  );
}
