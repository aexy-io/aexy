import { Metadata } from "next";

export const metadata: Metadata = {
  title: "GTM Intelligence",
};

export default function GTMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
