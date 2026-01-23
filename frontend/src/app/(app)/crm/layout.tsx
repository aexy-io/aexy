import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "CRM",
};

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="crm">{children}</AppAccessGuard>;
}
