import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";

// The Open Ledger brand faces, shared by the marketing site and the product.
//
// These used to live under components/landing/ and were attached only to the
// marketing wrapper, on the reasoning that the app shell should ship zero extra
// font bytes. That held while the app was a different design. Now that the
// product carries the same brand, `font-display` and `font-brand-mono` resolved
// to ui-sans-serif/ui-monospace on all 277 app routes — the utilities existed
// and silently did nothing.
//
// The variables are attached to <html> in app/layout.tsx, so both surfaces get
// them from one place. Body text is still Inter; these two are for headings and
// for the mono utility voice (eyebrows, captions, counts).

export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export const brandMonoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-brand-mono",
});
