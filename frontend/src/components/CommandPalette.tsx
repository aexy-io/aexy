"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  LayoutGrid,
  ListTodo,
  Calendar,
  Target,
  Plus,
  Settings,
  Users,
  Layers,
  Clock,
  ArrowRight,
  X,
  LayoutDashboard,
  Ticket,
  Building2,
  CalendarCheck,
  Mail,
  FormInput,
  FileText,
  ClipboardCheck,
  GraduationCap,
  MonitorCheck,
  Bot,
  Zap,
  TrendingUp,
  ShieldCheck,
  Palmtree,
  MessageSquare,
  Ban,
  Send,
  UserPlus,
  LayoutTemplate,
  BarChart,
  Download,
  Webhook,
  KeyRound,
  Sparkles,
  Activity,
} from "lucide-react";
import { useCommandPalette, getModifierKey } from "@/hooks/useKeyboardShortcuts";
import { Kbd } from "@/components/ui/kbd";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  action: () => void;
  category: "navigation" | "actions" | "recent" | "search";
  keywords?: string[];
}

interface CommandPaletteProps {
  workspaceId?: string | null;
  projectId?: string;
  onCreateTask?: () => void;
}

export function CommandPalette({ projectId, onCreateTask }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Open/close handlers
  const openPalette = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  // Register Cmd+K shortcut
  useCommandPalette(openPalette);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Build command list
  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // ─── Project-Scoped Navigation ─────────────────────
    if (projectId) {
      items.push(
        {
          id: "board",
          label: "Go to Board",
          description: "View project Kanban board",
          icon: <LayoutGrid className="h-4 w-4" />,
          shortcut: ["B"],
          action: () => router.push(`/sprints/${projectId}/board`),
          category: "navigation",
          keywords: ["kanban", "tasks", "view"],
        },
        {
          id: "backlog",
          label: "Go to Backlog",
          description: "Manage product backlog",
          icon: <ListTodo className="h-4 w-4" />,
          shortcut: ["L"],
          action: () => router.push(`/sprints/${projectId}/backlog`),
          category: "navigation",
          keywords: ["items", "stories", "refinement"],
        },
        {
          id: "roadmap",
          label: "Go to Roadmap",
          description: "View project timeline",
          icon: <Calendar className="h-4 w-4" />,
          shortcut: ["R"],
          action: () => router.push(`/sprints/${projectId}/roadmap`),
          category: "navigation",
          keywords: ["timeline", "schedule", "planning"],
        },
        {
          id: "sprints",
          label: "Go to Sprints",
          description: "Manage sprints",
          icon: <Layers className="h-4 w-4" />,
          action: () => router.push(`/sprints/${projectId}`),
          category: "navigation",
          keywords: ["iterations", "cycles"],
        },
        {
          id: "epics",
          label: "Go to Epics",
          description: "View epics and initiatives",
          icon: <Target className="h-4 w-4" />,
          action: () => router.push(`/epics`),
          category: "navigation",
          keywords: ["features", "initiatives"],
        }
      );
    }

    // ─── Global Navigation ─────────────────────────────
    items.push(
      {
        id: "nav-dashboard",
        label: "Dashboard",
        description: "Go to main dashboard",
        icon: <LayoutDashboard className="h-4 w-4" />,
        action: () => router.push("/dashboard"),
        category: "navigation",
        keywords: ["home", "overview", "main"],
      },
      {
        id: "nav-tracking",
        label: "Tracking",
        description: "Standups, blockers, and time entries",
        icon: <Target className="h-4 w-4" />,
        action: () => router.push("/tracking"),
        category: "navigation",
        keywords: ["standup", "daily", "status"],
      },
      {
        id: "nav-standups",
        label: "Standups",
        description: "View daily standups",
        icon: <MessageSquare className="h-4 w-4" />,
        action: () => router.push("/tracking/standups"),
        category: "navigation",
        keywords: ["daily", "standup", "update", "status"],
      },
      {
        id: "nav-blockers",
        label: "Blockers",
        description: "View active blockers",
        icon: <Ban className="h-4 w-4" />,
        action: () => router.push("/tracking/blockers"),
        category: "navigation",
        keywords: ["blocked", "impediment", "issue"],
      },
      {
        id: "nav-time",
        label: "Time Tracking",
        description: "Log and view time entries",
        icon: <Clock className="h-4 w-4" />,
        action: () => router.push("/tracking/time"),
        category: "navigation",
        keywords: ["hours", "timesheet", "log"],
      },
      {
        id: "nav-planning",
        label: "Planning",
        description: "Sprint planning and projects",
        icon: <Calendar className="h-4 w-4" />,
        action: () => router.push("/sprints"),
        category: "navigation",
        keywords: ["sprints", "projects", "board", "kanban"],
      },
      {
        id: "nav-tickets",
        label: "Tickets",
        description: "Help desk and support tickets",
        icon: <Ticket className="h-4 w-4" />,
        action: () => router.push("/tickets"),
        category: "navigation",
        keywords: ["support", "helpdesk", "issues", "bugs"],
      },
      {
        id: "nav-crm",
        label: "CRM",
        description: "Contacts, deals, and pipeline",
        icon: <Building2 className="h-4 w-4" />,
        action: () => router.push("/crm"),
        category: "navigation",
        keywords: ["contacts", "deals", "pipeline", "sales", "customers"],
      },
      {
        id: "nav-booking",
        label: "Booking",
        description: "Event types and scheduling",
        icon: <CalendarCheck className="h-4 w-4" />,
        action: () => router.push("/booking"),
        category: "navigation",
        keywords: ["calendar", "meeting", "schedule", "appointment"],
      },
      {
        id: "nav-email",
        label: "Email Marketing",
        description: "Campaigns and email templates",
        icon: <Mail className="h-4 w-4" />,
        action: () => router.push("/email-marketing/campaigns"),
        category: "navigation",
        keywords: ["campaign", "newsletter", "broadcast", "email"],
      },
      {
        id: "nav-hiring",
        label: "Hiring",
        description: "Candidates and assessments",
        icon: <Users className="h-4 w-4" />,
        action: () => router.push("/hiring/dashboard"),
        category: "navigation",
        keywords: ["recruit", "candidates", "interview", "assess"],
      },
      {
        id: "nav-reviews",
        label: "Reviews",
        description: "Performance review cycles",
        icon: <ClipboardCheck className="h-4 w-4" />,
        action: () => router.push("/reviews/cycles"),
        category: "navigation",
        keywords: ["performance", "feedback", "goals", "peer"],
      },
      {
        id: "nav-compliance",
        label: "Compliance",
        description: "Compliance dashboard and reminders",
        icon: <ShieldCheck className="h-4 w-4" />,
        action: () => router.push("/compliance"),
        category: "navigation",
        keywords: ["audit", "policy", "training", "certification"],
      },
      {
        id: "nav-uptime",
        label: "Uptime",
        description: "Service monitors and incidents",
        icon: <MonitorCheck className="h-4 w-4" />,
        action: () => router.push("/uptime/monitors"),
        category: "navigation",
        keywords: ["monitor", "health", "status", "incident"],
      },
      {
        id: "nav-forms",
        label: "Forms",
        description: "Form builder and responses",
        icon: <FormInput className="h-4 w-4" />,
        action: () => router.push("/forms"),
        category: "navigation",
        keywords: ["survey", "questionnaire", "form"],
      },
      {
        id: "nav-docs",
        label: "Docs",
        description: "Documents and knowledge base",
        icon: <FileText className="h-4 w-4" />,
        action: () => router.push("/docs"),
        category: "navigation",
        keywords: ["wiki", "documentation", "notes", "knowledge"],
      },
      {
        id: "nav-agents",
        label: "AI Agents",
        description: "Manage AI agents",
        icon: <Bot className="h-4 w-4" />,
        action: () => router.push("/agents"),
        category: "navigation",
        keywords: ["ai", "bot", "assistant", "automation"],
      },
      {
        id: "nav-automations",
        label: "Automations",
        description: "Workflow automations",
        icon: <Zap className="h-4 w-4" />,
        action: () => router.push("/automations"),
        category: "navigation",
        keywords: ["workflow", "trigger", "automate"],
      },
      {
        id: "nav-insights",
        label: "Insights",
        description: "Team analytics and leaderboard",
        icon: <TrendingUp className="h-4 w-4" />,
        action: () => router.push("/insights"),
        category: "navigation",
        keywords: ["analytics", "metrics", "leaderboard", "reports"],
      },
      {
        id: "nav-learning",
        label: "Learning",
        description: "Courses and training",
        icon: <GraduationCap className="h-4 w-4" />,
        action: () => router.push("/learning"),
        category: "navigation",
        keywords: ["course", "training", "education"],
      },
      {
        id: "nav-leave",
        label: "Leave",
        description: "Time off and leave requests",
        icon: <Palmtree className="h-4 w-4" />,
        action: () => router.push("/leave"),
        category: "navigation",
        keywords: ["vacation", "pto", "time off", "holiday"],
      },
      {
        id: "nav-templates",
        label: "Templates",
        description: "Browse pre-built templates",
        icon: <LayoutTemplate className="h-4 w-4" />,
        action: () => router.push("/templates"),
        category: "navigation",
        keywords: ["template", "gallery", "starter", "pre-built"],
      },
      {
        id: "nav-team",
        label: "Team",
        description: "View team members",
        icon: <Users className="h-4 w-4" />,
        action: () => router.push("/team"),
        category: "navigation",
        keywords: ["members", "people", "developers"],
      },
      {
        id: "nav-reports",
        label: "Reports",
        description: "Custom analytics reports",
        icon: <BarChart className="h-4 w-4" />,
        action: () => router.push("/reports"),
        category: "navigation",
        keywords: ["report", "analytics", "chart", "dashboard", "custom"],
      },
      {
        id: "nav-exports",
        label: "Exports",
        description: "Export data in various formats",
        icon: <Download className="h-4 w-4" />,
        action: () => router.push("/exports"),
        category: "navigation",
        keywords: ["export", "download", "csv", "pdf", "xlsx", "data"],
      },
      {
        id: "nav-webhooks",
        label: "Webhooks",
        description: "Manage webhook endpoints",
        icon: <Webhook className="h-4 w-4" />,
        action: () => router.push("/settings/webhooks"),
        category: "navigation",
        keywords: ["webhook", "api", "endpoint", "notification", "event"],
      },
      {
        id: "nav-templates",
        label: "Templates",
        description: "Browse pre-built templates",
        icon: <Sparkles className="h-4 w-4" />,
        action: () => router.push("/templates"),
        category: "navigation",
        keywords: ["template", "marketplace", "automation", "form", "assessment"],
      },
      {
        id: "nav-sso",
        label: "Single Sign-On",
        description: "Configure SSO/SAML authentication",
        icon: <KeyRound className="h-4 w-4" />,
        action: () => router.push("/settings/sso"),
        category: "navigation",
        keywords: ["sso", "saml", "oidc", "authentication", "enterprise", "okta", "azure"],
      },
      {
        id: "nav-usage",
        label: "Usage & Limits",
        description: "Monitor AI usage and plan limits",
        icon: <Activity className="h-4 w-4" />,
        action: () => router.push("/settings/usage"),
        category: "navigation",
        keywords: ["usage", "tokens", "limits", "quota", "consumption", "cost"],
      },
      {
        id: "nav-settings",
        label: "Settings",
        description: "Workspace settings",
        icon: <Settings className="h-4 w-4" />,
        action: () => router.push("/settings"),
        category: "navigation",
        keywords: ["preferences", "configuration", "account"],
      }
    );

    // ─── Quick Actions ─────────────────────────────────
    if (onCreateTask) {
      items.push({
        id: "create-task",
        label: "Create Task",
        description: "Add a new task to the board",
        icon: <Plus className="h-4 w-4" />,
        shortcut: ["C"],
        action: () => {
          closePalette();
          onCreateTask();
        },
        category: "actions",
        keywords: ["new", "add", "issue", "task"],
      });
    }

    items.push(
      {
        id: "action-new-ticket",
        label: "New Ticket",
        description: "Create a support ticket",
        icon: <Plus className="h-4 w-4" />,
        action: () => router.push("/tickets?action=new"),
        category: "actions",
        keywords: ["create", "ticket", "support", "bug"],
      },
      {
        id: "action-submit-standup",
        label: "Submit Standup",
        description: "Log your daily standup",
        icon: <MessageSquare className="h-4 w-4" />,
        action: () => router.push("/tracking/standups"),
        category: "actions",
        keywords: ["daily", "standup", "update"],
      },
      {
        id: "action-log-time",
        label: "Log Time",
        description: "Add a time entry",
        icon: <Clock className="h-4 w-4" />,
        action: () => router.push("/tracking/time"),
        category: "actions",
        keywords: ["hours", "timesheet"],
      },
      {
        id: "action-new-form",
        label: "Create Form",
        description: "Build a new form or survey",
        icon: <FormInput className="h-4 w-4" />,
        action: () => router.push("/forms?action=new"),
        category: "actions",
        keywords: ["survey", "questionnaire"],
      },
      {
        id: "action-new-doc",
        label: "New Document",
        description: "Create a new document",
        icon: <FileText className="h-4 w-4" />,
        action: () => router.push("/docs?action=new"),
        category: "actions",
        keywords: ["document", "page", "write"],
      },
      {
        id: "action-new-automation",
        label: "Create Automation",
        description: "Build a new workflow automation",
        icon: <Zap className="h-4 w-4" />,
        action: () => router.push("/automations/new"),
        category: "actions",
        keywords: ["workflow", "trigger", "automate"],
      },
      {
        id: "action-new-agent",
        label: "Create Agent",
        description: "Set up a new AI agent",
        icon: <Bot className="h-4 w-4" />,
        action: () => router.push("/agents/new"),
        category: "actions",
        keywords: ["ai", "bot", "assistant"],
      },
      {
        id: "action-new-campaign",
        label: "New Campaign",
        description: "Create an email campaign",
        icon: <Send className="h-4 w-4" />,
        action: () => router.push("/email-marketing/campaigns?action=new"),
        category: "actions",
        keywords: ["email", "newsletter", "broadcast"],
      },
      {
        id: "action-new-candidate",
        label: "Add Candidate",
        description: "Add a new hiring candidate",
        icon: <UserPlus className="h-4 w-4" />,
        action: () => router.push("/hiring/candidates?action=new"),
        category: "actions",
        keywords: ["recruit", "hire", "applicant"],
      }
    );

    return items;
  }, [projectId, router, onCreateTask, closePalette]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }

    const lowerQuery = query.toLowerCase();
    return commands
      .map((cmd) => {
        const labelMatch = cmd.label.toLowerCase().includes(lowerQuery);
        const descMatch = cmd.description?.toLowerCase().includes(lowerQuery);
        const keywordMatch = cmd.keywords?.some((k) => k.includes(lowerQuery));
        const exactLabel = cmd.label.toLowerCase().startsWith(lowerQuery);
        // Score: exact prefix > label match > keyword match > description match
        const score = (exactLabel ? 4 : 0) + (labelMatch ? 2 : 0) + (keywordMatch ? 1 : 0) + (descMatch ? 0.5 : 0);
        return { cmd, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ cmd }) => cmd);
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {
      recent: [],
      actions: [],
      navigation: [],
      search: [],
    };

    filteredCommands.forEach((cmd) => {
      groups[cmd.category].push(cmd);
    });

    return groups;
  }, [filteredCommands]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
            closePalette();
          }
          break;
        case "Escape":
          e.preventDefault();
          closePalette();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, closePalette]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const categoryLabels: Record<string, string> = {
    recent: "Recent",
    actions: "Actions",
    navigation: "Navigation",
    search: "Search Results",
  };

  let flatIndex = -1;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - separate layer for click handling */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={closePalette}
          />

          {/* Palette container */}
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] pointer-events-none">
            <motion.div
              key="palette"
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="relative w-full max-w-xl mx-4 bg-muted/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl shadow-black/50 overflow-hidden pointer-events-auto"
            >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
            <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commands, navigate, or type..."
              className="flex-1 bg-transparent text-foreground placeholder-muted-foreground text-sm focus:outline-none"
            />
            <button
              onClick={closePalette}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {filteredCommands.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No results found for &quot;{query}&quot;</p>
              </div>
            ) : (
              <div className="py-2">
                {Object.entries(groupedCommands).map(([category, items]) => {
                  if (items.length === 0) return null;

                  return (
                    <div key={category}>
                      <div className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {categoryLabels[category]}
                      </div>
                      {items.map((item) => {
                        flatIndex++;
                        const isSelected = flatIndex === selectedIndex;
                        const currentIndex = flatIndex;

                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              item.action();
                              closePalette();
                            }}
                            onMouseEnter={() => setSelectedIndex(currentIndex)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              isSelected
                                ? "bg-primary-500/20 text-foreground"
                                : "text-foreground hover:bg-accent/50"
                            }`}
                          >
                            <span
                              className={`flex-shrink-0 ${
                                isSelected ? "text-primary-400" : "text-muted-foreground"
                              }`}
                            >
                              {item.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{item.label}</div>
                              {item.description && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.description}
                                </div>
                              )}
                            </div>
                            {item.shortcut && (
                              <Kbd keys={item.shortcut} variant="ghost" />
                            )}
                            {isSelected && (
                              <ArrowRight className="h-4 w-4 text-primary-400 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Kbd keys={["↑", "↓"]} variant="ghost" />
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <Kbd keys={["enter"]} variant="ghost" />
                <span>Select</span>
              </span>
              <span className="flex items-center gap-1">
                <Kbd keys={["esc"]} variant="ghost" />
                <span>Close</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Kbd keys={[getModifierKey(), "K"]} variant="ghost" />
              <span>to open</span>
            </div>
          </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export default CommandPalette;
