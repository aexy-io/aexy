const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Compress responses at the Next server. A reverse proxy in front may also
  // compress; this ensures the app container never ships uncompressed HTML.
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'github.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    resolveAlias: {
      // `harfbuzzjs`, pulled in by the docx editor's engine for Word-accurate
      // text shaping, has a Node-only branch that does
      // `await import("module")`. The branch is guarded by a runtime
      // environment check that is false in a browser, but Turbopack resolves
      // the import anyway and fails the client build on it. Scoped to the
      // `browser` condition so server code still gets the real builtin.
      module: { browser: "./stubs/node-module-browser.js" },
    },
  },
  async rewrites() {
    return [
      // Clean booking URLs: /book/* -> /public/book/*
      {
        source: '/book/:path*',
        destination: '/public/book/:path*',
      },
    ];
  },
  async redirects() {
    return [
      // CRM and Email Marketing settings moved under /settings, where every
      // other settings page lives and where the shell's permission gate applies.
      //
      // `/crm/settings` in particular cannot just 404: `/crm/[objectSlug]`
      // matches it, so a stale link would render an object page for a
      // nonexistent object called "settings" rather than failing honestly.
      { source: '/crm/settings', destination: '/settings/crm', permanent: false },
      {
        source: '/crm/settings/integrations',
        destination: '/settings/crm/integrations',
        permanent: false,
      },
      {
        source: '/email-marketing/settings',
        destination: '/settings/email-marketing',
        permanent: false,
      },
    ];
  },
  async headers() {
    // Clickjacking & frame-busting policy.
    //
    // Embed surfaces (/embed/*) are *intentionally* iframable by customer
    // pages — we control them via `frame-ancestors *` (no DENY) plus a
    // per-link origin allowlist enforced on the API side (WS-074).
    //
    // Everything else (the app shell, admin tools, auth pages, and the
    // marketing landing) is denied framing so an attacker can't render the
    // logged-in shell or the OAuth callback inside a hostile parent and
    // pull off clickjacking or token-bleed attacks.
    const denyFrame = {
      // Negative-lookahead is anchored to "embed/" so unrelated paths like
      // /embedded-* still receive clickjacking headers. Without the slash,
      // /embedded-foo would match neither rule and ship no frame-ancestors.
      source: "/((?!embed/).*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ],
    };
    const allowEmbedFrame = {
      source: "/embed/:path*",
      headers: [
        // `frame-ancestors *` is intentional — per-link enforcement is on
        // the API side (TableShareLink.allowed_origins, planned). When
        // that's deployed, replace `*` with the per-deployment allowlist.
        { key: "Content-Security-Policy", value: "frame-ancestors *" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ],
    };
    return [denyFrame, allowEmbedFrame];
  },
};

module.exports = withNextIntl(nextConfig);
