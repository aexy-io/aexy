"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  GitBranch,
  Rocket,
  Briefcase,
  Bot,
  Users,
  BookOpen,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";

const useCases = [
  {
    id: "engineering",
    icon: GitBranch,
    title: "Engineering",
    description: "Sprint planning, standups, and developer analytics",
    color: "from-green-500 to-emerald-600",
    selectedBg: "bg-green-500/10 border-green-500/50 ring-green-500/20",
    pillColor: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    pillSelectedColor: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/40",
    features: ["Sprint Board", "Standups & Blockers", "Developer Insights", "Uptime Monitoring", "On-Call", "Tickets"],
    popular: true,
  },
  {
    id: "gtm",
    icon: Rocket,
    title: "GTM & Growth",
    description: "Lead scoring, visitor tracking, and go-to-market ops",
    color: "from-orange-500 to-amber-600",
    selectedBg: "bg-orange-500/10 border-orange-500/50 ring-orange-500/20",
    pillColor: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    pillSelectedColor: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40",
    features: ["Lead Scoring & ICP", "Visitor Tracking", "Email Sequences", "ABM", "Competitor Intel", "Intent Signals"],
    popular: false,
  },
  {
    id: "sales",
    icon: Briefcase,
    title: "CRM & Sales",
    description: "Contact management, deal pipeline, and scheduling",
    color: "from-blue-500 to-blue-600",
    selectedBg: "bg-blue-500/10 border-blue-500/50 ring-blue-500/20",
    pillColor: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    pillSelectedColor: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40",
    features: ["Contacts & Deals", "Pipeline", "Booking", "Email Marketing", "Calendar"],
    popular: false,
  },
  {
    id: "ai",
    icon: Bot,
    title: "AI & Agents",
    description: "Email agents, sales bots, and workflow automation",
    color: "from-cyan-500 to-teal-600",
    selectedBg: "bg-cyan-500/10 border-cyan-500/50 ring-cyan-500/20",
    pillColor: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
    pillSelectedColor: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/40",
    features: ["Email Agents", "Sales Bots", "Automations", "Multi-LLM", "Writing Style AI"],
    popular: false,
  },
  {
    id: "people",
    icon: Users,
    title: "People & HR",
    description: "Reviews, hiring, learning, and workforce management",
    color: "from-rose-500 to-pink-600",
    selectedBg: "bg-rose-500/10 border-rose-500/50 ring-rose-500/20",
    pillColor: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    pillSelectedColor: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40",
    features: ["Reviews", "Hiring & Assessments", "Learning Paths", "Leave", "Compliance"],
    popular: false,
  },
  {
    id: "knowledge",
    icon: BookOpen,
    title: "Knowledge & Data",
    description: "Docs, databases, forms, and reporting",
    color: "from-purple-500 to-violet-600",
    selectedBg: "bg-purple-500/10 border-purple-500/50 ring-purple-500/20",
    pillColor: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    pillSelectedColor: "bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/40",
    features: ["Docs & Wiki", "Tables", "Forms", "Reports & Exports"],
    popular: false,
  },
];

export default function UseCaseSelection() {
  const router = useRouter();
  const { data, updateData, setCurrentStep } = useOnboarding();
  const [allSelected, setAllSelected] = useState(false);

  useEffect(() => {
    setCurrentStep(2);
  }, [setCurrentStep]);

  useEffect(() => {
    setAllSelected(useCases.every(uc => data.useCases.includes(uc.id)));
  }, [data.useCases]);

  const toggleUseCase = (useCaseId: string) => {
    const current = data.useCases;
    if (current.includes(useCaseId)) {
      updateData({ useCases: current.filter(uc => uc !== useCaseId) });
    } else {
      updateData({ useCases: [...current, useCaseId] });
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      updateData({ useCases: [] });
    } else {
      updateData({ useCases: useCases.map(uc => uc.id) });
    }
  };

  const handleContinue = () => {
    router.push("/onboarding/workspace");
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 2
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
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-3">
            What will you use Aexy for?
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Select all that apply. This helps us recommend the right integrations
            and customize your experience.
          </p>
        </div>

        {/* Select All + Counter */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={toggleAll}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              allSelected
                ? "bg-primary-500/10 border-primary-500/30 text-primary-600 dark:text-primary-400"
                : "bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {allSelected ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <div className="w-4 h-4 rounded border-2 border-current opacity-50" />
            )}
            Select All
          </button>

          <span className="text-sm text-muted-foreground">
            {data.useCases.length} of {useCases.length} selected
          </span>
        </div>

        {/* Use case grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {useCases.map((useCase, index) => {
            const isSelected = data.useCases.includes(useCase.id);
            return (
              <motion.button
                key={useCase.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * index }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleUseCase(useCase.id)}
                className={`relative p-5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? `${useCase.selectedBg} ring-2`
                    : "bg-muted/30 border-border/50 hover:border-border"
                }`}
              >
                {/* Badges */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {useCase.popular && !isSelected && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Popular
                    </span>
                  )}
                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-primary-400" />
                  )}
                </div>

                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${useCase.color} flex items-center justify-center mb-4`}>
                  <useCase.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{useCase.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{useCase.description}</p>

                {/* Feature pills */}
                <div className="flex flex-wrap gap-1.5">
                  {useCase.features.map((feature) => (
                    <span
                      key={feature}
                      className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                        isSelected ? useCase.pillSelectedColor : useCase.pillColor
                      }`}
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-border">
          <button
            onClick={() => router.push("/onboarding")}
            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <button
            onClick={handleContinue}
            disabled={data.useCases.length === 0}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              data.useCases.length > 0
                ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 shadow-lg shadow-primary-500/25"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
