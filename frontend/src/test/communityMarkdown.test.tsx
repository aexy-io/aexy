import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MarkdownContent } from "@/components/community/MarkdownContent";
import { excerptFromMarkdown, plainTextFromMarkdown } from "@/lib/markdownText";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(content: string) {
  act(() => {
    root.render(<MarkdownContent content={content} />);
  });
}

describe("Rendering a public community post", () => {
  it("renders a changelog as real structure, not as source text", () => {
    render("## Added\n\n- A changelog script\n- A second thing\n");

    expect(container.querySelector("h4")?.textContent).toBe("Added");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.textContent).not.toContain("##");
    expect(container.textContent).not.toContain("- A changelog");
  });

  it("starts headings below the page's own h1 and h2", () => {
    // The topic title is the page h1. A post that opens with `# Whatever` must
    // not put a second h1 in the outline, or a crawler sees two page titles.
    render("# Top\n\n## Second\n");

    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("h2")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe("Top");
    expect(container.querySelector("h4")?.textContent).toBe("Second");
  });

  it("keeps single newlines as line breaks", () => {
    // Every post written before markdown rendering existed was authored against
    // a renderer that preserved newlines. Without remark-breaks they would all
    // silently reflow into run-on paragraphs.
    render("first line\nsecond line");

    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("marks outbound links ugc/nofollow and opens them in a new tab", () => {
    render("See [the docs](https://example.com/docs).");

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/docs");
    expect(link?.getAttribute("rel")).toBe("nofollow ugc noopener noreferrer");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("leaves same-site links as ordinary internal links", () => {
    render("See [our docs](/docs/releases).");

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/docs/releases");
    expect(link?.getAttribute("rel")).toBeNull();
    expect(link?.getAttribute("target")).toBeNull();
  });

  it("refuses to link a javascript: or data: href", () => {
    render("[click me](javascript:alert(1)) and [me too](data:text/html,<b>x</b>)");

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("click me");
    expect(container.textContent).toContain("me too");
  });

  it("does not render an author's raw HTML", () => {
    // react-markdown drops embedded HTML unless rehype-raw is added, and it
    // deliberately is not. This asserts nobody adds it later without noticing.
    render('<img src=x onerror="alert(1)"> <b>bold</b> <script>alert(2)</script>');

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("degrades a remote image to its alt text", () => {
    // An <img> the author controls logs every reader's IP to a host of their
    // choosing, on a page anyone can read.
    render("![a screenshot](https://tracker.example/pixel.png)");

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("a screenshot");
  });

  it("styles a fence as a block whether or not it names a language", () => {
    // react-markdown only adds `language-*` when the fence declares one, so a
    // bare ``` fence (the common case in a changelog) must not fall through to
    // the inline pill styling inside the <pre>.
    for (const source of ["```\nnpm run build\n```", "```bash\nnpm run build\n```"]) {
      render(source);
      const pre = container.querySelector("pre");
      expect(pre?.textContent).toContain("npm run build");
      // The pill is neutralised for anything the <pre> wraps.
      expect(pre?.className).toContain("[&_code]:bg-transparent");
    }
  });

  it("links a mailto: address", () => {
    render("email [support](mailto:support@example.com)");

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("mailto:support@example.com");
  });

  it("renders tables and fenced code without widening the thread", () => {
    render("| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n");

    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("td")).toHaveLength(2);
    expect(container.querySelector("table")?.parentElement?.className).toContain(
      "overflow-x-auto",
    );
    expect(container.querySelector("pre")?.className).toContain("overflow-x-auto");
    expect(container.querySelector("pre")?.textContent).toContain("const x = 1;");
  });

  it("renders task lists as read-only boxes", () => {
    render("- [x] shipped\n- [ ] pending\n");

    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[0].disabled).toBe(true);
    expect(boxes[1].checked).toBe(false);
  });
});

describe("Quoting a post where there is no renderer", () => {
  it("flattens changelog markdown for a meta description", () => {
    const text = plainTextFromMarkdown(
      "## Added\n\n- A [changelog script](https://example.com)\n- **Bold** and `code`\n",
    );
    expect(text).toBe("Added A changelog script Bold and code");
  });

  it("keeps code block contents but drops the fences", () => {
    expect(plainTextFromMarkdown("```py\nprint(1)\n```")).toBe("print(1)");
  });

  it("drops table markup, images, quotes and rules", () => {
    expect(plainTextFromMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe("a b 1 2");
    expect(plainTextFromMarkdown("![alt text](x.png)")).toBe("alt text");
    expect(plainTextFromMarkdown("> quoted\n\n---\n\nafter")).toBe("quoted after");
  });

  it("leaves emphasis characters that are part of code or arithmetic", () => {
    // A `*` or `_` flanked by alphanumerics is literal in CommonMark. Stripping
    // it anyway rewrote `run_migrations.py` and turned `4*5=20` into `45=20`.
    expect(plainTextFromMarkdown("run `run_migrations.py` for web_public")).toBe(
      "run run_migrations.py for web_public",
    );
    expect(plainTextFromMarkdown("4*5=20 and x**2")).toBe("4*5=20 and x**2");
    expect(plainTextFromMarkdown("_italic_ and __bold__ still go")).toBe(
      "italic and bold still go",
    );
  });

  it("leaves brackets that are a type or an index, not a link", () => {
    expect(plainTextFromMarkdown("Fixed Optional[str] in messages[0]")).toBe(
      "Fixed Optional[str] in messages[0]",
    );
    // A real reference link still resolves to its text.
    expect(plainTextFromMarkdown("see [the docs][1]")).toBe("see the docs");
  });

  it("returns empty for empty input rather than throwing", () => {
    expect(plainTextFromMarkdown("")).toBe("");
    expect(excerptFromMarkdown("", 180)).toBe("");
  });

  it("cuts an excerpt at a word boundary", () => {
    const excerpt = excerptFromMarkdown("## Adds the changelog publishing script", 20);
    expect(excerpt).toBe("Adds the changelog…");
    expect(excerpt.length).toBeLessThanOrEqual(21);
  });

  it("still cuts a single unbroken token", () => {
    const excerpt = excerptFromMarkdown("x".repeat(50), 20);
    expect(excerpt).toBe("x".repeat(20) + "…");
  });

  it("leaves a short post untouched", () => {
    expect(excerptFromMarkdown("Just text.", 180)).toBe("Just text.");
  });
});

describe("Where the markdown parser is allowed to run", () => {
  /** Every .ts/.tsx file under src/, so the check cannot miss a new one. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("is never imported by a client component", () => {
    // MarkdownContent pulls in react-markdown and micromark — about 140kB. It is
    // rendered on the server and passed into TopicThread as elements precisely so
    // that weight stays off a page anyone can read anonymously. One `"use client"`
    // module importing it puts the whole parser back in the browser bundle, and
    // nothing else would fail to say so.
    const offenders = sourceFiles("src").filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/m.test(source)) return false;
      return /from\s+["'][^"']*community\/MarkdownContent["']/.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
