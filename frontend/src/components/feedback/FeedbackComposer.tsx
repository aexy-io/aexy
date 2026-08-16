"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Lightbulb, Bug, HelpCircle, PackagePlus, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubmitFeedback } from "@/hooks/useFeedback";
import { useFeedbackStore } from "@/stores/feedbackStore";
import type { FeedbackKind } from "@/lib/api";

const KINDS: { id: FeedbackKind; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "suggestion", label: "Suggestion", icon: Lightbulb, hint: "Something we should build or change" },
  { id: "problem", label: "Problem", icon: Bug, hint: "Something is wrong or confusing" },
  { id: "question", label: "Question", icon: HelpCircle, hint: "You need an answer from us" },
  { id: "app_request", label: "App request", icon: PackagePlus, hint: "You want an app we haven't switched on" },
];

/**
 * The one place feedback is written.
 *
 * Opened from the user menu, the command palette, and the access grid when
 * somebody asks for an app only we can switch on. It always tells the author
 * what context it is attaching — the page, the workspace, the app they were
 * looking at — because collecting that quietly is the sort of thing people
 * should be able to see before they press send.
 */
export function FeedbackComposer() {
  const { isOpen, prefill, close } = useFeedbackStore();
  const { currentWorkspace } = useWorkspace();
  const pathname = usePathname();
  const submit = useSubmitFeedback(currentWorkspace?.id ?? null);

  const [kind, setKind] = useState<FeedbackKind>("suggestion");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Re-seed each time it opens: the composer is a form, not a draft, and a
  // stale "I'd like Learning" left over from last week would be worse than
  // starting empty.
  useEffect(() => {
    if (!isOpen) return;
    setKind(prefill?.kind ?? "suggestion");
    setSubject(prefill?.subject ?? "");
    setBody(prefill?.body ?? "");
  }, [isOpen, prefill]);

  const context = useMemo(
    () => ({
      route: pathname,
      workspace_name: currentWorkspace?.name ?? null,
      ...(prefill?.context ?? {}),
    }),
    [pathname, currentWorkspace?.name, prefill?.context],
  );

  const canSend = subject.trim().length >= 3 && body.trim().length > 0 && !submit.isPending;

  const handleSend = async () => {
    if (!canSend) return;
    try {
      await submit.mutateAsync({ kind, subject: subject.trim(), body: body.trim(), context });
      toast.success("Sent — thank you", {
        description: "You can follow it on the feedback board.",
      });
      close();
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 429
          ? "That's a few in a row — give it a minute and send the rest."
          : "Could not send that. Try again in a moment.",
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            It goes to the people who build Aexy. Everyone can see and vote for it on
            the board — your name and workspace are not shown there.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((option) => {
              const Icon = option.icon;
              const isActive = kind === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setKind(option.id)}
                  aria-pressed={isActive}
                  data-testid={`feedback-kind-${option.id}`}
                  className={`flex items-start gap-2 rounded-lg border p-3 text-left transition ${
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-subject" className="text-sm font-medium">
              Summary
            </label>
            <input
              id="feedback-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="One line — what is it?"
              data-testid="feedback-subject"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-body" className="text-sm font-medium">
              Detail
            </label>
            <textarea
              id="feedback-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              rows={5}
              placeholder="What were you doing, and what would you rather have happened?"
              data-testid="feedback-body"
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Sent with: {context.route}
            {currentWorkspace?.name ? ` · ${currentWorkspace.name}` : ""}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend} data-testid="feedback-send">
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
