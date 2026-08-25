import { describe, it, expect } from "vitest";
import { PAGE_SIZE, parsePage, themeAccent } from "@/lib/community-api";

/**
 * The public forum's page parameter and tenant theme.
 *
 * Both take values off a URL or out of admin-authored JSON and put them into a
 * database query or a `style` attribute, so both are places where "whatever
 * arrived" is the wrong answer.
 */

describe("parsePage", () => {
  it("treats a missing parameter as the first page", () => {
    expect(parsePage(undefined)).toBe(0);
  });

  it("maps the one-based URL to a zero-based index", () => {
    expect(parsePage("1")).toBe(0);
    expect(parsePage("2")).toBe(1);
    expect(parsePage("7")).toBe(6);
  });

  it("falls back to the first page for anything that isn't a page number", () => {
    // A hand-edited or crawler-mangled URL should render page one, not an error.
    expect(parsePage("0")).toBe(0);
    expect(parsePage("-3")).toBe(0);
    expect(parsePage("abc")).toBe(0);
    expect(parsePage("")).toBe(0);
    expect(parsePage("2; DROP TABLE")).toBe(1);
  });

  it("caps the page so a URL cannot ask the database to count to a billion", () => {
    expect(parsePage("1e9")).toBe(0);
    expect(parsePage("999999999")).toBe(1000);
  });

  it("reads the first value when the parameter is repeated", () => {
    expect(parsePage(["3", "9"])).toBe(2);
  });

  it("pairs with a page size the offset maths can use", () => {
    expect(parsePage("3") * PAGE_SIZE).toBe(100);
  });
});

describe("themeAccent", () => {
  it("accepts a hex colour in either length", () => {
    expect(themeAccent({ accent: "#0B6B3A" })).toBe("#0B6B3A");
    expect(themeAccent({ accent: "#abc" })).toBe("#abc");
    expect(themeAccent({ accent: "  #FFF  " })).toBe("#FFF");
  });

  it("reads the alternative key names a theme might use", () => {
    expect(themeAccent({ accent_color: "#123456" })).toBe("#123456");
    expect(themeAccent({ primary: "#123456" })).toBe("#123456");
  });

  it("returns null when there is no theme", () => {
    expect(themeAccent(undefined)).toBeNull();
    expect(themeAccent({})).toBeNull();
  });

  it("refuses anything that is not a colour", () => {
    // The value lands in a CSS custom property inside a style attribute, so
    // "any string the API returned" would be a way to smuggle in declarations.
    expect(themeAccent({ accent: "red; background: url(http://x)" })).toBeNull();
    expect(themeAccent({ accent: "javascript:alert(1)" })).toBeNull();
    expect(themeAccent({ accent: "var(--something)" })).toBeNull();
    expect(themeAccent({ accent: "#12345" })).toBeNull();
    expect(themeAccent({ accent: "#gggggg" })).toBeNull();
    expect(themeAccent({ accent: 16711680 })).toBeNull();
  });
});
