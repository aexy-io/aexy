"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Mail,
  Calendar,
  Users,
  Sparkles,
  CheckCircle2,
  Shield,
  Lock,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";

export default function GmailSettings() {
  const router = useRouter();
  const { data, updateGoogleSettings, setCurrentStep } = useOnboarding();

  useEffect(() => {
    setCurrentStep(5);
  }, [setCurrentStep]);

  const features = [
    {
      icon: Mail,
      title: "Email Sync",
      description: "Automatically sync emails and create contacts from conversations",
      key: "gmail" as const,
    },
    {
      icon: Calendar,
      title: "Calendar Sync",
      description: "Track meetings and events linked to your contacts",
      key: "calendar" as const,
    },
    {
      icon: Users,
      title: "Auto-Create Contacts",
      description: "Automatically create people and companies from email addresses",
      key: "autoCreateContacts" as const,
    },
    {
      icon: Sparkles,
      title: "AI Enrichment",
      description: "Extract contact details from email signatures using AI",
      key: "enrichWithAI" as const,
    },
  ];

  const privacyPoints = [
    "We only read email metadata and signatures",
    "Your data stays in your workspace",
    "You can disconnect anytime",
    "We never share your data with third parties",
  ];

  const handleContinue = () => {
    router.push("/onboarding/invite");
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 5
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
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-4">
            <CheckCircle2 className="w-4 h-4" />
            <span>Google Connected</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Configure Google Sync
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Choose what data to sync from your Google account to populate
            your CRM automatically.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left - Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Sync Settings
            </h3>
            {features.map((feature, index) => (
              <motion.div
                key={feature.key}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
                className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border/50"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500/20 to-primary-600/20 border border-primary-500/20 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground">{feature.title}</h4>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
                <button
                  onClick={() => updateGoogleSettings({ [feature.key]: !data.googleSettings[feature.key] })}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    data.googleSettings[feature.key] ? "bg-primary-500" : "bg-accent"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      data.googleSettings[feature.key] ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </motion.div>
            ))}
          </div>

          {/* Right - Preview & Privacy */}
          <div className="space-y-6">
            {/* What happens next */}
            <div className="p-5 rounded-xl bg-primary-500/5 border border-primary-500/20">
              <h4 className="font-medium text-foreground mb-4">What happens next?</h4>
              <ul className="space-y-3">
                {[
                  "Your recent emails will be scanned for contacts",
                  "People & companies will be created automatically",
                  "Calendar events will appear in your CRM timeline",
                  "Email threads will be linked to contacts",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Privacy notice */}
            <div className="p-5 rounded-xl bg-muted/20 border border-border/30">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-foreground mb-3">Your privacy matters</h4>
                  <ul className="space-y-2">
                    {privacyPoints.map((point, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Lock className="w-3 h-3 text-muted-foreground" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 mt-8 border-t border-border">
          <button
            onClick={() => {
              if (data.connections.github) {
                router.push("/onboarding/repos");
              } else {
                router.push("/onboarding/connect");
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleContinue}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
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
    </div>
  );
}
