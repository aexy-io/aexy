/**
 * What each intake target needs before it can be created.
 *
 * Small, and worth pinning: the panel enables its Create button from this, and
 * getting it wrong either blocks a valid run or lets through a row that belongs
 * nowhere — a task with no sprint, or a ticket with no form.
 */

import { describe, expect, it } from "vitest";

import {
  intakeNeeds,
  type IntakeCandidate,
  type IntakeTarget,
} from "@/lib/docx-intake-api";

function candidate(overrides: Partial<IntakeCandidate> = {}): IntakeCandidate {
  return {
    title: "Support CSV export",
    detail: "",
    source: "markers",
    kind: "action",
    origin: "",
    comment_id: null,
    paragraph_index: null,
    as_a: null,
    i_want: null,
    so_that: null,
    ...overrides,
  };
}

describe("intakeNeeds", () => {
  it("asks for a sprint only for tasks", () => {
    // A task has to live in a sprint. Nothing else does.
    expect(intakeNeeds("sprint_task")).toMatchObject({
      sprint: true,
      form: false,
    });
  });

  it("asks for a form only for tickets", () => {
    // A ticket's fields, its SLA and who it is for all come from its form, so
    // there is no sensible default.
    expect(intakeNeeds("ticket")).toMatchObject({ sprint: false, form: true });
  });

  it("asks for nothing at all for bugs", () => {
    // Workspace-scoped and self-keying, so a title is enough.
    expect(intakeNeeds("bug", [candidate()])).toEqual({
      sprint: false,
      form: false,
      persona: false,
    });
  });

  it("never asks for a sprint and a form at once", () => {
    // Both required on one run would be a sign the targets had been conflated.
    const targets: IntakeTarget[] = ["sprint_task", "bug", "user_story", "ticket"];
    for (const target of targets) {
      const needs = intakeNeeds(target, [candidate()]);
      expect(needs.sprint && needs.form).toBe(false);
    }
  });

  describe("the story persona", () => {
    it("is asked for when the document did not say", () => {
      // The server refuses rather than writing a placeholder, so the panel has
      // to ask — a story attributed to nobody in particular tells a team
      // nothing about who wanted it.
      expect(intakeNeeds("user_story", [candidate()]).persona).toBe(true);
    });

    it("is not asked for when the document already wrote it", () => {
      // "As a finance manager, I want…" answered the question on the page.
      expect(
        intakeNeeds("user_story", [candidate({ as_a: "finance manager" })]).persona
      ).toBe(false);
    });

    it("is asked for when only some were attributed", () => {
      // One bare candidate is enough to need an answer, and the attributed ones
      // keep their own.
      expect(
        intakeNeeds("user_story", [
          candidate({ as_a: "finance manager" }),
          candidate(),
        ]).persona
      ).toBe(true);
    });

    it("is never asked for any other target", () => {
      for (const target of ["sprint_task", "bug", "ticket"] as IntakeTarget[]) {
        expect(intakeNeeds(target, [candidate()]).persona).toBe(false);
      }
    });

    it("is not asked for before anything has been read", () => {
      // No candidates yet means no unattributed ones, so no question.
      expect(intakeNeeds("user_story").persona).toBe(false);
    });
  });
});
