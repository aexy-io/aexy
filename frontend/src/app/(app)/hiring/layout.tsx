import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";
import HiringLayoutClient from "./HiringLayoutClient";

export const metadata: Metadata = {
  title: "Hiring",
};

export default function HiringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppAccessGuard appId="hiring">
      <HiringLayoutClient>{children}</HiringLayoutClient>
    </AppAccessGuard>
  );
}
