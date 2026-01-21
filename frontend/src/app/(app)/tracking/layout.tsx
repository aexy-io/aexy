import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "Tracking",
  description: "Track your daily progress, time, and blockers",
};

export default function TrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="tracking">{children}</AppAccessGuard>;
}
