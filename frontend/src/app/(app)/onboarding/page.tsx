"use client";

import { useRouter } from "next/navigation";
import {
  GitBranch,
  Users,
  BarChart3,
  Zap,
  ArrowRight,
  Sparkles,
  Mail,
  Target,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "./OnboardingContext";
import { useEffect } from "react";

export default function OnboardingWelcome() {
  const router = useRouter();
  const { setCurrentStep } = useOnboarding();

  useEffect(() => {
    setCurrentStep(1);
  }, [setCurrentStep]);

  const features = [
    {
      icon: GitBranch,
      title: "Development Analytics",
      description: "Track commits, PRs, and code reviews across your team",
      color: "from-green-500 to-emerald-600",
    },
    {
      icon: Users,
      title: "CRM & Contacts",
      description: "Manage relationships with customers and partners",
      color: "from-blue-500 to-blue-600",
    },
    {
      icon: Target,
      title: "Deals Pipeline",
      description: "Track sales opportunities and close deals faster",
      color: "from-purple-500 to-purple-600",
    },
    {
      icon: BarChart3,
      title: "Team Insights",
      description: "Understand productivity and collaboration patterns",
      color: "from-amber-500 to-amber-600",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        {/* Left side - Welcome message */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            <span>Welcome to Aexy</span>
          </div>

          <h1 className="text-4xl font-bold text-foreground mb-4">
            Your team&apos;s command center
          </h1>

          <p className="text-lg text-muted-foreground mb-8">
            Aexy brings together development analytics, CRM, and team collaboration
            in one place. Let&apos;s set up your workspace in just a few steps.
          </p>

          <div className="space-y-4 mb-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
                className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-border/50 transition-colors"
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center flex-shrink-0`}>
                  <feature.icon className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <button
            onClick={() => router.push("/onboarding/use-case")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>

        {/* Right side - Preview animation */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="hidden lg:block"
        >
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 to-blue-500/20 blur-3xl rounded-full" />

            {/* Preview card */}
            <div className="relative bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-foreground" />
                  </div>
                  <span className="font-medium text-foreground">Dashboard</span>
                </div>
              </div>

              {/* Stats preview */}
              <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Commits", value: "847", change: "+12%" },
                  { label: "PRs Merged", value: "156", change: "+8%" },
                  { label: "Contacts", value: "2.4k", change: "+23%" },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.5 + 0.1 * i }}
                    className="bg-muted/50 rounded-lg p-3"
                  >
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-green-400">{stat.change}</p>
                  </motion.div>
                ))}
              </div>

              {/* Activity preview */}
              <div className="px-6 pb-6">
                <p className="text-xs text-muted-foreground mb-3">Recent Activity</p>
                {[
                  { icon: GitBranch, text: "PR #234 merged to main", time: "2m ago", color: "text-green-600 dark:text-green-400" },
                  { icon: Mail, text: "New email from Acme Corp", time: "15m ago", color: "text-blue-600 dark:text-blue-400" },
                  { icon: Zap, text: "Deal moved to Negotiation", time: "1h ago", color: "text-amber-600 dark:text-amber-400" },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.8 + 0.1 * i }}
                    className="flex items-center gap-3 py-2"
                  >
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                    <span className="text-sm text-foreground flex-1">{item.text}</span>
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Floating elements */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 1.2 }}
              className="absolute -top-4 -right-4 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs flex items-center gap-2"
            >
              <GitBranch className="w-3 h-3" />
              12 commits today
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 1.4 }}
              className="absolute -bottom-4 -left-4 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs flex items-center gap-2"
            >
              <Zap className="w-3 h-3" />
              3 deals closing soon
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
