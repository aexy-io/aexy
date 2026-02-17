"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Users,
  DollarSign,
  LayoutGrid,
  CheckCircle2,
  Eye,
  Search,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Template {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tags: string[];
  primaryObject: "companies" | "people";
}

interface UseCase {
  id: string;
  label: string;
  color: string;
}

const useCases: UseCase[] = [
  { id: "sales", label: "Sales", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { id: "investing", label: "Investing", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { id: "recruiting", label: "Recruiting", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { id: "marketing", label: "Marketing", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  { id: "customer-success", label: "Customer Success", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { id: "fundraising", label: "Fundraising", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { id: "finance", label: "Finance", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  { id: "hr", label: "HR", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { id: "operations", label: "Operations", color: "bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30" },
  { id: "pr", label: "PR", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  { id: "startups", label: "Startups", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  { id: "venture-capital", label: "Venture Capital", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
  { id: "content", label: "Content", color: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
];

const templates: Template[] = [
  {
    id: "sales",
    name: "Sales",
    emoji: "📌",
    description: "Everything a Sales team needs to track their deals. Record important data like contract value, point of contact, and deal stage alongside automatic relationship analytics.",
    tags: ["sales"],
    primaryObject: "companies",
  },
  {
    id: "customer-success",
    name: "Customer success",
    emoji: "📈",
    description: "Drive your business forward with this tailored workflow for Customer Success. From onboarding to renewal, monitor your customer journey and the overall health of your customer relationships.",
    tags: ["customer-success"],
    primaryObject: "companies",
  },
  {
    id: "recruiting",
    name: "Recruiting",
    emoji: "🔎",
    description: "A complete solution for recruiting new hires. Includes a Table to record candidates, a Kanban to track them through your stages, and a detailed view of key phases.",
    tags: ["venture-capital", "hr", "recruiting"],
    primaryObject: "people",
  },
  {
    id: "startup-fundraising",
    name: "Startup fundraising",
    emoji: "💸",
    description: "Manage your entire fundraising process in a ready-made workflow. Record individual investors alongside their organizations whilst managing your outreach and pitches.",
    tags: ["startups", "fundraising"],
    primaryObject: "companies",
  },
  {
    id: "vc-deal-flow",
    name: "VC deal flow",
    emoji: "💰",
    description: "Perfect for teams looking to track their investment opportunities. Record key data like deal stage, sector, and priority whilst following everything in a customizable Kanban.",
    tags: ["venture-capital", "finance", "investing"],
    primaryObject: "companies",
  },
  {
    id: "content-co-creation",
    name: "Content co-creation",
    emoji: "🎨",
    description: "Manage your content pipeline and streamline outreach to co-creators. Organize your podcasts, interviews and more and keep track of your published pieces.",
    tags: ["content", "pr"],
    primaryObject: "people",
  },
  {
    id: "employee-onboarding",
    name: "Employee onboarding",
    emoji: "👩‍💻",
    description: "Maintain an overview of your new hires and manage their onboarding process.",
    tags: ["operations", "hr"],
    primaryObject: "people",
  },
  {
    id: "outsourcing",
    name: "Outsourcing",
    emoji: "🌍",
    description: "Organize your freelancing contacts and pipeline. Add tags for their skills, store your previous projects, and track their work status.",
    tags: ["recruiting", "marketing", "hr", "operations", "pr"],
    primaryObject: "people",
  },
  {
    id: "press-outreach",
    name: "Press outreach",
    emoji: "🖋",
    description: "Manage an entire campaign or a single announcement. See your connection's interests, contact details, and relationship analytics alongside their current outreach status.",
    tags: ["pr", "marketing"],
    primaryObject: "people",
  },
];

export default function TemplateSelection() {
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPreview, setShowPreview] = useState<string | null>(null);

  // Load use case from previous step
  useEffect(() => {
    const stored = localStorage.getItem("crm_onboarding_usecase");
    if (stored) {
      const { useCase } = JSON.parse(stored);
      if (useCase) {
        // Map the old use case format to new format
        const mapping: Record<string, string> = {
          "sales": "sales",
          "customer-success": "customer-success",
          "recruiting": "recruiting",
          "partnerships": "sales", // Map to closest
          "custom": "",
        };
        const mapped = mapping[useCase];
        if (mapped) {
          setSelectedUseCases([mapped]);
        }
      }
    }
  }, []);

  const toggleUseCase = (id: string) => {
    setSelectedUseCases(prev =>
      prev.includes(id)
        ? prev.filter(uc => uc !== id)
        : [...prev, id]
    );
  };

  const filteredTemplates = useMemo(() => {
    let result = templates;

    // Filter by selected use cases
    if (selectedUseCases.length > 0) {
      result = result.filter(t =>
        t.tags.some(tag => selectedUseCases.includes(tag))
      );
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return result;
  }, [selectedUseCases, searchQuery]);

  const handleContinue = () => {
    localStorage.setItem("crm_onboarding_template", selectedTemplate || "blank");
    router.push("/crm/onboarding/import");
  };

  const handleStartFromScratch = () => {
    localStorage.setItem("crm_onboarding_template", "blank");
    router.push("/crm/onboarding/import");
  };

  const getTagColor = (tagId: string) => {
    const useCase = useCases.find(uc => uc.id === tagId);
    return useCase?.color || "bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30";
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Progress indicator - 6 steps with connect */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 2
                ? "w-8 bg-purple-500"
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
            Templates
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Choose a template to get started quickly, or start from scratch.
          </p>
        </div>

        <div className="flex gap-6">
          {/* Left sidebar - Use case filters */}
          <div className="w-64 flex-shrink-0">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">
              Use cases
            </label>
            <div className="space-y-1">
              {useCases.map((useCase) => {
                const isSelected = selectedUseCases.includes(useCase.id);
                return (
                  <button
                    key={useCase.id}
                    onClick={() => toggleUseCase(useCase.id)}
                    className={`w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-3 py-2 rounded-lg text-left transition-all ${
                      isSelected
                        ? "bg-muted/80 text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${useCase.color.split(' ')[0]}`} />
                      <span className="text-sm">{useCase.label}</span>
                    </div>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-purple-500 border-purple-500"
                        : "border-border"
                    }`}>
                      {isSelected && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1.17 4.25L2.41 6.03C2.91 6.75 3.98 6.77 4.51 6.06L8.32 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right side - Templates */}
          <div className="flex-1">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for templates, topics, goals..."
                className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border/50 rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Template list */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {filteredTemplates.map((template) => {
                const isSelected = selectedTemplate === template.id;
                return (
                  <motion.button
                    key={template.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`w-full p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "bg-muted/80 border-purple-500/50 ring-2 ring-purple-500/20"
                        : "bg-muted/30 border-border/50 hover:border-border/50"
                    }`}
                  >
                    <div className="flex gap-4">
                      {/* Thumbnail placeholder */}
                      <div className="w-24 h-16 rounded-lg bg-accent/50 flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl">{template.emoji}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-medium text-foreground">
                            <span className="mr-1">{template.emoji}</span>
                            {template.name}
                          </h3>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-purple-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {template.description}
                        </p>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex flex-wrap gap-1.5">
                            {template.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className={`px-2 py-0.5 rounded text-xs border ${getTagColor(tag)}`}
                              >
                                {useCases.find(uc => uc.id === tag)?.label || tag}
                              </span>
                            ))}
                            {template.tags.length > 3 && (
                              <span className="px-2 py-0.5 rounded text-xs bg-accent/50 text-muted-foreground">
                                +{template.tags.length - 3}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {template.primaryObject === "companies" ? (
                              <Building2 className="w-3 h-3" />
                            ) : (
                              <Users className="w-3 h-3" />
                            )}
                            <span className="capitalize">{template.primaryObject}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}

              {filteredTemplates.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No templates found matching your criteria.</p>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedUseCases([]);
                    }}
                    className="mt-2 text-sm text-purple-400 hover:text-purple-300"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 mt-6 border-t border-muted">
          <button
            onClick={() => router.push("/crm/onboarding/use-case")}
            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleStartFromScratch}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Start from scratch
            </button>
            <button
              onClick={handleContinue}
              disabled={!selectedTemplate}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                selectedTemplate
                  ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/25"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              Preview template
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
