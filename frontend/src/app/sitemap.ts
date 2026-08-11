import type { MetadataRoute } from "next";

const BASE_URL = "https://aexy.io";

type ChangeFrequency = MetadataRoute.Sitemap[number]["changeFrequency"];

// Public marketing routes only — derived from the top-level dirs under
// src/app that are NOT route groups ((app)/(admin)) and NOT auth-gated.
// `/for`, `/use-cases`, `/compare`, and `/products` have no index page.tsx of
// their own, so only their resolving children are listed.
const productSlugs = [
  "ai-agents",
  "booking",
  "crm",
  "docs",
  "email-marketing",
  "forms",
  "gtm-intelligence",
  "hiring",
  "learning",
  "mcp",
  "planning",
  "reminders",
  "reviews",
  "tickets",
  "tracking",
  "uptime",
];

const useCaseSlugs = [
  "ai-agents-for-crm",
  "company-knowledge-graph",
  "engineering-to-gtm-handoff",
  "open-source-crm-and-project-management",
  "replace-saas-sprawl",
];

const compareSlugs = [
  "attio",
  "bosys",
  "brixi",
  "gbos",
  "hubspot",
  "jira",
  "linear",
  "notion",
  "relaticle",
  "salesforce",
  "servicenow",
];

const guideSlugs = [
  "what-is-an-ai-company-operating-system",
  "ai-agents-for-business-workflows",
  "self-hosted-ai-company-os",
  "best-ai-company-operating-systems-2026",
];

const forSlugs = [
  "ai-agent-builders",
  "developers",
  "engineering-leaders",
  "engineering-managers",
  "founders",
  "operations",
  "people-ops",
  "revenue-teams",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const entry = (
    path: string,
    priority: number,
    changeFrequency: ChangeFrequency,
  ): MetadataRoute.Sitemap[number] => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });

  return [
    entry("/", 1.0, "weekly"),
    entry("/pricing", 0.9, "weekly"),
    entry("/agent-native-crm", 0.8, "monthly"),
    entry("/ai-company-os", 0.8, "monthly"),
    entry("/gtm-intelligence-platform", 0.8, "monthly"),
    entry("/open-source-company-os", 0.8, "monthly"),
    entry("/handbook", 0.7, "weekly"),
    entry("/blog", 0.7, "weekly"),
    entry("/changelog", 0.6, "weekly"),
    entry("/careers", 0.6, "weekly"),
    ...guideSlugs.map((slug) => entry(`/guides/${slug}`, 0.8, "monthly")),
    ...productSlugs.map((slug) => entry(`/products/${slug}`, 0.7, "monthly")),
    ...useCaseSlugs.map((slug) => entry(`/use-cases/${slug}`, 0.6, "monthly")),
    ...compareSlugs.map((slug) => entry(`/compare/${slug}`, 0.6, "monthly")),
    ...forSlugs.map((slug) => entry(`/for/${slug}`, 0.6, "monthly")),
    entry("/about", 0.5, "monthly"),
    entry("/story", 0.4, "yearly"),
    entry("/mission", 0.4, "yearly"),
    entry("/manifesto", 0.4, "yearly"),
    entry("/contact", 0.4, "yearly"),
    entry("/security", 0.4, "yearly"),
    entry("/privacy", 0.3, "yearly"),
    entry("/terms", 0.3, "yearly"),
  ];
}
