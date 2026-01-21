import { Metadata } from "next";
import DocsLayoutClient from "./DocsLayoutClient";

export const metadata: Metadata = {
  title: "Docs",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DocsLayoutClient>{children}</DocsLayoutClient>;
}
