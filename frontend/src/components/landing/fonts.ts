import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";

// Brand faces for the "Open Ledger" marketing look. Loaded here rather than in
// the root layout so the authenticated app shell ships zero extra font bytes —
// LedgerPage attaches the variables to the marketing page's own wrapper, and
// only marketing routes import it. Body text stays on the layout's Inter.

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
