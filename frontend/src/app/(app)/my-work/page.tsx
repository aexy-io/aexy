import { redirect } from "next/navigation";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Work" };

/**
 * The personal work list is now the home dashboard.
 *
 * It answers "what is on my plate?" across tasks, bugs, stories and form
 * tickets, which is what people open the app to find out — so it took over
 * /dashboard, and the widget dashboard that used to live there moved to
 * /dashboard/overview.
 *
 * This route stays as a redirect rather than being deleted because /my-work is
 * linked from the command palette, the `t` keyboard shortcut, the app header
 * and the sidebar, and because it may well be bookmarked.
 */
export default function MyWorkPage() {
  redirect("/dashboard");
}
