"use client";

import { useEffect, useCallback, useRef } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  cmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  callback: () => void;
  description?: string;
  enabled?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
  ignoreInputs?: boolean;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
  ignoreInputs = true,
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if focus is in input/textarea/contenteditable unless shortcut uses cmd/ctrl
      if (ignoreInputs) {
        const target = event.target as HTMLElement;
        const isInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

        // Only allow cmd/ctrl shortcuts in inputs
        if (isInput && !event.metaKey && !event.ctrlKey) {
          return;
        }
      }

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.enabled === false) continue;

        const key = shortcut.key.toLowerCase();
        const pressedKey = event.key.toLowerCase();

        // Check key match
        if (pressedKey !== key && event.code.toLowerCase() !== `key${key}`) {
          continue;
        }

        // Check modifiers
        const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
        const needsCmdOrCtrl = shortcut.cmd || shortcut.ctrl;

        if (needsCmdOrCtrl && !cmdOrCtrl) continue;
        if (!needsCmdOrCtrl && cmdOrCtrl) continue;
        if (shortcut.shift && !event.shiftKey) continue;
        if (!shortcut.shift && event.shiftKey) continue;
        if (shortcut.alt && !event.altKey) continue;
        if (!shortcut.alt && event.altKey) continue;

        // Prevent default and execute
        event.preventDefault();
        event.stopPropagation();
        shortcut.callback();
        return;
      }
    },
    [enabled, ignoreInputs]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// Hook for single shortcut
export function useShortcut(
  key: string,
  callback: () => void,
  options: { ctrl?: boolean; cmd?: boolean; shift?: boolean; alt?: boolean; enabled?: boolean } = {}
) {
  useKeyboardShortcuts({
    shortcuts: [{ key, callback, ...options }],
    enabled: options.enabled ?? true,
  });
}

// Hook for Cmd/Ctrl+K command palette
export function useCommandPalette(onOpen: () => void, enabled = true) {
  useShortcut("k", onOpen, { cmd: true, enabled });
}

// Get modifier key string for current platform
export function getModifierKey(): string {
  return isMac ? "⌘" : "Ctrl";
}

// Format shortcut for display
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  if (shortcut.cmd || shortcut.ctrl) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (shortcut.shift) {
    parts.push(isMac ? "⇧" : "Shift");
  }
  if (shortcut.alt) {
    parts.push(isMac ? "⌥" : "Alt");
  }
  parts.push(shortcut.key.toUpperCase());

  return parts.join("+");
}

// Pre-defined shortcuts registry
export const DEFAULT_SHORTCUTS = {
  CREATE_TASK: { key: "c", description: "Create new task" },
  SEARCH: { key: "k", cmd: true, description: "Open search / command palette" },
  GO_BOARD: { key: "b", description: "Go to board" },
  GO_BACKLOG: { key: "l", description: "Go to backlog" },
  GO_ROADMAP: { key: "r", description: "Go to roadmap" },
  FILTER: { key: "f", description: "Focus filter" },
  CLOSE: { key: "escape", description: "Close modal / Cancel" },
  SAVE: { key: "s", cmd: true, description: "Save" },
  SELECT_ALL: { key: "a", cmd: true, description: "Select all" },
  PRIORITY_1: { key: "1", description: "Set priority: Critical" },
  PRIORITY_2: { key: "2", description: "Set priority: High" },
  PRIORITY_3: { key: "3", description: "Set priority: Medium" },
  PRIORITY_4: { key: "4", description: "Set priority: Low" },
} as const;
