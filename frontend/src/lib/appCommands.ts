"use client";

/**
 * Openers for the app-wide overlays that only a keystroke could reach.
 *
 * `CommandPalette` and `KeyboardShortcutsHelp` are mounted once in the app
 * layout and each holds its own `isOpen`, opened solely by ⌘K and `?`. That made
 * both undiscoverable: nothing in the UI said the palette existed, and the only
 * hint that `?` opened the shortcut list was buried in the sprint board. You had
 * to already know.
 *
 * Rather than lift two pieces of local state into a store — or thread props
 * through the shell — the overlays also listen on a DOM event. It keeps them
 * self-contained, works from anywhere including a component that is not a React
 * ancestor, and survives the palette merge in the next phase.
 */

import { useEffect } from "react";

export const APP_COMMANDS = {
  palette: "aexy:open-command-palette",
  shortcuts: "aexy:open-keyboard-shortcuts",
} as const;

type AppCommand = (typeof APP_COMMANDS)[keyof typeof APP_COMMANDS];

function dispatch(command: AppCommand) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(command));
}

export const openCommandPalette = () => dispatch(APP_COMMANDS.palette);
export const openKeyboardShortcuts = () => dispatch(APP_COMMANDS.shortcuts);

/** Subscribe an overlay to its opener. Pair with the existing keyboard shortcut. */
export function useAppCommand(command: AppCommand, handler: () => void) {
  useEffect(() => {
    const onCommand = () => handler();
    window.addEventListener(command, onCommand);
    return () => window.removeEventListener(command, onCommand);
  }, [command, handler]);
}
