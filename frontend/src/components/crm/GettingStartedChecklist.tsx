"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Building2,
  Users,
  FileSpreadsheet,
  Zap,
  Settings,
  UserPlus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  href?: string;
  action?: () => void;
  completed: boolean;
}

interface GettingStartedChecklistProps {
  onDismiss?: () => void;
}

export function GettingStartedChecklist({ onDismiss }: GettingStartedChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [items, setItems] = useState<ChecklistItem[]>([
    {
      id: "create-company",
      label: "Create your first company",
      description: "Add a company to track",
      icon: Building2,
      href: "/crm/companies",
      completed: false,
    },
    {
      id: "add-person",
      label: "Add a contact",
      description: "Create a person record",
      icon: Users,
      href: "/crm/people",
      completed: false,
    },
    {
      id: "import-data",
      label: "Import your data",
      description: "Bulk import from CSV",
      href: "/crm/settings?tab=import",
      icon: FileSpreadsheet,
      completed: false,
    },
    {
      id: "create-automation",
      label: "Set up an automation",
      description: "Automate your workflows",
      icon: Zap,
      href: "/crm/automations",
      completed: false,
    },
    {
      id: "customize-objects",
      label: "Customize your objects",
      description: "Add custom attributes",
      icon: Settings,
      href: "/crm/settings",
      completed: false,
    },
    {
      id: "invite-team",
      label: "Invite team members",
      description: "Collaborate with your team",
      icon: UserPlus,
      href: "/crm/settings?tab=team",
      completed: false,
    },
  ]);

  // Load completion status from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("crm_checklist_progress");
    if (stored) {
      const completedIds = JSON.parse(stored) as string[];
      setItems(prev =>
        prev.map(item => ({
          ...item,
          completed: completedIds.includes(item.id),
        }))
      );
    }
  }, []);

  const completedCount = items.filter(i => i.completed).length;
  const progress = (completedCount / items.length) * 100;

  const markComplete = (id: string) => {
    setItems(prev => {
      const updated = prev.map(item =>
        item.id === id ? { ...item, completed: true } : item
      );
      const completedIds = updated.filter(i => i.completed).map(i => i.id);
      localStorage.setItem("crm_checklist_progress", JSON.stringify(completedIds));
      return updated;
    });
  };

  const handleDismiss = () => {
    localStorage.setItem("crm_checklist_dismissed", "true");
    onDismiss?.();
  };

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            {/* Progress ring */}
            <svg className="w-8 h-8 -rotate-90">
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-slate-700"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${progress * 0.88} 88`}
                className="text-purple-500 transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
              {completedCount}
            </span>
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Getting Started</h3>
            <p className="text-xs text-slate-500">
              {completedCount}/{items.length} completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </div>

      {/* Items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-slate-700/50"
          >
            <div className="p-2 space-y-1">
              {items.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  onComplete={() => markComplete(item.id)}
                />
              ))}
            </div>

            {/* Completion message */}
            {completedCount === items.length && (
              <div className="px-4 py-3 border-t border-slate-700/50 bg-green-500/5">
                <div className="flex items-center gap-2 text-green-400">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm font-medium">All done! Great job!</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChecklistItemRow({
  item,
  onComplete,
}: {
  item: ChecklistItem;
  onComplete: () => void;
}) {
  const content = (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        item.completed
          ? "opacity-60"
          : "hover:bg-slate-800/50 cursor-pointer"
      }`}
      onClick={() => {
        if (!item.completed && item.action) {
          item.action();
        }
      }}
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!item.completed) {
            onComplete();
          }
        }}
        className="flex-shrink-0"
      >
        {item.completed ? (
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        ) : (
          <Circle className="w-5 h-5 text-slate-600 hover:text-purple-400 transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${item.completed ? "text-slate-500 line-through" : "text-white"}`}>
          {item.label}
        </p>
        <p className="text-xs text-slate-500 truncate">{item.description}</p>
      </div>
      <item.icon className={`w-4 h-4 flex-shrink-0 ${item.completed ? "text-slate-600" : "text-slate-500"}`} />
    </div>
  );

  if (item.href && !item.completed) {
    return (
      <Link href={item.href} onClick={onComplete}>
        {content}
      </Link>
    );
  }

  return content;
}

// Hook to check if checklist should be shown
export function useShouldShowChecklist() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("crm_checklist_dismissed");
    const onboardingComplete = localStorage.getItem("crm_onboarding_complete");
    const checklistProgress = localStorage.getItem("crm_checklist_progress");
    const completedIds = checklistProgress ? JSON.parse(checklistProgress) : [];

    // Show if onboarding is complete, not dismissed, and not all items completed
    setShouldShow(
      onboardingComplete === "true" &&
      dismissed !== "true" &&
      completedIds.length < 6
    );
  }, []);

  return shouldShow;
}
