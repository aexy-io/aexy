/**
 * Turning a Word document into issues, in two steps.
 *
 * `preview` reads and proposes; `create` writes. Nothing reaches a board until a
 * person has seen the list and taken things off it — these rows become work a
 * team is measured against, and a model that mistook a heading for a deliverable
 * would otherwise put a phantom task in somebody's sprint.
 *
 * Both pickers belong to the run, not the workspace: the same document read for
 * "unresolved comments → tickets" and for "requirements → sprint tasks" is two
 * different asks.
 */

import { api } from "@/lib/api";

/** Where to read from. Combinable. */
export type IntakeSource = "comments" | "markers" | "model";

/** What to create. */
export type IntakeTarget = "sprint_task" | "bug" | "user_story" | "ticket";

export interface IntakeCandidate {
  title: string;
  detail: string;
  /**
   * Which source produced it. Shown, not just recorded: whether a reviewer wrote
   * it, an author tagged it, or a model inferred it warrants different amounts
   * of trust from whoever is deciding to keep it.
   */
  source: IntakeSource;
  kind: string;
  origin: string;
  comment_id: string | null;
  paragraph_index: number | null;
}

export interface IntakeCreatedIssue {
  id: string;
  title: string;
  key: string | null;
}

export const docxIntakeApi = {
  preview: async (
    workspaceId: string,
    documentId: string,
    sources: IntakeSource[]
  ): Promise<{ candidates: IntakeCandidate[] }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/docx-ai/documents/${documentId}/intake/preview`,
      { sources }
    );
    return response.data;
  },

  create: async (
    workspaceId: string,
    documentId: string,
    body: {
      target: IntakeTarget;
      /**
       * Sent back rather than re-derived server-side, so a second model run
       * cannot quietly produce a different list than the one that was approved.
       */
      candidates: IntakeCandidate[];
      sprint_id?: string | null;
      form_id?: string | null;
      labels?: string[];
      assignee_id?: string | null;
    }
  ): Promise<{ created: IntakeCreatedIssue[]; target: IntakeTarget }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/docx-ai/documents/${documentId}/intake`,
      body
    );
    return response.data;
  },
};

/** What each target needs before it can be created. */
export function intakeNeeds(target: IntakeTarget): {
  sprint: boolean;
  form: boolean;
} {
  return {
    // A task has to live in a sprint.
    sprint: target === "sprint_task",
    // A ticket's fields, its SLA and who it is for all come from its form, so
    // there is no sensible default.
    form: target === "ticket",
  };
}
