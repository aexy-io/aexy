import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learning",
};

export default function LearningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
