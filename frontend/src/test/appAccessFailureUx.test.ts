/**
 * Failures in the app-access controls, which had no user-facing outcome at all.
 *
 * The sidebar's admin quick-enable sent its 403 to `console.error`: the spinner
 * stopped, the app stayed disabled, and nothing said why. Beside it, the
 * request-access button used a bare `catch {}`, so a request that never sent
 * looked exactly like one that did.
 *
 * The 403 is reachable rather than hypothetical. The button renders on
 * `is_admin`, which `AppAccessService._is_admin` grants to a custom
 * admin-equivalent role, while the endpoint's `WorkspaceService.check_permission`
 * scores a custom role name as zero — so the product offers a control it will
 * then refuse.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, "..", relative), "utf8");

const SIDEBAR = read("components/layout/Sidebar.tsx");
const MODAL = read("components/members/MemberAppAccessModal.tsx");

describe("the sidebar's app-access controls", () => {
  it("tells somebody when enabling an app fails", () => {
    // The whole defect: the only outcome was a console line.
    expect(SIDEBAR).not.toMatch(/console\.error\("Failed to enable app:"/);
    expect(SIDEBAR).toMatch(/toast\.error\(/);
  });

  it("names the permission case rather than reporting a generic failure", () => {
    // "Could not enable" leaves somebody retrying a button that will never
    // work. A 403 here means their role is the problem, and that is actionable.
    expect(SIDEBAR).toMatch(/status === 403/);
    expect(SIDEBAR).toMatch(/Ask a workspace owner or admin/);
  });

  it("does not swallow a failed access request", () => {
    // `catch {}` made an unsent request indistinguishable from a sent one.
    // Matched as code (a closing brace before it), so the note explaining the
    // old `catch {}` does not satisfy its own assertion.
    expect(SIDEBAR).not.toMatch(/\}\s*catch\s*\{\s*\}/);
  });
});

describe("the member app-access modal", () => {
  it("reports the server's reason, not just that something failed", () => {
    // It already toasted, but "Failed to update app access" reads identically
    // for a 403, a validation error and a dropped connection.
    expect(MODAL).toMatch(/getApiErrorMessage\(error, "Failed to update app access"\)/);
    expect(MODAL).toMatch(/getApiErrorMessage\(error, "Failed to reset access"\)/);
  });
});
