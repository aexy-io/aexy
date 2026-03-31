import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { getMessages } from "next-intl/server";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Aexy",
    template: "%s | Aexy",
  },
  description:
    "GitHub-based developer profiling and analytics for intelligent task allocation and career growth",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();

  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers messages={messages}>{children}</Providers>
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
