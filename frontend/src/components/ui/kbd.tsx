"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  keys: string | string[];
  variant?: "default" | "outline" | "ghost";
}

const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, keys, variant = "default", ...props }, ref) => {
    const keyArray = Array.isArray(keys) ? keys : [keys];

    const variants = {
      default: "bg-accent border-border text-foreground shadow-sm",
      outline: "bg-transparent border-border text-muted-foreground",
      ghost: "bg-muted/50 border-transparent text-muted-foreground",
    };

    // Convert key names to symbols
    const getKeySymbol = (key: string): string => {
      const keyMap: Record<string, string> = {
        cmd: "⌘",
        command: "⌘",
        ctrl: "⌃",
        control: "⌃",
        alt: "⌥",
        option: "⌥",
        shift: "⇧",
        enter: "↵",
        return: "↵",
        backspace: "⌫",
        delete: "⌦",
        tab: "⇥",
        esc: "⎋",
        escape: "⎋",
        up: "↑",
        down: "↓",
        left: "←",
        right: "→",
        space: "␣",
      };
      return keyMap[key.toLowerCase()] || key.toUpperCase();
    };

    return (
      <span className={cn("inline-flex items-center gap-0.5", className)} {...props}>
        {keyArray.map((key, index) => (
          <React.Fragment key={index}>
            <kbd
              ref={index === 0 ? ref : undefined}
              className={cn(
                "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[11px] font-medium rounded border",
                variants[variant]
              )}
            >
              {getKeySymbol(key)}
            </kbd>
            {index < keyArray.length - 1 && (
              <span className="text-muted-foreground text-xs mx-0.5">+</span>
            )}
          </React.Fragment>
        ))}
      </span>
    );
  }
);
Kbd.displayName = "Kbd";

// Keyboard shortcut hint that shows key combination
interface ShortcutHintProps extends React.HTMLAttributes<HTMLDivElement> {
  shortcut: string | string[];
  label?: string;
}

const ShortcutHint = React.forwardRef<HTMLDivElement, ShortcutHintProps>(
  ({ className, shortcut, label, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between gap-4 text-sm",
        className
      )}
      {...props}
    >
      {label && <span className="text-muted-foreground">{label}</span>}
      <Kbd keys={shortcut} variant="ghost" />
    </div>
  )
);
ShortcutHint.displayName = "ShortcutHint";

export { Kbd, ShortcutHint };
