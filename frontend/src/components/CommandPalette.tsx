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
  GitBranch,
  Layers,
  Clock,
  ArrowRight,
  X,
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

export function CommandPalette({ workspaceId, projectId, onCreateTask }: CommandPaletteProps) {
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

    // Navigation commands
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

    // Global navigation
    items.push(
      {
        id: "projects",
        label: "All Projects",
        description: "View all projects",
        icon: <GitBranch className="h-4 w-4" />,
        action: () => router.push("/sprints"),
        category: "navigation",
        keywords: ["repositories", "teams"],
      },
      {
        id: "team",
        label: "Team",
        description: "View team members",
        icon: <Users className="h-4 w-4" />,
        action: () => router.push("/team"),
        category: "navigation",
        keywords: ["members", "people", "developers"],
      },
      {
        id: "settings",
        label: "Settings",
        description: "Workspace settings",
        icon: <Settings className="h-4 w-4" />,
        action: () => router.push("/settings"),
        category: "navigation",
        keywords: ["preferences", "configuration"],
      }
    );

    // Actions
    if (onCreateTask) {
      items.push({
        id: "create-task",
        label: "Create Task",
        description: "Add a new task",
        icon: <Plus className="h-4 w-4" />,
        shortcut: ["C"],
        action: () => {
          closePalette();
          onCreateTask();
        },
        category: "actions",
        keywords: ["new", "add", "issue"],
      });
    }

    return items;
  }, [projectId, router, onCreateTask, closePalette]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }

    const lowerQuery = query.toLowerCase();
    return commands.filter((cmd) => {
      const matchLabel = cmd.label.toLowerCase().includes(lowerQuery);
      const matchDesc = cmd.description?.toLowerCase().includes(lowerQuery);
      const matchKeywords = cmd.keywords?.some((k) => k.includes(lowerQuery));
      return matchLabel || matchDesc || matchKeywords;
    });
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

  if (!isOpen) return null;

  const categoryLabels: Record<string, string> = {
    recent: "Recent",
    actions: "Actions",
    navigation: "Navigation",
    search: "Search Results",
  };

  let flatIndex = -1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
        onClick={closePalette}
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Palette */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="relative w-full max-w-xl mx-4 bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
            <Search className="h-5 w-5 text-slate-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commands, navigate, or type..."
              className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm focus:outline-none"
            />
            <button
              onClick={closePalette}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {filteredCommands.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No results found for &quot;{query}&quot;</p>
              </div>
            ) : (
              <div className="py-2">
                {Object.entries(groupedCommands).map(([category, items]) => {
                  if (items.length === 0) return null;

                  return (
                    <div key={category}>
                      <div className="px-4 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
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
                                ? "bg-primary-500/20 text-white"
                                : "text-slate-300 hover:bg-slate-700/50"
                            }`}
                          >
                            <span
                              className={`flex-shrink-0 ${
                                isSelected ? "text-primary-400" : "text-slate-400"
                              }`}
                            >
                              {item.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{item.label}</div>
                              {item.description && (
                                <div className="text-xs text-slate-500 truncate">
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
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700/50 text-xs text-slate-500">
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
      </motion.div>
    </AnimatePresence>
  );
}

export default CommandPalette;
