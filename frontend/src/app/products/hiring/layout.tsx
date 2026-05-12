import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Technical Hiring with AI Assessments",
  description: "Run technical hiring with skills evidence, assessments, candidate pipelines, interviews, and team context in Aexy.",
};

export default function HiringLayout({ children }: { children: React.ReactNode }) {
  return children;
}
