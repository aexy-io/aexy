import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";
import DocsLayoutClient from "./DocsLayoutClient";

export const metadata: Metadata = {
  title: "Docs",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppAccessGuard appId="docs">
      <DocsLayoutClient>{children}</DocsLayoutClient>
    </AppAccessGuard>
  );
}
