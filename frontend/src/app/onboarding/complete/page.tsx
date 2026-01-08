"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ArrowRight,
  GitBranch,
  Users,
  BarChart3,
  Settings,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";
import confetti from "canvas-confetti";

export default function OnboardingComplete() {
  const router = useRouter();
  const { data, setCurrentStep, resetOnboarding } = useOnboarding();

  useEffect(() => {
    setCurrentStep(7);

    // Trigger confetti
    const duration = 2000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ["#8b5cf6", "#6366f1", "#3b82f6"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ["#8b5cf6", "#6366f1", "#3b82f6"],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, [setCurrentStep]);

  const getQuickLinks = () => {
    const links = [];

    if (data.connections.github || data.githubRepos.length > 0) {
      links.push({
        icon: GitBranch,
        title: "View Repositories",
        description: "See your connected repos and activity",
        href: "/repositories",
        color: "from-green-500 to-emerald-600",
      });
    }

    if (data.connections.google || data.useCases.includes("sales") || data.useCases.includes("customer-success")) {
      links.push({
        icon: Users,
        title: "Go to CRM",
        description: "Start managing contacts and deals",
        href: "/crm",
        color: "from-blue-500 to-blue-600",
      });
    }

    links.push({
      icon: BarChart3,
      title: "View Dashboard",
      description: "See your workspace overview",
      href: "/dashboard",
      color: "from-purple-500 to-purple-600",
    });

    links.push({
      icon: Settings,
      title: "Settings",
      description: "Configure integrations and preferences",
      href: "/settings",
      color: "from-slate-500 to-slate-600",
    });

    return links;
  };

  const handleGoToDashboard = () => {
    // Mark onboarding as complete
    localStorage.setItem("aexy_onboarding_complete", "true");
    resetOnboarding();
    router.push("/dashboard");
  };

  const quickLinks = getQuickLinks();

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator - all complete */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className="h-1.5 w-8 rounded-full bg-primary-500 transition-all"
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircle2 className="w-10 h-10 text-white" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            <span>Setup Complete</span>
          </div>

          <h1 className="text-4xl font-bold text-white mb-4">
            You&apos;re all set!
          </h1>

          <p className="text-lg text-slate-400 mb-10 max-w-lg mx-auto">
            Your workspace is ready. Here are some quick ways to get started
            with Aexy.
          </p>
        </motion.div>

        {/* Quick links grid */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10 max-w-2xl mx-auto">
          {quickLinks.map((link, index) => (
            <motion.button
              key={link.href}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 + index * 0.1 }}
              onClick={() => {
                localStorage.setItem("aexy_onboarding_complete", "true");
                router.push(link.href);
              }}
              className="flex items-start gap-4 p-5 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:border-slate-600/50 transition-all text-left group"
            >
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${link.color} flex items-center justify-center flex-shrink-0`}>
                <link.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-white group-hover:text-primary-400 transition-colors">
                  {link.title}
                </h3>
                <p className="text-sm text-slate-400">{link.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-primary-400 transition-colors mt-1" />
            </motion.button>
          ))}
        </div>

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
          className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-6 mb-10 max-w-2xl mx-auto"
        >
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
            Setup Summary
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            {data.useCases.map((uc) => (
              <span
                key={uc}
                className="px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-sm"
              >
                {uc.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            ))}
            {Object.entries(data.connections)
              .filter(([, connected]) => connected)
              .map(([name]) => (
                <span
                  key={name}
                  className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm"
                >
                  {name.charAt(0).toUpperCase() + name.slice(1)} Connected
                </span>
              ))}
            {data.githubRepos.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400 text-sm">
                {data.githubRepos.length} Repos Selected
              </span>
            )}
            {data.invitedEmails.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
                {data.invitedEmails.length} Invites Sent
              </span>
            )}
          </div>
        </motion.div>

        {/* Main CTA */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.7 }}
          onClick={handleGoToDashboard}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium text-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
        >
          Go to Dashboard
          <ArrowRight className="w-5 h-5" />
        </motion.button>
      </motion.div>
    </div>
  );
}
