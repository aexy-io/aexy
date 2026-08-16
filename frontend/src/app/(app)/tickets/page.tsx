import { redirect } from "next/navigation";

/**
 * The personal work list is the home dashboard.
 *
 * It answers "what is on my plate?" across tasks, bugs, stories and form
 * tickets, and it used to live here — under a nav item called "Tickets", on a
 * page titled "My Work", next to a *different* nav item also called "My Work"
 * pointing at a second, thinner version of the same list. Two names for one
 * question and one name for two different things. It has since moved again, to
 * /dashboard, because it is what people open the app to see.
 *
 * This route stays as a redirect rather than being deleted because /tickets is
 * linked from a lot of places — the command palette, the `t` keyboard shortcut,
 * the app header, several dashboard widgets, the uptime incident pages — and
 * because it may well be bookmarked. It points straight at the destination
 * rather than hopping through /my-work. Ticket *detail* pages are unmoved and
 * still live at /tickets/{id}.
 */
export default function TicketsPage() {
  redirect("/dashboard");
}
