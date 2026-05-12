import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Performance Reviews Connected to Real Work",
  description: "Run performance reviews, feedback, goals, growth plans, and people workflows connected to engineering and company context in Aexy.",
};

export default function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
