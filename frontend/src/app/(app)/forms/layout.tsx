import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "Forms",
};

export default function FormsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="forms">{children}</AppAccessGuard>;
}
