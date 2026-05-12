import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Aexy pricing for open-source self-hosting, cloud teams, and enterprise company OS deployments with CRM, GTM, docs, workflows, and AI agents.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
