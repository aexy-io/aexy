import { Metadata } from "next";

export const metadata: Metadata = {
  title: "CRM",
};

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
