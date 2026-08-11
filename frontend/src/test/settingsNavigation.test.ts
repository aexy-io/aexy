/**
 * Guards the settings access model against the two ways it silently breaks.
 *
 * **Phantom permission keys.** The frontend permission map was hand-maintained
 * and had drifted so far that 39 of its 70 entries named permissions the backend
 * has never defined — `can_manage_webhooks`, `can_view_teams`,
 * `can_delete_workspace` — while 30 real ones were missing. Gating a page on a
 * key that doesn't exist hides it from *everyone*, forever, with no error
 * anywhere: nobody holds a permission that isn't in the catalogue. So this test
 * reads the backend catalogue directly and asserts the two agree.
 *
 * **Ungated pages.** An `adminOnly` boolean was set on only 10 of 30 nav entries,
 * leaving repositories, projects, task config, integrations, escalation, ticket
 * forms and billing open to every member. Every entry must now declare a gate or
 * be on the short, explicit list of personal-preference pages.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import {
  canAccessSettingsItem,
  getAllSettingsNavItems,
  settingsNavigation,
} from "@/config/settingsNavigation";
import { PERMISSIONS } from "@/hooks/usePermissions";

const PERMISSIONS_PY = resolve(__dirname, "../../../backend/src/aexy/models/permissions.py");

function backendCatalogue(): { all: Set<string>; ownerOnly: Set<string> } {
  const src = readFileSync(PERMISSIONS_PY, "utf8");
  const all = new Set([...src.matchAll(/^ {4}"(can_[a-z_]+)": \{/gm)].map((m) => m[1]));
  const block = src.slice(
    src.indexOf("OWNER_ONLY_PERMISSIONS"),
    src.indexOf("def get_admin_permissions")
  );
  const ownerOnly = new Set([...block.matchAll(/"(can_[a-z_]+)"/g)].map((m) => m[1]));
  return { all, ownerOnly };
}

/**
 * Pages that are a person's own preferences, not workspace configuration. Every
 * other entry must be gated. Listed explicitly so adding an ungated page is a
 * deliberate edit to this test rather than an oversight.
 */
const PERSONAL_PAGES = new Set([
  "appearance",
  "notifications",
  "identity",
  "api-tokens",
  // A person's own OAuth grants: made by them at a consent screen, listing and
  // revoking only what they authorised. Gating it behind a workspace permission
  // would stop someone revoking their own connector.
  "connectors",
]);

describe("settings permission catalogue", () => {
  it("only references permissions the backend actually defines", () => {
    const { all } = backendCatalogue();
    expect(all.size).toBeGreaterThan(50); // sanity: the file parsed

    const referenced = Object.values(PERMISSIONS);
    const phantom = referenced.filter((p) => !all.has(p));
    expect(phantom, `frontend names permissions the backend does not define`).toEqual([]);
  });

  it("exposes every backend permission", () => {
    const { all } = backendCatalogue();
    const referenced = new Set<string>(Object.values(PERMISSIONS));
    const missing = [...all].filter((p) => !referenced.has(p));
    expect(missing, "backend permissions absent from the frontend map").toEqual([]);
  });

  it("gates every settings page that isn't a personal preference", () => {
    const ungated = getAllSettingsNavItems()
      .filter((i) => !i.permission && !i.platformAdminOnly && !i.ownerOnly)
      .map((i) => i.id)
      .filter((id) => !PERSONAL_PAGES.has(id));
    expect(ungated, "settings pages visible to every member").toEqual([]);
  });

  it("marks the destructive and financial pages owner-only", () => {
    const byId = new Map(getAllSettingsNavItems().map((i) => [i.id, i]));
    for (const id of ["roles", "access", "billing", "plans", "sso"]) {
      expect(byId.get(id)?.ownerOnly, `${id} should be owner-only`).toBe(true);
    }
  });

  /**
   * CRM and Email Marketing settings used to be `external: true` entries pointing
   * at `/crm/settings` and `/email-marketing/settings` — pages that lived outside
   * `/settings` entirely, so the shell's gate never applied to them and the URL
   * was the only thing keeping the two in step. They are real settings routes
   * now, and this asserts every entry's href resolves to a page on disk, so a
   * moved or renamed route can't leave a nav item pointing at a 404.
   */
  it("points every internal entry at a route that exists", () => {
    const appDir = resolve(__dirname, "../app/(app)");
    const missing = getAllSettingsNavItems()
      .filter((i) => !i.external)
      .filter((i) => !existsSync(resolve(appDir, `.${i.href}/page.tsx`)))
      .map((i) => `${i.id} -> ${i.href}`);
    expect(missing, "settings nav entries with no page behind them").toEqual([]);
  });

  it("keeps nav ids unique so the pathname resolver can't pick the wrong gate", () => {
    const ids = getAllSettingsNavItems().map((i) => i.id);
    expect(ids.length).toBe(new Set(ids).size);
    const categoryIds = settingsNavigation.map((c) => c.id);
    expect(categoryIds.length).toBe(new Set(categoryIds).size);
  });
});

describe("canAccessSettingsItem", () => {
  const item = (over: Partial<Parameters<typeof canAccessSettingsItem>[0]> = {}) => ({
    id: "x",
    label: "X",
    href: "/settings/x",
    icon: (() => null) as never,
    description: "",
    keywords: [],
    ...over,
  });
  const plain = { permissions: [], isOwner: false, isPlatformAdmin: false };

  it("allows ungated pages for any member", () => {
    expect(canAccessSettingsItem(item(), plain)).toBe(true);
  });

  it("denies a gated page to someone without the permission", () => {
    expect(
      canAccessSettingsItem(item({ permission: PERMISSIONS.CAN_MANAGE_ORG }), plain)
    ).toBe(false);
  });

  it("allows it once the permission is granted", () => {
    expect(
      canAccessSettingsItem(item({ permission: PERMISSIONS.CAN_MANAGE_ORG }), {
        ...plain,
        permissions: [PERMISSIONS.CAN_MANAGE_ORG],
      })
    ).toBe(true);
  });

  it("denies owner-only pages even to someone holding the permission", () => {
    expect(
      canAccessSettingsItem(
        item({ permission: PERMISSIONS.CAN_MANAGE_BILLING, ownerOnly: true }),
        { ...plain, permissions: [PERMISSIONS.CAN_MANAGE_BILLING] }
      )
    ).toBe(false);
  });

  it("lets the owner through everything", () => {
    expect(
      canAccessSettingsItem(
        item({ permission: PERMISSIONS.CAN_MANAGE_BILLING, ownerOnly: true }),
        { ...plain, isOwner: true }
      )
    ).toBe(true);
  });

  it("keeps platform-admin pages away from workspace owners", () => {
    expect(
      canAccessSettingsItem(item({ platformAdminOnly: true }), { ...plain, isOwner: true })
    ).toBe(false);
    expect(
      canAccessSettingsItem(item({ platformAdminOnly: true }), {
        ...plain,
        isPlatformAdmin: true,
      })
    ).toBe(true);
  });

  it("requires all listed permissions unless anyPermission is set", () => {
    const both = item({
      permission: [PERMISSIONS.CAN_MANAGE_ORG, PERMISSIONS.CAN_MANAGE_TASKS],
    });
    const one = { ...plain, permissions: [PERMISSIONS.CAN_MANAGE_ORG] };
    expect(canAccessSettingsItem(both, one)).toBe(false);
    expect(canAccessSettingsItem({ ...both, anyPermission: true }, one)).toBe(true);
  });
});
