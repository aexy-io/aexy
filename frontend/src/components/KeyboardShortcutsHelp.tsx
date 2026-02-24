"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { getModifierKey } from "@/hooks/useKeyboardShortcuts";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[][]; label: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: [["cmd", "K"]], label: "Open command palette" },
      { keys: [["?"]], label: "Show keyboard shortcuts" },
      { keys: [["esc"]], label: "Close modal / panel" },
    ],
  },
  {
    title: "Navigation (G then ...)",
    shortcuts: [
      { keys: [["G"], ["D"]], label: "Dashboard" },
      { keys: [["G"], ["S"]], label: "Sprints" },
      { keys: [["G"], ["T"]], label: "Tickets" },
      { keys: [["G"], ["E"]], label: "Tracking" },
      { keys: [["G"], ["C"]], label: "CRM" },
      { keys: [["G"], ["A"]], label: "AI Agents" },
      { keys: [["G"], ["O"]], label: "Automations" },
      { keys: [["G"], ["M"]], label: "Email Marketing" },
      { keys: [["G"], ["B"]], label: "Booking" },
      { keys: [["G"], ["H"]], label: "Hiring" },
      { keys: [["G"], ["R"]], label: "Reviews" },
      { keys: [["G"], ["F"]], label: "Forms" },
      { keys: [["G"], ["W"]], label: "Docs" },
      { keys: [["G"], ["L"]], label: "Learning" },
      { keys: [["G"], ["V"]], label: "Leave" },
      { keys: [["G"], ["P"]], label: "Compliance" },
      { keys: [["G"], ["U"]], label: "Uptime" },
      { keys: [["G"], ["I"]], label: "Insights" },
      { keys: [["G"], ["N"]], label: "Notifications" },
      { keys: [["G"], [","]], label: "Settings" },
    ],
  },
  {
    title: "Command Palette",
    shortcuts: [
      { keys: [["↑"], ["↓"]], label: "Navigate results" },
      { keys: [["enter"]], label: "Select item" },
      { keys: [["esc"]], label: "Close palette" },
    ],
  },
];

export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Listen for "?" key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          open();
        }
      }

      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, open, close]);

  // Replace "cmd" with platform-specific modifier
  const resolveKeys = (keys: string[]): string[] => {
    return keys.map((k) => (k === "cmd" ? getModifierKey() : k));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="shortcuts-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={close}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <motion.div
              key="shortcuts-dialog"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="relative w-full max-w-lg mx-4 bg-muted/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl shadow-black/50 overflow-hidden pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-dialog-title"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <Keyboard className="h-5 w-5 text-muted-foreground" />
                  <h2 id="shortcuts-dialog-title" className="text-sm font-semibold text-foreground">
                    Keyboard Shortcuts
                  </h2>
                </div>
                <button
                  onClick={close}
                  aria-label="Close"
                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Shortcuts list */}
              <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-5">
                {SHORTCUT_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
                      {group.title}
                    </h3>
                    <div className="space-y-1.5">
                      {group.shortcuts.map((shortcut, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-1"
                        >
                          <span className="text-sm text-foreground">
                            {shortcut.label}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {shortcut.keys.map((keyCombo, j) => (
                              <span key={j} className="flex items-center gap-1">
                                {j > 0 && (
                                  <span className="text-xs text-muted-foreground mx-0.5">
                                    then
                                  </span>
                                )}
                                <Kbd keys={resolveKeys(keyCombo)} variant="outline" />
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border/50 text-xs text-muted-foreground text-center">
                Press <Kbd keys={["?"]} variant="ghost" /> to toggle this dialog
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
