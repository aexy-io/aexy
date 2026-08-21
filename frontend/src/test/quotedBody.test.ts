import { describe, expect, it } from "vitest";

import { isLongBody, splitQuotedBody } from "@/components/service-desk/QuotedBody";

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

  it("folds a real forwarded partner request, signature and all", () => {
    // The shape that exposed the original heuristic: three levels of quoting,
    // and the sender's OWN signature after the quoted block. Requiring a clean
    // tail meant this folded nothing and rendered every marker raw.
    const body = [
      "Hi Team,",
      "",
      "Greetings of the day!",
      "",
      "As requested by the insurer, please find attached the *revised synopsis*.",
      "",
      "Kindly get the revised synopsis signed along with the MPH.",
      "",
      "On Tue, 11 Aug 2026 at 14:20, aakanksha mishra <a.m@example.test> wrote:",
      "",
      "> Hi Team,",
      ">",
      "> As per the insurer's confirmation, the addendum has been implemented.",
      ">",
      "> On Mon, 13 Jul 2026 at 13:36, Pyramid Info <info@example.test> wrote:",
      ">",
      ">> Hi Maam",
      ">>",
      ">> I am writing to request a revision of the minimum Sum Assured.",
      ">>",
      ">> Thank you,",
      ">",
      "> --",
      "> Thanks and Regards,",
      "",
      "",
      "--",
      "Thanks and Regards,",
      "",
      "[image: https://example.test] <https://example.test>",
    ].join("\n");

    const { fresh, quoted } = splitQuotedBody(body);
    expect(fresh).toContain("Kindly get the revised synopsis signed");
    expect(fresh).not.toContain(">");
    // The whole history, both levels, plus the trailing signature.
    expect(quoted).toContain("addendum has been implemented");
    expect(quoted).toContain("minimum Sum Assured");
    expect(quoted).toContain("Thanks and Regards");
  });

  it("folds a bare quote run with no attribution line", () => {
    const { fresh, quoted } = splitQuotedBody(
      ["Sorted, thanks.", "", "> Is this done?", "> Please confirm."].join("\n"),
    );
    expect(fresh).toBe("Sorted, thanks.");
    expect(quoted).toContain("Is this done?");
  });

  it("ignores a From: that is prose rather than a header", () => {
    const body = [
      "From: the customer's perspective this is already resolved.",
      "",
      "Closing it off.",
    ].join("\n");
    expect(splitQuotedBody(body)).toEqual({ fresh: body, quoted: "" });
  });

  it("folds an attribution line that wrapped onto two lines", () => {
    // Real mail wraps it constantly. Left unhandled, the single-line form
    // folded and the wrapped one dangled above the fold — same email, two
    // different renderings.
    const { fresh, quoted } = splitQuotedBody(
      [
        "Please action this.",
        "",
        "On Tue, 11 Aug 2026 at 14:20, aakanksha mishra <a.m@example.test>",
        "wrote:",
        "",
        "> the original ask",
        "> second line",
      ].join("\n"),
    );
    expect(fresh).toBe("Please action this.");
    expect(quoted).toContain("On Tue, 11 Aug 2026");
    expect(quoted).toContain("the original ask");
  });
});

/**
 * A long body pushed the ticket's own fields, actions and reply box off the
 * screen, so reading the ticket meant scrolling past the mail to reach anything
 * you could act on. It arrives folded now — but only when it is genuinely long,
 * or every two-line "thanks, done" grows a pointless button.
 */
describe("isLongBody", () => {
  it("leaves a short message unfolded", () => {
    expect(isLongBody("Thanks, closing this off.")).toBe(false);
  });

  it("leaves an empty body alone", () => {
    expect(isLongBody("")).toBe(false);
  });

  it("folds a wall of short lines", () => {
    expect(isLongBody(Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n"))).toBe(true);
  });

  it("folds few lines that are each long enough to wrap across the card", () => {
    // Three newlines only, so a line count alone would call this short while it
    // still renders as half a screen of wrapped text.
    expect(isLongBody(["x".repeat(400), "y".repeat(400), "z".repeat(400)].join("\n"))).toBe(true);
  });

  it("does not fold a body that sits just under both thresholds", () => {
    expect(isLongBody(Array.from({ length: 12 }, () => "a short line").join("\n"))).toBe(false);
  });
});
