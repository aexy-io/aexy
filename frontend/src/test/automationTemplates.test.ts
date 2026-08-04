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
  it("offers templates only for modules the backend has enabled", () => {
    // This used to assert an exact list of three CRM template names, from when
    // the builder was CRM-only. Pinning the names meant the test failed for
    // adding a template rather than for shipping a broken one — so it now
    // asserts the property that actually matters, and holds however the gallery
    // grows: a template for a module the registry doesn't offer can never be
    // saved, because the module picker won't list it.
    expect(enabledTemplates.length).toBeGreaterThan(0);
    for (const template of enabledTemplates) {
      expect(registry.modules).toContain(template.module);
    }
  });

  it("gives every template a distinct name", () => {
    // The gallery keys on name; a duplicate silently hides one of them.
    const names = enabledTemplates.map((template) => template.name);
    expect(new Set(names).size).toBe(names.length);
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
