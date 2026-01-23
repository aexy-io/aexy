import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "Tickets",
};

export default function TicketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="tickets">{children}</AppAccessGuard>;
}
