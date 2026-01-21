"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  GitBranch,
  Users,
  Heart,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";

const useCases = [
  {
    id: "developer",
    icon: GitBranch,
    title: "Development",
    description: "Track code, commits, PRs, and engineering metrics",
    color: "from-green-500 to-emerald-600",
    recommended: ["github"],
  },
  {
    id: "sales",
    icon: Users,
    title: "Sales & CRM",
    description: "Manage contacts, deals, and customer relationships",
    color: "from-blue-500 to-blue-600",
    recommended: ["google"],
  },
  {
    id: "customer-success",
    icon: Heart,
    title: "Customer Success",
    description: "Monitor customer health and drive retention",
    color: "from-purple-500 to-purple-600",
    recommended: ["google", "slack"],
  },
  {
    id: "full-team",
    icon: Layers,
    title: "Full Team",
    description: "All features - development, CRM, and collaboration",
    color: "from-amber-500 to-orange-600",
    recommended: ["github", "google", "slack"],
  },
];

export default function UseCaseSelection() {
  const router = useRouter();
  const { data, updateData, setCurrentStep } = useOnboarding();

  useEffect(() => {
    setCurrentStep(2);
  }, [setCurrentStep]);

  const toggleUseCase = (useCaseId: string) => {
    const current = data.useCases;
    if (current.includes(useCaseId)) {
      updateData({ useCases: current.filter(uc => uc !== useCaseId) });
    } else {
      updateData({ useCases: [...current, useCaseId] });
    }
  };

  const handleContinue = () => {
    router.push("/onboarding/workspace");
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 2
                ? "w-8 bg-primary-500"
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
          <h1 className="text-3xl font-bold text-white mb-3">
            What will you use Aexy for?
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            Select all that apply. This helps us recommend the right integrations
            and customize your experience.
          </p>
        </div>

        {/* Use case grid */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {useCases.map((useCase) => {
            const isSelected = data.useCases.includes(useCase.id);
            return (
              <motion.button
                key={useCase.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleUseCase(useCase.id)}
                className={`relative p-5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-slate-800/80 border-primary-500/50 ring-2 ring-primary-500/20"
                    : "bg-slate-800/30 border-slate-700/50 hover:border-slate-600/50"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-primary-400" />
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${useCase.color} flex items-center justify-center mb-4`}>
                  <useCase.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-white mb-1">{useCase.title}</h3>
                <p className="text-sm text-slate-400">{useCase.description}</p>
              </motion.button>
            );
          })}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-800">
          <button
            onClick={() => router.push("/onboarding")}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
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
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
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
