"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Building2,
  Users,
  Target,
  Zap,
  ArrowRight,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { crmApi, googleIntegrationApi, developerApi } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function OnboardingComplete() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [createdObjects, setCreatedObjects] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(5);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  useEffect(() => {
    const setupCRM = async () => {
      if (!currentWorkspace?.id) {
        // Wait for workspace to load
        return;
      }

      try {
        // Get onboarding data from localStorage
        const useCaseData = localStorage.getItem("crm_onboarding_usecase");
        const template = localStorage.getItem("crm_onboarding_template") || "blank";

        const useCase = useCaseData ? JSON.parse(useCaseData).useCase : null;
        const useCaseDetails = useCaseData ? JSON.parse(useCaseData).details : [];

        // Call API to seed CRM objects
        const result = await crmApi.objects.seedFromTemplate(
          currentWorkspace.id,
          template,
          useCase,
          useCaseDetails
        );

        setCreatedObjects(result.objects.map((o: { name: string }) => o.name));

        // Apply Google sync settings if connected
        const googleSettingsData = localStorage.getItem("crm_onboarding_google_settings");
        if (googleSettingsData) {
          const googleSettings = JSON.parse(googleSettingsData);

          // Check if Google is connected at developer level
          try {
            const developerStatus = await developerApi.getGoogleStatus();
            if (developerStatus.is_connected) {
              setSyncProgress("Linking Google account...");

              // First, create workspace integration from developer's Google connection
              try {
                await googleIntegrationApi.connectFromDeveloper(currentWorkspace.id);
              } catch (e) {
                console.warn("Failed to link developer Google:", e);
              }

              setSyncProgress("Configuring sync settings...");

              // Update workspace integration settings
              try {
                await googleIntegrationApi.updateSettings(currentWorkspace.id, {
                  gmail_sync_enabled: googleSettings.gmail,
                  calendar_sync_enabled: googleSettings.calendar,
                });

                // Trigger initial sync if enabled
                if (googleSettings.gmail) {
                  setSyncProgress("Syncing emails...");
                  try {
                    await googleIntegrationApi.gmail.sync(currentWorkspace.id, { full_sync: true });
                  } catch (e) {
                    console.warn("Gmail sync failed:", e);
                  }
                }

                if (googleSettings.calendar) {
                  setSyncProgress("Syncing calendar events...");
                  try {
                    await googleIntegrationApi.calendar.sync(currentWorkspace.id);
                  } catch (e) {
                    console.warn("Calendar sync failed:", e);
                  }
                }

                // Run AI enrichment if enabled
                if (googleSettings.enrichWithAI && googleSettings.gmail) {
                  setSyncProgress("Enriching contacts with AI...");
                  try {
                    await googleIntegrationApi.enrichContacts(currentWorkspace.id);
                  } catch (e) {
                    console.warn("Contact enrichment failed:", e);
                  }
                }

                setSyncProgress(null);
              } catch (e) {
                console.warn("Failed to apply Google settings:", e);
              }
            }
          } catch {
            // No Google connection
          }
        }

        setStatus("success");

        // Mark onboarding as complete
        localStorage.setItem("crm_onboarding_complete", "true");

        // Fire confetti
        try {
          const confetti = (await import("canvas-confetti")).default;
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#a855f7", "#6366f1", "#8b5cf6"],
          });
        } catch {
          // Confetti is optional
        }
      } catch (err) {
        console.error("Failed to setup CRM:", err);
        setError(err instanceof Error ? err.message : "Failed to setup CRM");
        setStatus("error");
      }
    };

    setupCRM();
  }, [currentWorkspace?.id]);

  // Countdown and redirect after success
  useEffect(() => {
    if (status !== "success") return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/crm");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, router]);

  const features = [
    { icon: Building2, label: "Objects & Records", color: "text-blue-600 dark:text-blue-400" },
    { icon: Users, label: "Contact Management", color: "text-green-600 dark:text-green-400" },
    { icon: Target, label: "Deal Pipeline", color: "text-amber-600 dark:text-amber-400" },
    { icon: Zap, label: "Automations", color: "text-purple-600 dark:text-purple-400" },
  ];

  if (status === "loading") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-3">
            Setting up your CRM...
          </h1>

          <p className="text-muted-foreground">
            {syncProgress || "Creating your objects and attributes based on your template selection."}
          </p>

          <div className="mt-8 space-y-2">
            <div className="h-1.5 w-48 mx-auto rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-purple-600"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-3">
            Something went wrong
          </h1>

          <p className="text-muted-foreground mb-6">
            {error || "We couldn't set up your CRM. Please try again."}
          </p>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => router.push("/crm/onboarding")}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Start over
            </button>
            <button
              onClick={() => {
                setStatus("loading");
                setError(null);
                window.location.reload();
              }}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium hover:from-purple-600 hover:to-purple-700 transition-all"
            >
              Try again
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30"
        >
          <CheckCircle2 className="w-10 h-10 text-white" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-bold text-foreground mb-3"
        >
          You&apos;re all set!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-lg text-muted-foreground mb-8"
        >
          Your CRM is ready to use. Start managing your relationships.
        </motion.p>

        {/* Created objects */}
        {createdObjects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-muted/30 border border-border/50 rounded-xl p-6 mb-8"
          >
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Objects created
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {createdObjects.map((name, index) => (
                <motion.span
                  key={name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="px-3 py-1.5 rounded-lg bg-muted/50 text-foreground text-sm"
                >
                  {name}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Features unlocked */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-muted/30 border border-border/50 rounded-xl p-6 mb-8"
        >
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
            <Sparkles className="w-4 h-4 text-purple-400" />
            Features unlocked
          </div>
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
              >
                <feature.icon className={`w-5 h-5 ${feature.color}`} />
                <span className="text-sm text-foreground">{feature.label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
        >
          <button
            onClick={() => router.push("/crm")}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
          >
            Go to CRM Dashboard
            <ArrowRight className="w-5 h-5" />
          </button>

          <p className="mt-4 text-sm text-muted-foreground">
            Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}...
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
