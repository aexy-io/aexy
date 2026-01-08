"use client";

import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  Target,
  Zap,
  ArrowRight,
  Sparkles,
  BarChart3,
  Mail
} from "lucide-react";
import { motion } from "framer-motion";

export default function CRMOnboardingWelcome() {
  const router = useRouter();

  const features = [
    {
      icon: Building2,
      title: "Companies & People",
      description: "Track all your contacts and organizations",
      color: "from-blue-500 to-blue-600",
    },
    {
      icon: Target,
      title: "Deals Pipeline",
      description: "Manage your sales funnel visually",
      color: "from-green-500 to-green-600",
    },
    {
      icon: Zap,
      title: "Automations",
      description: "Automate workflows and sequences",
      color: "from-amber-500 to-amber-600",
    },
    {
      icon: BarChart3,
      title: "Reports & Insights",
      description: "Track performance with analytics",
      color: "from-purple-500 to-purple-600",
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
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            <span>Welcome to CRM</span>
          </div>

          <h1 className="text-4xl font-bold text-white mb-4">
            Build stronger customer relationships
          </h1>

          <p className="text-lg text-slate-400 mb-8">
            Aexy CRM helps you manage your contacts, track deals, and automate
            your workflows. Let&apos;s set up your workspace in just a few steps.
          </p>

          <div className="space-y-4 mb-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
                className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:border-slate-600/50 transition-colors"
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center flex-shrink-0`}>
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-white">{feature.title}</h3>
                  <p className="text-sm text-slate-400">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <button
            onClick={() => router.push("/crm/onboarding/use-case")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
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
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-3xl rounded-full" />

            {/* Preview card */}
            <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-medium text-white">People</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 rounded-lg bg-slate-800 text-xs text-slate-400">+ Add Person</div>
                </div>
              </div>

              {/* Table preview */}
              <div className="p-4">
                {/* Column headers */}
                <div className="grid grid-cols-4 gap-4 px-4 py-2 text-xs text-slate-500 border-b border-slate-800">
                  <div>Name</div>
                  <div>Company</div>
                  <div>Status</div>
                  <div>Last Contact</div>
                </div>

                {/* Sample rows */}
                {[
                  { name: "Sarah Chen", company: "Acme Corp", status: "Customer", statusColor: "green", time: "2 hours ago" },
                  { name: "Alex Rivera", company: "TechStart", status: "Lead", statusColor: "blue", time: "Yesterday" },
                  { name: "Jordan Kim", company: "DataFlow", status: "Prospect", statusColor: "amber", time: "3 days ago" },
                  { name: "Morgan Blake", company: "CloudSync", status: "Customer", statusColor: "green", time: "1 week ago" },
                ].map((row, i) => (
                  <motion.div
                    key={row.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.5 + 0.1 * i }}
                    className="grid grid-cols-4 gap-4 px-4 py-3 hover:bg-slate-800/50 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-xs text-white">
                        {row.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <span className="text-sm text-white">{row.name}</span>
                    </div>
                    <div className="text-sm text-slate-400 flex items-center">{row.company}</div>
                    <div className="flex items-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs bg-${row.statusColor}-500/10 text-${row.statusColor}-400 border border-${row.statusColor}-500/20`}>
                        {row.status}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 flex items-center">{row.time}</div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Floating elements */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="absolute -top-4 -right-4 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs flex items-center gap-2"
            >
              <Mail className="w-3 h-3" />
              3 new emails synced
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 1.2 }}
              className="absolute -bottom-4 -left-4 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs flex items-center gap-2"
            >
              <Zap className="w-3 h-3" />
              Automation triggered
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
