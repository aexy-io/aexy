import type { Metadata } from "next";
import { LayoutDashboard, ListTodo, Blocks, UserCog, Eye, Layers } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "dashboard",
  eyebrow: "Dashboard",
  title: "Open the app and already know what to do",
  subtitle:
    "The home page is your actual work \u2014 tasks, bugs, stories and support tickets assigned to you, across every workspace \u2014 with a configurable widget grid one click away.",
  proof: ["Personal work list by default", "84 widgets", "Seven role presets"],
  features: [
    { icon: ListTodo, title: "My Work is the front door", description: "Not a chart of last quarter. The first thing on screen is what is assigned to you right now, pulled from sprints, tickets, forms and the service desk at once." },
    { icon: Blocks, title: "A grid you arrange", description: "Eighty-four widgets across every module. Drag, resize, remove. Your layout is yours and is not reset by an admin changing a default." },
    { icon: UserCog, title: "Presets by role", description: "Seven starting layouts \u2014 developer, manager, product, HR, support, sales, admin \u2014 chosen during onboarding, so day one is not an empty page." },
    { icon: Eye, title: "Only what you can reach", description: "Widgets belonging to apps your workspace has switched off are not offered in the picker. The dashboard never advertises something you cannot open." },
    { icon: Layers, title: "Cross-workspace", description: "The work list spans workspaces, because your attention does. The widget grid stays per workspace, because context does not." },
    { icon: LayoutDashboard, title: "Two pages, on purpose", description: "The personal list and the widget grid answer different questions, so they are different routes rather than a toggle you have to remember the state of." },
  ],
  how: {
    heading: "Day one to day thirty",
    blurb: "Almost nobody configures a dashboard before they trust the product. The preset carries you until you do.",
    steps: [
      { title: "Pick a role", description: "During onboarding, once." },
      { title: "Live with the preset", description: "It is a starting point, not a cage." },
      { title: "Remove what you ignore", description: "The fastest improvement." },
      { title: "Add what you check elsewhere", description: "Then stop checking elsewhere." },
    ],
  },
  cta: { heading: "A home page worth opening", blurb: "Sign in and see the preset for your role." },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
