import { Metadata } from "next";
import HiringLayoutClient from "./HiringLayoutClient";

export const metadata: Metadata = {
  title: "Hiring",
};

export default function HiringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HiringLayoutClient>{children}</HiringLayoutClient>;
}
