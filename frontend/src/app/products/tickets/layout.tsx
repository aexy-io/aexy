import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Issue Tracking Connected to Code, CRM, and Docs",
  description: "Aexy ticketing connects issues, code, CRM records, docs, planning, workflows, and AI agents for technical teams.",
};

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
