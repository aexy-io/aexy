import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "Sprints",
};

export default function SprintsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="sprints">{children}</AppAccessGuard>;
}
