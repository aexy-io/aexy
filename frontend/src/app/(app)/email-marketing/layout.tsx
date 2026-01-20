import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Email Marketing",
};

export default function EmailMarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
