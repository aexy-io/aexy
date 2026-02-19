import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "Email Marketing",
};

export default function EmailMarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="email_marketing">{children}</AppAccessGuard>;
}
