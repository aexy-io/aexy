"use client";

import { useWorkspace } from "@/hooks/useWorkspace";
import { ReminderCreationWizard } from "@/components/reminders/wizard/ReminderCreationWizard";
import { useRouter } from "next/navigation";

export default function NewReminderPage() {
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();

  if (!currentWorkspace?.id) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <ReminderCreationWizard
      workspaceId={currentWorkspace.id}
      onClose={() => router.push("/compliance/reminders")}
      onSuccess={(reminderId) => router.push(`/compliance/reminders/${reminderId}`)}
    />
  );
}
