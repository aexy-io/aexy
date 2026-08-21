import { describe, expect, it } from "vitest";

import { splitQuotedBody } from "@/components/service-desk/QuotedBody";

/**
 * Correspondence was rendered raw, so every reply repeated the whole thread
 * behind `>` markers and the newest message — the only part being read for —
 * sat above screens of text already read.
 */
describe("splitQuotedBody", () => {
  it("splits the reply from the history it quotes", () => {
    const { fresh, quoted } = splitQuotedBody(
      [
        "Chased the vendor, they promise Thursday.",
        "",
        "On Tue, 3 Jun 2026 at 10:02, Partner Co wrote:",
        "> Any update on this?",
        ">> Original request attached.",
      ].join("\n"),
    );
    expect(fresh).toBe("Chased the vendor, they promise Thursday.");
    expect(quoted).toContain("Any update on this?");
    expect(quoted).toContain("Original request attached.");
  });

  it("leaves a message with no quoted history whole", () => {
    const body = "Just a plain reply.\nSecond line.";
    expect(splitQuotedBody(body)).toEqual({ fresh: body, quoted: "" });
  });

  it("does not fold a body that is quoted from its very first line", () => {
    // Somebody replying inline above nothing. Folding here would collapse the
    // entry to an empty message.
    const body = "> Any update on this?\n> Thanks";
    expect(splitQuotedBody(body)).toEqual({ fresh: body, quoted: "" });
  });

  it("keeps a stray > in prose out of the boundary", () => {
    // A real body that happens to contain a quote marker mid-sentence, with
    // ordinary prose after it. Treating that as the history would hide content.
    const body = [
      "The rule is: if amount > 1000 then escalate.",
      "",
      "Please confirm that is right.",
    ].join("\n");
    expect(splitQuotedBody(body)).toEqual({ fresh: body, quoted: "" });
  });

  it("recognises a forwarded block as history", () => {
    const { fresh, quoted } = splitQuotedBody(
      [
        "Forwarding for your action.",
        "",
        "---------- Forwarded message ----------",
        "From: someone@partner.example",
        "To: ops@desk.example",
        "Subject: Renewal",
        "",
        "> Please renew.",
      ].join("\n"),
    );
    expect(fresh).toBe("Forwarding for your action.");
    expect(quoted).toContain("Forwarded message");
    expect(quoted).toContain("Please renew.");
  });

  it("survives an empty body", () => {
    expect(splitQuotedBody("")).toEqual({ fresh: "", quoted: "" });
  });
});
