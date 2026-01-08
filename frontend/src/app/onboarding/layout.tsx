import { Metadata } from "next";
import OnboardingLayoutClient from "./OnboardingLayoutClient";

export const metadata: Metadata = {
  title: "Onboarding",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OnboardingLayoutClient>{children}</OnboardingLayoutClient>;
}
