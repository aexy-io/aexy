"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  DollarSign,
  Heart,
  Users,
  Link2,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";

const useCases = [
  {
    id: "sales",
    icon: DollarSign,
    title: "Sales",
    description: "Track leads, manage pipeline, and close deals faster",
    color: "from-green-500 to-emerald-600",
    details: [
      { id: "b2b", label: "B2B Sales" },
      { id: "b2c", label: "B2C Sales" },
      { id: "enterprise", label: "Enterprise" },
      { id: "smb", label: "SMB" },
    ],
  },
  {
    id: "customer-success",
    icon: Heart,
    title: "Customer Success",
    description: "Monitor customer health and drive retention",
    color: "from-blue-500 to-blue-600",
    details: [
      { id: "onboarding", label: "Onboarding" },
      { id: "retention", label: "Retention" },
      { id: "expansion", label: "Expansion" },
      { id: "support", label: "Support" },
    ],
  },
  {
    id: "recruiting",
    icon: Users,
    title: "Recruiting",
    description: "Manage candidates and hiring pipeline",
    color: "from-purple-500 to-purple-600",
    details: [
      { id: "tech", label: "Tech Hiring" },
      { id: "executive", label: "Executive Search" },
      { id: "agency", label: "Agency" },
      { id: "internal", label: "Internal HR" },
    ],
  },
  {
    id: "partnerships",
    icon: Link2,
    title: "Partnerships",
    description: "Track partners, integrations, and collaborations",
    color: "from-amber-500 to-orange-600",
    details: [
      { id: "integrations", label: "Integrations" },
      { id: "resellers", label: "Resellers" },
      { id: "affiliates", label: "Affiliates" },
      { id: "strategic", label: "Strategic" },
    ],
  },
  {
    id: "custom",
    icon: Layers,
    title: "Something Else",
    description: "Build a custom CRM for your specific needs",
    color: "from-slate-500 to-slate-600",
    details: [],
  },
];

export default function UseCaseSelection() {
  const router = useRouter();
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<string[]>([]);

  const activeUseCase = useCases.find(uc => uc.id === selectedUseCase);

  const toggleDetail = (detailId: string) => {
    setSelectedDetails(prev =>
      prev.includes(detailId)
        ? prev.filter(d => d !== detailId)
        : [...prev, detailId]
    );
  };

  const handleContinue = () => {
    // Store in localStorage or context
    localStorage.setItem("crm_onboarding_usecase", JSON.stringify({
      useCase: selectedUseCase,
      details: selectedDetails,
    }));
    router.push("/crm/onboarding/template");
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator - 6 steps with connect */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step === 1
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
          <h1 className="text-3xl font-bold text-white mb-3">
            What will you use CRM for?
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            Tell us about your use case so we can customize your experience
            with the right templates and features.
          </p>
        </div>

        {/* Use case grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {useCases.map((useCase) => {
            const isSelected = selectedUseCase === useCase.id;
            return (
              <motion.button
                key={useCase.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedUseCase(useCase.id);
                  setSelectedDetails([]);
                }}
                className={`relative p-5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-slate-800/80 border-purple-500/50 ring-2 ring-purple-500/20"
                    : "bg-slate-800/30 border-slate-700/50 hover:border-slate-600/50"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-purple-400" />
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

        {/* Detail selection */}
        {activeUseCase && activeUseCase.details.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-8"
          >
            <p className="text-sm text-slate-400 mb-3">
              Tell us more about your {activeUseCase.title.toLowerCase()} focus:
            </p>
            <div className="flex flex-wrap gap-2">
              {activeUseCase.details.map((detail) => {
                const isSelected = selectedDetails.includes(detail.id);
                return (
                  <button
                    key={detail.id}
                    onClick={() => toggleDetail(detail.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isSelected
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600/50"
                    }`}
                  >
                    {detail.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-800">
          <button
            onClick={() => router.push("/crm/onboarding")}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <button
            onClick={handleContinue}
            disabled={!selectedUseCase}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              selectedUseCase
                ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/25"
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
