import { Metadata } from "next";
import ProjectLayoutClient from "./ProjectLayoutClient";

export const metadata: Metadata = {
  title: "Project",
};

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  return <ProjectLayoutClient params={params}>{children}</ProjectLayoutClient>;
}
