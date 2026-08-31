import { describe, expect, it } from "vitest";

import { isSidebarItemActive, type SidebarItemConfig } from "@/config/sidebarLayouts";

/**
 * Planning has two entries on one path — Board at `/sprints`, Epics at
 * `/sprints?tab=epics`. The rule used to strip the query and compare paths, so
 * both lit up at once on every `/sprints/...` route and the sidebar never told
 * anybody which of the two views they were actually in.
 */
const planning: SidebarItemConfig[] = [
  { href: "/sprints", label: "Board" },
  { href: "/sprints?tab=epics", label: "Epics" },
] as SidebarItemConfig[];

const active = (href: string, url: string) => {
  const [pathname, query = ""] = url.split("?");
  return isSidebarItemActive(href, pathname, new URLSearchParams(query), planning);
};

describe("sidebar active item", () => {
  it("marks Board, and not Epics, on the bare path", () => {
    expect(active("/sprints", "/sprints")).toBe(true);
    expect(active("/sprints?tab=epics", "/sprints")).toBe(false);
  });

  it("marks Epics, and not Board, once the tab is named", () => {
    expect(active("/sprints?tab=epics", "/sprints?tab=epics")).toBe(true);
    expect(active("/sprints", "/sprints?tab=epics")).toBe(false);
  });

  it("keeps Board lit on a tab that has no entry of its own", () => {
    // Tasks and Automations are in the page's own switcher, not the sidebar.
    // Planning is still where the reader is, so the parent entry stays marked.
    expect(active("/sprints", "/sprints?tab=tasks")).toBe(true);
    expect(active("/sprints?tab=epics", "/sprints?tab=tasks")).toBe(false);
  });

  it("keeps Board lit on a project route beneath it", () => {
    expect(active("/sprints", "/sprints/proj-1/board")).toBe(true);
  });

  it("ignores params the entry does not name", () => {
    // A task deep link on the epics tab is still the epics tab.
    expect(active("/sprints?tab=epics", "/sprints?tab=epics&q=billing")).toBe(true);
  });

  it("still treats the dashboard as an exact match", () => {
    expect(isSidebarItemActive("/dashboard", "/dashboard", new URLSearchParams())).toBe(true);
    expect(isSidebarItemActive("/dashboard", "/dashboard/x", new URLSearchParams())).toBe(false);
  });
});
