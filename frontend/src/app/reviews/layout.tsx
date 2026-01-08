import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reviews",
};

export default function ReviewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
