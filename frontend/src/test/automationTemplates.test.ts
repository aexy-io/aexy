/**
 * Templates must only reference triggers/actions the backend actually
 * registers. The "Deal Stage Notification" template shipped broken twice —
 * once with an action id no handler implemented (`send_notification`), once
 * with a trigger id nothing emits (`deal.stage_changed`) — and both failed
 * silently at runtime rather than at build time. This pins them to the
 * generated backend registry so a typo fails here instead.
 *
 * Regenerate the fixture with backend/scripts/dump_automation_schema.py.
 */
import { describe, it, expect } from "vitest";

import schema from "../../e2e/fixtures/automation-schema.generated.json";
import { CRM_TEMPLATE_LIST } from "@/lib/automationTemplates";

type Registry = {
  modules: string[];
  triggers: Record<string, { id: string }[]>;
  actions: Record<string, { id: string }[]>;
};

const registry = schema as Registry;

// Mirrors get_actions_for_module(): common actions + module-specific ones.
const validActions = (module: string) =>
  [...(registry.actions.common ?? []), ...(registry.actions[module] ?? [])].map((a) => a.id);

const enabledTemplates = CRM_TEMPLATE_LIST;

describe("automation templates match the backend registry", () => {
  it("offers exactly the three supported CRM starting templates", () => {
    expect(enabledTemplates.map((template) => template.name)).toEqual([
      "Lead Follow-up Sequence",
      "Welcome Email Sequence",
      "Deal Stage Notification",
    ]);
    expect(enabledTemplates.every((template) => template.module === "crm")).toBe(true);
  });

  it.each(enabledTemplates.map((t) => [t.name, t] as const))(
    "%s uses a trigger the backend emits",
    (_name, template) => {
      const valid = (registry.triggers[template.module] ?? []).map((t) => t.id);
      expect(valid).toContain(template.triggerType);
    }
  );

  it.each(enabledTemplates.map((t) => [t.name, t] as const))(
    "%s uses actions the backend implements",
    (_name, template) => {
      // No skip for wait/condition/branch: those are dropped when the canvas
      // is flattened for publishing, so a template using one would ship an
      // automation that silently omits that step. They must fail here.
      const valid = validActions(template.module);
      for (const action of template.actions) {
        expect(valid).toContain(action.type);
      }
    }
  );
});
