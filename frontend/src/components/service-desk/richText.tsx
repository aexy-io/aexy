"use client";

import React, { useState } from "react";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Rendering an email body that arrived as plain text.
 *
 * Inbound mail is converted to text before it is stored, and that conversion
 * leaves artefacts: an inline logo becomes `[image: https://host/logo.png]`,
 * and a hyperlink becomes `label <https://host/page>` — usually with the label
 * equal to the URL, so every link appears twice. A signature that was three
 * small images renders as three lines of that noise, in every reply, for the
 * whole thread.
 *
 * So the text is tokenised and rendered: links become links, image placeholders
 * become images.
 *
 * **The email HTML is deliberately not used.** Dropping a partner's markup into
 * the page would be a script-injection hole on a body that anyone outside the
 * workspace can send, and sanitising third-party HTML well is not a thing to
 * take on for a signature logo. Tokenising the text we already store gets the
 * readable part with none of that risk.
 */

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "link"; href: string }
  | { kind: "image"; src: string };

// `[image: URL]`, optionally followed by the same URL in angle brackets — which
// is how the text conversion writes a linked image.
const IMAGE_RE = /\[image:\s*(https?:\/\/[^\]\s]+)\s*\](?:\s*<\1>)?/gi;
const ANGLE_URL_RE = /<(https?:\/\/[^>\s]+)>/gi;
const BARE_URL_RE = /https?:\/\/[^\s<>\])]+/gi;

/**
 * Split plain text into text, links and images.
 *
 * Images are matched first because their placeholder *contains* URLs — matching
 * links first would consume the inside of the placeholder and leave a stray
 * `[image: ]` behind.
 */
export function tokenise(input: string): Segment[] {
  const out: Segment[] = [];

  const pushText = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last?.kind === "text") last.text += text;
    else out.push({ kind: "text", text });
  };

  // Pass 1: carve out the image placeholders.
  const afterImages: (string | Segment)[] = [];
  let cursor = 0;
  for (const match of input.matchAll(IMAGE_RE)) {
    const at = match.index ?? 0;
    afterImages.push(input.slice(cursor, at));
    afterImages.push({ kind: "image", src: match[1] });
    cursor = at + match[0].length;
  }
  afterImages.push(input.slice(cursor));

  // Pass 2: links inside the remaining text.
  for (const piece of afterImages) {
    if (typeof piece !== "string") {
      out.push(piece);
      continue;
    }
    let pos = 0;
    // `label <url>` where the label is the same url renders once, not twice.
    const deduped = piece.replace(
      /(https?:\/\/[^\s<>\])]+)\s*<\1>/gi,
      (_m, url) => `<${url}>`,
    );
    const marks: { start: number; end: number; href: string }[] = [];
    for (const m of deduped.matchAll(ANGLE_URL_RE)) {
      marks.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, href: m[1] });
    }
    for (const m of deduped.matchAll(BARE_URL_RE)) {
      const start = m.index ?? 0;
      // Skip one already claimed by the angle-bracket form.
      if (marks.some((k) => start >= k.start && start < k.end)) continue;
      marks.push({ start, end: start + m[0].length, href: m[0] });
    }
    marks.sort((a, b) => a.start - b.start);
    for (const mark of marks) {
      pushText(deduped.slice(pos, mark.start));
      out.push({ kind: "link", href: mark.href });
      pos = mark.end;
    }
    pushText(deduped.slice(pos));
  }

  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * One image from an email body, not loaded until asked for.
 *
 * Fetching it on render would announce that the ticket had been opened to
 * whoever sent it — a single-pixel image in a signature is exactly how that is
 * measured — and a full-size photo would take over the card. So it is a chip
 * that names its host until somebody wants to see it.
 */
function EmailImage({ src }: { src: string }) {
  const t = useTranslations("serviceDesk");
  const [shown, setShown] = useState(false);

  if (shown) {
    return (
      // Remote hosts are arbitrary, so next/image (which needs each host
      // configured) cannot serve these.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={t("detail.imageFrom", { host: hostOf(src) })}
        data-testid="email-image"
        className="my-1 max-h-64 max-w-full rounded border border-border object-contain"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      data-testid="email-image-chip"
      title={src}
      className="my-0.5 inline-flex max-w-full items-center gap-1 truncate rounded border border-border px-1.5 py-0.5 align-middle text-xs text-muted-foreground hover:bg-accent"
    >
      <ImageIcon className="h-3 w-3 shrink-0" />
      {t("detail.showImage", { host: hostOf(src) })}
    </button>
  );
}

/** Plain-text email content with its links and images made real. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const segments = tokenise(text);
  return (
    <p className={className} data-testid="rich-text">
      {segments.map((seg, i) => {
        if (seg.kind === "text") return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        if (seg.kind === "image") return <EmailImage key={i} src={seg.src} />;
        return (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            // noreferrer as well as noopener: the destination is a third party
            // named by whoever sent the mail, and the ticket URL is not theirs
            // to receive.
            rel="noopener noreferrer"
            className="break-all text-primary underline underline-offset-2 hover:no-underline"
          >
            {seg.href}
          </a>
        );
      })}
    </p>
  );
}
