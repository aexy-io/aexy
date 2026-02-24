"use client";

import { useRouter } from "next/navigation";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

/**
 * Global keyboard shortcuts for common navigation actions.
 * Mount once in the app layout.
 *
 * Shortcuts:
 *   g then d  →  Dashboard
 *   g then a  →  Agents
 *   g then s  →  Sprints
 *   g then t  →  Tickets
 *   g then c  →  CRM
 *   g then m  →  Email Marketing
 *   g then b  →  Booking
 *   g then i  →  Insights
 *   g then o  →  Automations
 *   g then ,  →  Settings
 *   ?         →  Show shortcuts help (via command palette)
 */
export function GlobalShortcuts() {
  const router = useRouter();

  // "g then X" navigation pattern (like GitHub/Linear)
  // We track when "g" is pressed and listen for the follow-up key
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "g",
        callback: () => {
          // Start a "go to" sequence - listen for next key
          const handler = (e: KeyboardEvent) => {
            // Ignore if in input
            const target = e.target as HTMLElement;
            if (
              target.tagName === "INPUT" ||
              target.tagName === "TEXTAREA" ||
              target.isContentEditable
            )
              return;

            const routes: Record<string, string> = {
              d: "/dashboard",
              a: "/agents",
              s: "/sprints",
              t: "/tickets",
              c: "/crm",
              m: "/email-marketing",
              b: "/booking",
              i: "/insights",
              o: "/automations",
              ",": "/settings",
            };

            const path = routes[e.key.toLowerCase()];
            if (path) {
              e.preventDefault();
              router.push(path);
            }

            // Clean up after any key press (whether matched or not)
            document.removeEventListener("keydown", handler);
          };

          document.addEventListener("keydown", handler);
          // Auto-cleanup after 1.5 seconds if no follow-up key
          setTimeout(() => {
            document.removeEventListener("keydown", handler);
          }, 1500);
        },
        description: "Go to...",
      },
    ],
  });

  return null;
}
