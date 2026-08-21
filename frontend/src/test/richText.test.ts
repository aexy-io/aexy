import { describe, expect, it } from "vitest";

import { tokenise } from "@/components/service-desk/richText";

/**
 * Inbound mail is stored as plain text, and that conversion leaves artefacts: a
 * signature logo becomes `[image: https://host/logo.png]` and every hyperlink
 * appears twice as `url <url>`. Repeated down a quoted thread it is most of
 * what a KAM sees.
 */
describe("tokenise", () => {
  it("turns the reported placeholder into one image, not two links", () => {
    const segs = tokenise("[image: https://bimaplan.co] <https://bimaplan.co>");
    expect(segs).toEqual([{ kind: "image", src: "https://bimaplan.co" }]);
  });

  it("handles a bare image placeholder", () => {
    expect(tokenise("[image: https://host/logo.png]")).toEqual([
      { kind: "image", src: "https://host/logo.png" },
    ]);
  });

  it("renders a duplicated link once", () => {
    expect(tokenise("https://example.test <https://example.test>")).toEqual([
      { kind: "link", href: "https://example.test" },
    ]);
  });

  it("keeps surrounding prose intact", () => {
    const segs = tokenise("See https://example.test for details.");
    expect(segs).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", href: "https://example.test" },
      { kind: "text", text: " for details." },
    ]);
  });

  it("leaves text with no links or images alone", () => {
    expect(tokenise("Kindly get the synopsis signed.")).toEqual([
      { kind: "text", text: "Kindly get the synopsis signed." },
    ]);
  });

  it("matches images before links, so no stray placeholder remains", () => {
    // Matching links first would consume the URL inside the brackets and leave
    // "[image: ]" behind.
    const segs = tokenise("Regards\n[image: https://host/a.png]\nhttps://host/page");
    expect(segs.map((s) => s.kind)).toEqual(["text", "image", "text", "link"]);
    expect(segs.some((s) => s.kind === "text" && s.text.includes("[image"))).toBe(false);
  });

  it("does not swallow a trailing bracket or paren into the href", () => {
    const segs = tokenise("(see https://example.test) done");
    const link = segs.find((s) => s.kind === "link");
    expect(link).toEqual({ kind: "link", href: "https://example.test" });
  });

  it("survives an empty body", () => {
    expect(tokenise("")).toEqual([]);
  });
});
