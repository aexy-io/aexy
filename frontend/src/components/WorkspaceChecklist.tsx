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
  FolderGit2,
  Users,
  Bot,
  Zap,
  Calendar,
  Link2,
} from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  completed: boolean;
}

const CHECKLIST_ITEMS: Omit<ChecklistItem, "completed">[] = [
  {
    id: "connect-repo",
    label: "Connect a repository",
    description: "Sync your GitHub repos for analysis",
    icon: FolderGit2,
    href: "/settings/repositories",
  },
  {
    id: "invite-team",
    label: "Invite team members",
    description: "Collaborate with your engineering team",
    icon: Users,
    href: "/settings/organization",
  },
  {
    id: "create-agent",
    label: "Create an AI agent",
    description: "Automate tasks with intelligent agents",
    icon: Bot,
    href: "/agents/new",
  },
  {
    id: "setup-automation",
    label: "Set up an automation",
    description: "Automate your workflows across modules",
    icon: Zap,
    href: "/automations/new",
  },
  {
    id: "connect-calendar",
    label: "Connect your calendar",
    description: "Enable booking and scheduling",
    icon: Calendar,
    href: "/booking/calendars",
  },
  {
    id: "add-integration",
    label: "Add an integration",
    description: "Connect Slack, Jira, Linear, or more",
    icon: Link2,
    href: "/settings/integrations",
  },
];

const STORAGE_KEY = "workspace_checklist_progress";
const DISMISS_KEY = "workspace_checklist_dismissed";

export function WorkspaceChecklist({ onDismiss }: { onDismiss?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setCompletedIds(JSON.parse(stored));
      } catch {
        // corrupted data — reset
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const items: ChecklistItem[] = CHECKLIST_ITEMS.map((item) => ({
    ...item,
    completed: completedIds.includes(item.id),
  }));

  const completedCount = completedIds.length;
  const progress = (completedCount / items.length) * 100;

  const markComplete = (id: string) => {
    const updated = [...completedIds, id];
    setCompletedIds(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    onDismiss?.();
  };

  return (
    <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="w-8 h-8 -rotate-90">
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-border"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${progress * 0.88} 88`}
                className="text-primary transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground">
              {completedCount}
            </span>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Getting Started</h3>
            <p className="text-xs text-muted-foreground">
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
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border/50">
          <div className="p-2 space-y-1">
            {items.map((item) => {
              const content = (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    item.completed
                      ? "opacity-60"
                      : "hover:bg-muted/50 cursor-pointer"
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!item.completed) markComplete(item.id);
                    }}
                    className="flex-shrink-0"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-border hover:text-primary transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        item.completed
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </p>
                  </div>
                  <item.icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      item.completed ? "text-border" : "text-muted-foreground"
                    }`}
                  />
                </div>
              );

              if (!item.completed) {
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => markComplete(item.id)}
                  >
                    {content}
                  </Link>
                );
              }
              return content;
            })}
          </div>

          {completedCount === items.length && (
            <div className="px-4 py-3 border-t border-border/50 bg-green-500/5">
              <div className="flex items-center gap-2 text-green-400">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">
                  All done! Your workspace is ready.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function useShouldShowWorkspaceChecklist() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    const onboardingComplete = localStorage.getItem("aexy_onboarding_complete");
    const progress = localStorage.getItem(STORAGE_KEY);
    let completedIds: string[] = [];
    if (progress) {
      try { completedIds = JSON.parse(progress); } catch { /* ignore corrupted data */ }
    }

    setShouldShow(
      onboardingComplete === "true" &&
        dismissed !== "true" &&
        completedIds.length < CHECKLIST_ITEMS.length
    );
  }, []);

  return shouldShow;
}
