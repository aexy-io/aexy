/**
 * The snippet renderer, and the one thing it must never do.
 *
 * `ts_headline` wraps the matched words and leaves the rest of the document
 * body exactly as it was — it is not an HTML escaper. So the snippet is
 * attacker-influenced text with markup in it, and the difference between
 * parsing the markers and injecting the string is the difference between a
 * highlight and stored XSS on the search results of every page a user can
 * read.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { highlightSnippet } from "./highlightSnippet";

function draw(snippet: string) {
  return render(<p data-testid="snippet">{highlightSnippet(snippet)}</p>);
}

describe("highlightSnippet", () => {
  it("marks the matched terms", () => {
    draw("A chargeback is not a <mark>refund</mark>.");

    const marks = screen.getByTestId("snippet").querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("refund");
    expect(screen.getByTestId("snippet").textContent).toBe(
      "A chargeback is not a refund.",
    );
  });

  it("marks every occurrence", () => {
    draw("<mark>refund</mark> then another <mark>refund</mark>");

    expect(screen.getByTestId("snippet").querySelectorAll("mark")).toHaveLength(
      2,
    );
  });

  it("renders a plain snippet as plain text", () => {
    // The semantic half of search returns raw chunk text with no markers.
    draw("Evidence must be submitted within seven days.");

    const el = screen.getByTestId("snippet");
    expect(el.querySelectorAll("mark")).toHaveLength(0);
    expect(el.textContent).toBe("Evidence must be submitted within seven days.");
  });

  it("does not execute markup that came from the document body", () => {
    // What a page containing this would produce: ts_headline copies it
    // through verbatim, wrapping only the word it matched.
    draw('<img src=x onerror="alert(1)"> the <mark>refund</mark> policy');

    const el = screen.getByTestId("snippet");
    expect(el.querySelector("img")).toBeNull();
    // Present as text, which is what makes it inert.
    expect(el.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(el.querySelectorAll("mark")).toHaveLength(1);
  });

  it("does not execute an unclosed tag, which ts_headline lets through", () => {
    // The live vector, confirmed against PostgreSQL: `ts_headline` strips
    // well-formed tags but returns a malformed one verbatim, and a browser
    // parses `<img src=x onerror=…` without its closing bracket as an
    // element. This is the case that makes dangerouslySetInnerHTML fatal.
    draw("four <mark>zzunique</mark> five <img src=x onerror=alert(1) six");

    const el = screen.getByTestId("snippet");
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1) six");
  });

  it("does not let a body-authored <mark> escape into the markup", () => {
    // A document that literally contains the word in angle brackets. Worst
    // case is a spurious highlight, never an injected element.
    draw("the tag <mark> is written like this");

    const el = screen.getByTestId("snippet");
    expect(el.textContent).toBe("the tag  is written like this");
  });

  it("survives an unbalanced marker rather than blanking the row", () => {
    // A truncated fragment. The result is already correct; the snippet is
    // decoration on it and must not throw.
    expect(() => draw("an opening <mark>marker with no close")).not.toThrow();
    expect(screen.getByTestId("snippet").textContent).toBe(
      "an opening marker with no close",
    );
  });

  it("handles an empty snippet", () => {
    expect(highlightSnippet("")).toEqual([]);
  });
});
