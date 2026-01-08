import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Epics",
};

export default function EpicsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
