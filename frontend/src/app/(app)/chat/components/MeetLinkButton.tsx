"use client";

import { useCallback } from "react";
import { Video, Loader2 } from "lucide-react";
import { useCreateMeetLink } from "@/hooks/useChat";
import { toast } from "sonner";

interface MeetLinkButtonProps {
  workspaceId: string;
  onMeetLink: (link: string) => void;
}

export function MeetLinkButton({ workspaceId, onMeetLink }: MeetLinkButtonProps) {
  const createMeetLink = useCreateMeetLink(workspaceId);

  const handleClick = useCallback(() => {
    createMeetLink.mutate(undefined, {
      onSuccess: (data) => {
        onMeetLink(data.meet_link);
      },
      onError: (error: any) => {
        const message =
          error?.response?.data?.detail ||
          "Failed to create Meet link. Connect your Google Calendar in Settings > Integrations.";
        toast.error(message);
      },
    });
  }, [createMeetLink, onMeetLink]);

  return (
    <button
      onClick={handleClick}
      disabled={createMeetLink.isPending}
      className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors disabled:opacity-50"
      title="Create Google Meet link"
    >
      {createMeetLink.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Video className="h-4 w-4" />
      )}
    </button>
  );
}
