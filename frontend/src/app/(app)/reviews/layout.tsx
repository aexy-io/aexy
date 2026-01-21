import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  title: "Reviews",
};

export default function ReviewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="reviews">{children}</AppAccessGuard>;
}
