import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Engineering Activity Tracking Without Surveillance",
  description: "Understand engineering activity, blockers, code context, and team progress without invasive surveillance using Aexy.",
};

export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
