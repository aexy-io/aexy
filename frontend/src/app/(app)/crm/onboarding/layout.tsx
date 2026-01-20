import { Metadata } from "next";
import CRMOnboardingLayoutClient from "./CRMOnboardingLayoutClient";

export const metadata: Metadata = {
  title: "CRM Setup",
};

export default function CRMOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CRMOnboardingLayoutClient>{children}</CRMOnboardingLayoutClient>;
}
