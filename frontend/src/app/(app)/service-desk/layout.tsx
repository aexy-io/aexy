import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "Service Desk",
};

export default function ServiceDeskLayout({ children }: { children: React.ReactNode }) {
  return <AppAccessGuard appId="service_desk">{children}</AppAccessGuard>;
}
