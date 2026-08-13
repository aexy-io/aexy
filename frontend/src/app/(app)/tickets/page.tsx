import { redirect } from "next/navigation";

/**
 * The personal work list moved to /my-work.
 *
 * It answers "what is on my plate?" across tasks, bugs, stories and form
 * tickets, and it used to live here — under a nav item called "Tickets", on a
 * page titled "My Work", next to a *different* nav item also called "My Work"
 * pointing at a second, thinner version of the same list. Two names for one
 * question and one name for two different things.
 *
 * This route stays as a redirect rather than being deleted because /tickets is
 * linked from a lot of places — the command palette, the `t` keyboard shortcut,
 * the app header, several dashboard widgets, the uptime incident pages — and
 * because it may well be bookmarked. Ticket *detail* pages are unmoved and
 * still live at /tickets/{id}.
 */
export default function TicketsPage() {
  redirect("/my-work");
}
