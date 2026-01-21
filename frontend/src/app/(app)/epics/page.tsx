import { redirect } from "next/navigation";

export default function EpicsPage() {
  redirect("/sprints?tab=epics");
}
