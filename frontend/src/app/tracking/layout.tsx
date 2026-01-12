import PrimaryLayout from "@/components/layout/PrimaryLayout";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tracking",
  description: "Track your daily progress, time, and blockers",
};

export default function TrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PrimaryLayout>{children}</PrimaryLayout>;
}
