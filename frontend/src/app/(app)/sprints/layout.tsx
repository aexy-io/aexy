import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sprints",
};

export default function SprintsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
