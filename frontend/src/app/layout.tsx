import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { getMessages, getLocale } from "next-intl/server";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

const description =
  "The AI company OS for engineering, CRM, GTM, people, docs, workflows, and agents. Open source and self-hostable for modern teams.";

export const metadata: Metadata = {
  metadataBase: new URL("https://aexy.io"),
  title: {
    default: "Aexy — AI Company OS for Engineering, CRM, HR & GTM",
    template: "%s | Aexy",
  },
  description,
  // NO site-wide `alternates.canonical` here. Next inherits metadata down the
  // tree, so a canonical set on the root layout is emitted verbatim on every
  // route — every page then declares itself a duplicate of the homepage and
  // drops out of the index. Each route owns its own canonical instead: server
  // pages via their `metadata` export, client pages via a sibling layout.tsx.
  // See src/test/canonicalCoverage.test.ts, which fails if a public route
  // ships without one.
  openGraph: {
    type: "website",
    siteName: "Aexy",
    url: "https://aexy.io",
    title: "Aexy — AI Company OS for Engineering, CRM, HR & GTM",
    description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Aexy — The AI Company OS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aexy — AI Company OS for Engineering, CRM, HR & GTM",
    description,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/icon.svg",
  },
};

const webApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Aexy",
  url: "https://aexy.io",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Open-source, self-hostable company OS.",
  },
  featureList: [
    "Engineering & Sprints",
    "CRM",
    "GTM intelligence",
    "People & HR",
    "Docs",
    "Workflows",
    "AI agents",
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={inter.className}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationJsonLd) }}
        />
        <Providers messages={messages} serverLocale={locale}>{children}</Providers>
        <Toaster richColors position="top-right" />
        {process.env.NEXT_PUBLIC_GTM_WORKSPACE_ID && (
          <Script
            src="/aexy-track.js"
            data-workspace={process.env.NEXT_PUBLIC_GTM_WORKSPACE_ID}
            data-api={process.env.NEXT_PUBLIC_GTM_API_URL || process.env.NEXT_PUBLIC_API_URL || ""}
            data-consent="granted"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
