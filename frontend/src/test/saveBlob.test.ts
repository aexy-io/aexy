/**
 * `saveBlob` — the two properties every hand-rolled copy of this got wrong.
 *
 * Both failures are invisible in the browser people develop in. A detached
 * anchor downloads fine in Chrome and does nothing at all in Firefox, and a
 * same-tick `revokeObjectURL` usually wins the race until the file is big enough
 * that it doesn't, at which point the user gets a truncated file and no error.
 * Neither shows up in a manual click-through, so they are asserted here instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveBlob } from "@/lib/utils";

describe("saveBlob", () => {
  /** Whether the anchor was in the document at the moment it was clicked. */
  let attachedWhenClicked: boolean | null;
  let revoked: string[];
  let created: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    attachedWhenClicked = null;
    revoked = [];
    created = [];

    // jsdom implements neither half of the object-URL API.
    let counter = 0;
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:test/${(counter += 1)}`;
      created.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));

    // jsdom's anchor click does not navigate, so the click itself is the only
    // observable moment — record the DOM state from inside it.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      attachedWhenClicked = document.body.contains(this);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clicks the anchor while it is attached to the document", () => {
    saveBlob(new Blob(["a,b\n1,2\n"], { type: "text/csv" }), "tickets.csv");

    // Firefox does nothing at all when this is false.
    expect(attachedWhenClicked).toBe(true);
  });

  it("does not revoke the object URL in the same tick as the click", () => {
    saveBlob(new Blob(["a,b\n1,2\n"], { type: "text/csv" }), "tickets.csv");

    expect(created).toHaveLength(1);
    // The browser may not have started reading the blob yet.
    expect(revoked).toEqual([]);

    vi.advanceTimersByTime(10_000);

    // ...but it is released eventually, so a page exporting repeatedly does not
    // pin every blob it ever made.
    expect(revoked).toEqual(created);
  });

  it("names the file and leaves no anchor behind", () => {
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });

    saveBlob(new Blob(["{}"], { type: "application/json" }), "insights-export.json");

    expect(names).toEqual(["insights-export.json"]);
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });
});
