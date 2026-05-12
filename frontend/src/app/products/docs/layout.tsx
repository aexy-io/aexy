import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Company Docs and Knowledge Graph",
  description: "Create connected documentation, files, knowledge graph context, and agent-readable company memory inside the Aexy company OS.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
