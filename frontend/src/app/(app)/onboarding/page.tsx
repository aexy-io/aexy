"use client";

import { useRouter } from "next/navigation";
import {
  GitBranch,
  Rocket,
  Briefcase,
  Bot,
  Users,
  BookOpen,
  BarChart3,
  ArrowRight,
  Sparkles,
  Zap,
  Target,
  Mail,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "./OnboardingContext";
import { useEffect } from "react";

const roles = [
  { id: "engineering-lead", label: "Engineering Lead" },
  { id: "manager", label: "Manager" },
  { id: "ic", label: "Individual Contributor" },
  { id: "other", label: "Other" },
];

const moduleGroups = [
  {
    icon: GitBranch,
    title: "Engineering",
    description: "Sprint planning, standups, and developer analytics",
    color: "from-green-500 to-emerald-600",
  },
  {
    icon: Rocket,
    title: "GTM & Growth",
    description: "Lead scoring, visitor tracking, and go-to-market ops",
    color: "from-orange-500 to-amber-600",
  },
  {
    icon: Briefcase,
    title: "CRM & Sales",
    description: "Contacts, deals, pipeline, and booking",
    color: "from-blue-500 to-blue-600",
  },
  {
    icon: Bot,
    title: "AI & Agents",
    description: "Email agents, sales bots, and automations",
    color: "from-cyan-500 to-teal-600",
  },
  {
    icon: Users,
    title: "People & HR",
    description: "Reviews, hiring, learning, and compliance",
    color: "from-rose-500 to-pink-600",
  },
  {
    icon: BookOpen,
    title: "Knowledge & Data",
    description: "Docs, databases, forms, and reporting",
    color: "from-purple-500 to-violet-600",
  },
];

export default function OnboardingWelcome() {
  const router = useRouter();
  const { data, updateData, setCurrentStep } = useOnboarding();

  useEffect(() => {
    setCurrentStep(1);
  }, [setCurrentStep]);

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

          <p className="text-lg text-muted-foreground mb-6">
            Aexy brings together engineering, GTM, CRM, AI agents, and more
            in one platform. Let&apos;s set up your workspace in just a few steps.
          </p>

          {/* Role selector */}
          <div className="mb-8">
            <p className="text-sm font-medium text-muted-foreground mb-3">I&apos;m a...</p>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => updateData({ role: role.id })}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    data.role === role.id
                      ? "bg-primary-500/10 border-primary-500/40 text-primary-600 dark:text-primary-400"
                      : "bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* Module group previews */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {moduleGroups.map((group, index) => (
              <motion.div
                key={group.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
                className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50"
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${group.color} flex items-center justify-center flex-shrink-0`}>
                  <group.icon className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-foreground text-sm">{group.title}</h3>
                  <p className="text-xs text-muted-foreground leading-tight">{group.description}</p>
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
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 to-blue-500/10 dark:from-primary-500/20 dark:to-blue-500/20 blur-3xl rounded-full" />

            {/* Preview card */}
            <div className="relative bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-medium text-foreground">Dashboard</span>
                </div>
              </div>

              {/* Stats preview */}
              <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Active Leads", value: "342", change: "+18%" },
                  { label: "PRs Merged", value: "156", change: "+8%" },
                  { label: "Agent Actions", value: "89", change: "+34%" },
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
                    <p className="text-xs text-green-600 dark:text-green-400">{stat.change}</p>
                  </motion.div>
                ))}
              </div>

              {/* Activity preview */}
              <div className="px-6 pb-6">
                <p className="text-xs text-muted-foreground mb-3">Recent Activity</p>
                {[
                  { icon: Target, text: "Lead score updated for Acme Corp", time: "2m ago", color: "text-orange-600 dark:text-orange-500" },
                  { icon: Bot, text: "Email agent replied to inquiry", time: "15m ago", color: "text-cyan-600 dark:text-cyan-500" },
                  { icon: GitBranch, text: "PR #234 merged to main", time: "32m ago", color: "text-green-600 dark:text-green-500" },
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
              className="absolute -top-4 -right-4 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-xs flex items-center gap-2"
            >
              <GitBranch className="w-3 h-3" />
              12 commits today
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 1.4 }}
              className="absolute -bottom-4 -left-4 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 text-xs flex items-center gap-2"
            >
              <Zap className="w-3 h-3" />
              5 leads qualified today
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
