import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "Organization",
};

export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="organization">{children}</AppAccessGuard>;
}
