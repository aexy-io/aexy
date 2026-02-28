"use client";

import { useState, useRef, useEffect } from "react";
import { ThumbsUp, ThumbsDown, Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { useAIFeedback, useSubmitFeedback } from "@/hooks/useAIFeedback";
import { cn } from "@/lib/utils";

interface MessageFeedbackProps {
  workspaceId: string;
  entityType: "ask_message" | "agent_execution" | "automation_run";
  entityId: string;
}

export function MessageFeedback({ workspaceId, entityType, entityId }: MessageFeedbackProps) {
  const { data: existing } = useAIFeedback(workspaceId, entityType, entityId);
  const { mutate: submit, isPending } = useSubmitFeedback(workspaceId);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [justSubmitted, setJustSubmitted] = useState<1 | -1 | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const currentRating = existing?.rating ?? null;

  const flashSuccess = (rating: 1 | -1) => {
    setJustSubmitted(rating);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setJustSubmitted(null), 1500);
  };

  const handleRate = (rating: -1 | 1) => {
    if (isPending) return;

    submit(
      { entity_type: entityType, entity_id: entityId, rating, comment: comment || null },
      {
        onSuccess: () => {
          flashSuccess(rating);
          toast.success(rating === 1 ? "Thanks for the feedback!" : "Sorry to hear that — tell us more?");
          if (rating === -1 && !showComment) {
            setShowComment(true);
          }
        },
      },
    );
  };

  const handleSubmitComment = () => {
    if (isPending) return;
    submit(
      {
        entity_type: entityType,
        entity_id: entityId,
        rating: -1,
        comment: comment || null,
      },
      {
        onSuccess: () => {
          setShowComment(false);
          setComment("");
          toast.success("Feedback submitted — thank you!");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-1 mt-1">
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleRate(1)}
          disabled={isPending}
          className={cn(
            "p-1 rounded transition-all duration-200",
            currentRating === 1
              ? "text-emerald-400 bg-emerald-400/10"
              : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10",
          )}
          title="Helpful"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ThumbsUp className={cn("h-3.5 w-3.5", justSubmitted === 1 && "scale-125")} />
          )}
        </button>
        <button
          onClick={() => handleRate(-1)}
          disabled={isPending}
          className={cn(
            "p-1 rounded transition-all duration-200",
            currentRating === -1
              ? "text-red-400 bg-red-400/10"
              : "text-muted-foreground hover:text-red-400 hover:bg-red-400/10",
          )}
          title="Not helpful"
        >
          <ThumbsDown className={cn("h-3.5 w-3.5", justSubmitted === -1 && "scale-125")} />
        </button>
        {justSubmitted && (
          <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 animate-in fade-in slide-in-from-left-1 duration-200">
            <Check className="h-3 w-3" />
            Saved
          </span>
        )}
      </div>

      {showComment && (
        <div className="flex items-start gap-1.5 mt-1">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went wrong?"
            rows={2}
            className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={handleSubmitComment}
              disabled={isPending}
              className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Send
            </button>
            <button
              onClick={() => setShowComment(false)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
