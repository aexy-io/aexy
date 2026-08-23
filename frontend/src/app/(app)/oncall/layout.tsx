import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "On-Call", template: "%s · On-Call | Aexy" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
