import type { MetadataRoute } from "next";

// Authenticated app / admin areas (they 302 to login anyway) plus flows that
// should never be indexed. Kept in sync with AUTH_REQUIRED_PREFIXES in
// src/middleware.ts and the (app)/(admin) route groups.
const disallow = [
  "/dashboard",
  "/admin",
  "/settings",
  // The in-app MCP reference. Its auth gate is client-side, so the server still
  // emits the full tool catalogue to a crawler — thin content that would compete
  // with /products/mcp for the same query. The marketing page is the one to index.
  "/mcp",
  "/crm",
  "/sprints",
  "/projects",
  "/reports",
  "/analytics",
  "/insights",
  "/predictions",
  "/workspaces",
  "/teams",
  "/people",
  "/hiring",
  "/onboarding",
  "/inbox",
  "/calendar",
  "/billing",
  "/integrations",
  "/workflows",
  "/automations",
  "/agents",
  "/reviews",
  "/goals",
  "/roadmap",
  "/releases",
  "/stories",
  "/epics",
  "/tables",
  "/databases",
  "/forms",
  "/email",
  "/docs",
  "/oncall",
  "/standups",
  "/tracking",
  "/leaves",
  "/learning",
  "/compliance",
  "/audit",
  "/reminders",
  "/one-on-ones",
  "/dependencies",
  "/code-insights",
  "/auth",
  "/invite",
  "/embed",
  "/p",
  "/take",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow,
    },
    sitemap: "https://aexy.io/sitemap.xml",
    host: "https://aexy.io",
  };
}
