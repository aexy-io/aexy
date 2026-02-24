"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code,
  Users,
  Target,
  Heart,
  Ticket,
  Building2,
  Settings,
  Sparkles,
  Keyboard,
  Command,
} from "lucide-react";
import { PresetType } from "@/config/dashboardPresets";
import { Kbd } from "@/components/ui/kbd";
import { getModifierKey } from "@/hooks/useKeyboardShortcuts";

const STORAGE_KEY = "dashboard_welcome_seen";

const PERSONA_CARDS: {
  id: PresetType;
  name: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}[] = [
  {
    id: "developer",
    name: "Developer",
    description: "Skills, insights, and growth tracking",
    icon: <Code className="h-6 w-6" />,
    gradient: "from-blue-500 to-blue-600",
  },
  {
    id: "manager",
    name: "Engineering Manager",
    description: "Team insights, sprints, and performance",
    icon: <Users className="h-6 w-6" />,
    gradient: "from-green-500 to-green-600",
  },
  {
    id: "product",
    name: "Product Manager",
    description: "Sprint planning and documentation",
    icon: <Target className="h-6 w-6" />,
    gradient: "from-purple-500 to-purple-600",
  },
  {
    id: "hr",
    name: "HR / People Ops",
    description: "Hiring, reviews, and org health",
    icon: <Heart className="h-6 w-6" />,
    gradient: "from-rose-500 to-rose-600",
  },
  {
    id: "support",
    name: "Support",
    description: "Tickets, SLAs, and customer success",
    icon: <Ticket className="h-6 w-6" />,
    gradient: "from-pink-500 to-pink-600",
  },
  {
    id: "sales",
    name: "Sales",
    description: "CRM pipeline, deals, and contacts",
    icon: <Building2 className="h-6 w-6" />,
    gradient: "from-cyan-500 to-cyan-600",
  },
  {
    id: "admin",
    name: "Admin",
    description: "Org-wide metrics and system overview",
    icon: <Settings className="h-6 w-6" />,
    gradient: "from-slate-500 to-slate-600",
  },
];

interface DashboardWelcomeProps {
  onSelectPreset: (preset: PresetType) => void;
  userName?: string;
}

export function DashboardWelcome({
  onSelectPreset,
  userName,
}: DashboardWelcomeProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [selected, setSelected] = useState<PresetType | null>(null);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setIsVisible(true);
    }
  }, []);

  const handleSelect = useCallback(
    (preset: PresetType) => {
      setSelected(preset);
      // Brief delay to show selection state before closing
      setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, "true");
        onSelectPreset(preset);
        setIsVisible(false);
      }, 300);
    },
    [onSelectPreset]
  );

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsVisible(false);
  }, []);

  if (!isVisible) return null;

  const firstName = userName?.split(" ")[0] || "there";

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          <motion.div
            key="welcome-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8 pointer-events-none">
            <motion.div
              key="welcome-dialog"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative w-full max-w-2xl mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            >
              {/* Header */}
              <div className="px-8 pt-8 pb-4 text-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4"
                >
                  <Sparkles className="h-7 w-7 text-primary" />
                </motion.div>
                <h1 className="text-xl font-semibold text-foreground mb-1.5">
                  Welcome{firstName !== "there" ? `, ${firstName}` : ""}!
                </h1>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Choose your role to get a personalized dashboard with the
                  widgets most relevant to you.
                </p>
              </div>

              {/* Persona grid */}
              <div className="px-8 py-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {PERSONA_CARDS.map((persona, i) => (
                    <motion.button
                      key={persona.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.04 }}
                      onClick={() => handleSelect(persona.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all ${
                        selected === persona.id
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : "border-border bg-muted/30 hover:bg-muted/60 hover:border-border/80"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br ${persona.gradient} text-white`}
                      >
                        {persona.icon}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {persona.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {persona.description}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div className="px-8 py-4 border-t border-border/50 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Quick tips
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Command className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      <Kbd keys={[getModifierKey(), "K"]} variant="ghost" />{" "}
                      Command palette
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Keyboard className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      <Kbd keys={["?"]} variant="ghost" /> Keyboard shortcuts
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Settings className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Customize your dashboard anytime</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-4 border-t border-border/50 flex justify-end">
                <button
                  onClick={handleSkip}
                  className="text-sm text-muted-foreground hover:text-foreground transition"
                >
                  Skip for now
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook to check if the welcome modal should be shown
 */
export function useShouldShowDashboardWelcome(): boolean {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    setShouldShow(!seen);
  }, []);

  return shouldShow;
}
