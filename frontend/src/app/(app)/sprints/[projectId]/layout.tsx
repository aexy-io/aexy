import { Metadata } from "next";
import ProjectLayoutClient from "./ProjectLayoutClient";

  // Object form, not a bare string. A bare `title` *replaces* the parent's
  // `{ default, template }` object rather than merging with it, which deletes
  // the inherited template for this entire subtree — every descendant then
  // renders its own bare title with no " | Aexy" at all. /gtm/analytics
  // shipped as the literal string "Analytics".
export const metadata: Metadata = {
  title: { default: "Project", template: "%s · Project | Aexy" },
};

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  return <ProjectLayoutClient params={params}>{children}</ProjectLayoutClient>;
}
