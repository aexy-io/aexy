import type { Metadata } from "next";

// page.tsx is a client component, so metadata has to live here.
//
// noindex is deliberate: /login is a gate, not a landing page. Left indexable
// it competes with the homepage for brand queries and sends people who
// searched "aexy" to a sign-in form instead of the pitch. robots.ts cannot
// express this — it disallows /auth, not /login, and a Disallow would also
// stop Google seeing the noindex.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Aexy workspace.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
