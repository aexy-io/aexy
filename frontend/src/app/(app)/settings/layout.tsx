import type { Metadata } from "next";
import { SettingsShell } from "@/components/settings/SettingsShell";

// Not a client component. It renders one — `SettingsShell` — but a server
// component may do that, and being a client component here cost all 56 settings
// pages their titles: Next ignores a `metadata` export in a client module, so
// every one of them fell through to the root layout's marketing title.
//
// The template gives the sub-pages their context, and repeats "| Aexy"
// because defining a template here overrides the root one entirely rather than
// nesting inside it. A page exporting `title: "Mailboxes"` becomes
// "Mailboxes · Settings | Aexy"; `default` covers the index, which exports none.
export const metadata: Metadata = {
  title: { default: "Settings", template: "%s · Settings | Aexy" },
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsShell>{children}</SettingsShell>;
}
