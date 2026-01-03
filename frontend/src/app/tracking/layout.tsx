import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tracking | Devograph",
  description: "Track your daily progress, time, and blockers",
};

export default function TrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
