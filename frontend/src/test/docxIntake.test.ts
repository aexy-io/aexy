/**
 * What each intake target needs before it can be created.
 *
 * Small, and worth pinning: the panel enables its Create button from this, and
 * getting it wrong either blocks a valid run or lets through a row that belongs
 * nowhere — a task with no sprint, or a ticket with no form.
 */

import { describe, expect, it } from "vitest";

import { intakeNeeds, type IntakeTarget } from "@/lib/docx-intake-api";

describe("intakeNeeds", () => {
  it("asks for a sprint only for tasks", () => {
    // A task has to live in a sprint. Nothing else does.
    expect(intakeNeeds("sprint_task")).toEqual({ sprint: true, form: false });
  });

  it("asks for a form only for tickets", () => {
    // A ticket's fields, its SLA and who it is for all come from its form, so
    // there is no sensible default.
    expect(intakeNeeds("ticket")).toEqual({ sprint: false, form: true });
  });

  it("asks for nothing for bugs and stories", () => {
    // Both are workspace-scoped and key themselves, so a title is enough.
    for (const target of ["bug", "user_story"] as IntakeTarget[]) {
      expect(intakeNeeds(target)).toEqual({ sprint: false, form: false });
    }
  });

  it("never asks for both at once", () => {
    // Two required pickers on one run would be a sign the targets had been
    // conflated.
    const targets: IntakeTarget[] = ["sprint_task", "bug", "user_story", "ticket"];
    for (const target of targets) {
      const needs = intakeNeeds(target);
      expect(needs.sprint && needs.form).toBe(false);
    }
  });
});
