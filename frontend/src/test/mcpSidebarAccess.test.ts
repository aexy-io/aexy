/**
 * The MCP app's own page must stay reachable for people who can use MCP.
 *
 * The three `mcp` modules gate groups of API capabilities — workspace
 * administration, provider integrations, billing — not pages. They briefly
 * carried `route: "/mcp"`, the app's own base route, which meant
 * `getModuleIdFromPath("/mcp")` answered with whichever module happened to sort
 * first. The sidebar checks module access after app access, so denying that
 * module to ordinary members (which is the point of the modules) took the MCP
 * link out of the sidebar for everyone who was not an admin — while they could
 * still reach 25 of the 28 MCP capabilities.
 */

import { describe, it, expect } from "vitest";
import {
  APP_CATALOG,
  getAppIdFromPath,
  getModuleIdFromPath,
  getModuleForRoute,
} from "@/config/appDefinitions";

describe("MCP modules gate capabilities, not pages", () => {
  it("declares no route on any mcp module", () => {
    const modules = APP_CATALOG.mcp.modules;
    expect(modules.length).toBeGreaterThan(0);
    for (const mod of modules) {
      expect(mod.route, `mcp module ${mod.id} should have no route`).toBeUndefined();
    }
  });

  it("does not resolve the app's own page to one of them", () => {
    expect(getAppIdFromPath("/mcp")).toBe("mcp");
    // The sidebar reads this: a module id here means "check that module's
    // grant", and denying it hides the link.
    expect(getModuleIdFromPath("/mcp")).toBeUndefined();
  });

  it("keeps getModuleForRoute quiet for the mcp page", () => {
    expect(getModuleForRoute("/mcp")).toBeUndefined();
  });

  /**
   * The generic half of the same bug: any module whose route equals its app's
   * base route makes the app's landing page inherit that module's grant.
   * Modules anchored at "" say that deliberately — Service Desk's dashboard IS
   * the landing page. An absolute route equal to the base route does not.
   */
  it("has no module claiming its own app's base route", () => {
    for (const [appId, app] of Object.entries(APP_CATALOG)) {
      for (const mod of app.modules) {
        expect(
          mod.route,
          `${appId}.${mod.id} claims the app's base route, so ${app.baseRoute} ` +
            `inherits that module's grant`
        ).not.toBe(app.baseRoute);
      }
    }
  });

  it("still resolves real module pages", () => {
    // Guards the fix from being "return undefined for everything".
    expect(getModuleIdFromPath("/sprints/board")).toBe("board");
    expect(getModuleIdFromPath("/service-desk")).toBe("dashboard");
  });
});
