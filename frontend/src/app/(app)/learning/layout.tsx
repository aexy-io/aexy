import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "Learning",
};

export default function LearningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="learning">{children}</AppAccessGuard>;
}
