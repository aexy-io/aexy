/**
 * The app catalogue and the system bundles must mean the same thing on both sides.
 *
 * `backend/src/aexy/models/app_definitions.py` and `src/config/appDefinitions.ts`
 * are two hand-written copies of one decision. CLAUDE.md says to keep them in
 * sync; without a test saying so, they didn't. Every bundle disagreed about five
 * apps:
 *
 *  - `service_desk` was granted by all four bundles here and none on the backend,
 *    so a department put on the Engineering profile could not reach the Service
 *    Desk while this file's own "Start from Engineering" grid said it could;
 *  - `chat`, `community`, `gtm` and `leave` were granted by all four backend
 *    bundles and none here, so filling that grid from a bundle silently revoked
 *    four apps from everyone in the department.
 *
 * Nothing raised. Which apps a profile granted depended on which side the code
 * path happened to read — and the backend is the one that is enforced, so the
 * frontend copy was quietly wrong.
 *
 * The fixture is generated from the backend by
 * `backend/scripts/dump_app_catalog.py`; that script's `--check` mode keeps the
 * fixture itself honest, and this test keeps the TypeScript matching it. Adding an
 * app or changing a bundle now fails on whichever side was forgotten.
 */

import { describe, expect, it } from "vitest";

import { APP_CATALOG, SYSTEM_BUNDLES } from "@/config/appDefinitions";

import fixture from "./fixtures/app-catalog.generated.json";

/** The same shape the dump script writes, built from the TypeScript. */
function localApps() {
  return Object.fromEntries(
    Object.entries(APP_CATALOG)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, app]) => [
        id,
        {
          name: app.name,
          category: app.category,
          base_route: app.baseRoute,
          required_permission: app.requiredPermission ?? null,
          modules: app.modules.map((m) => m.id).sort(),
        },
      ]),
  );
}

function localBundles() {
  return Object.fromEntries(
    [...SYSTEM_BUNDLES]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((bundle) => [
        bundle.id,
        {
          name: bundle.name,
          // Only the granted apps, matching the fixture: an absent key and
          // `enabled: false` mean the same thing to every reader, and comparing
          // them would fail on how each side spells "no".
          apps: Object.fromEntries(
            Object.entries(bundle.appConfig)
              .filter(([, config]) => config.enabled)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([id, config]) => [
                id,
                { modules: Object.keys(config.modules ?? {}).sort() },
              ]),
          ),
        },
      ]),
  );
}

describe("app catalogue parity with the backend", () => {
  it("catalogues the same apps, with the same routes, permissions and modules", () => {
    expect(localApps()).toEqual(fixture.apps);
  });

  it("grants the same apps in every system bundle", () => {
    expect(localBundles()).toEqual(fixture.bundles);
  });

  it("names every app a bundle grants", () => {
    // A bundle granting an app the catalogue doesn't describe renders as a blank
    // row in the access grid, and resolves to an app nothing can navigate to.
    for (const bundle of SYSTEM_BUNDLES) {
      for (const appId of Object.keys(bundle.appConfig)) {
        expect(APP_CATALOG[appId], `${bundle.id} grants unknown app ${appId}`).toBeDefined();
      }
    }
  });

  it("names every module a bundle toggles", () => {
    // A module id in a bundle that the app doesn't have is dead configuration: the
    // grid never shows it, so nobody can see it is set.
    for (const bundle of SYSTEM_BUNDLES) {
      for (const [appId, config] of Object.entries(bundle.appConfig)) {
        const known = new Set((APP_CATALOG[appId]?.modules ?? []).map((m) => m.id));
        for (const moduleId of Object.keys(config.modules ?? {})) {
          expect(known.has(moduleId), `${bundle.id}.${appId} toggles unknown module ${moduleId}`).toBe(
            true,
          );
        }
      }
    }
  });
});
