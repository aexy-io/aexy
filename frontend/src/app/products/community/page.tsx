import type { Metadata } from "next";
import { MessagesSquare, Globe, ShieldCheck, Search, Hash, Users } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "community",
  eyebrow: "Community",
  title: "A public forum your team runs from the same place they work",
  subtitle:
    "Spaces, channels and topics for customers and contributors \u2014 administered from inside Aexy, readable by anyone, without standing up a separate platform.",
  proof: ["Public by URL", "Channels and topics", "Moderated from the workspace"],
  features: [
    { icon: Globe, title: "Public without an account", description: "Discussions are readable and indexable. Requiring a login to read a support answer is how knowledge stops being useful." },
    { icon: Hash, title: "Spaces and channels", description: "Separate communities, each with its own channels and topic threads, so a product forum and a contributor forum are not the same room." },
    { icon: Search, title: "Findable", description: "Threads are ordinary pages with ordinary URLs and canonical tags, so an answer given once can be found by the next person who asks." },
    { icon: ShieldCheck, title: "Listed or unlisted", description: "A community can be enabled but unlisted \u2014 reachable by direct URL and absent from the directory \u2014 which is what a private beta actually needs." },
    { icon: Users, title: "Run by your team", description: "Moderation and configuration live in workspace settings, next to everything else they administer, rather than in a third-party console with its own logins." },
    { icon: MessagesSquare, title: "Beside the support desk", description: "The same team answering tickets runs the forum. Turning a repeated ticket into a public answer does not mean leaving the product." },
  ],
  how: {
    heading: "Open one space",
    blurb: "A forum with three good answers is more useful than an empty one with perfect categories.",
    steps: [
      { title: "Create a community", description: "From workspace settings." },
      { title: "Add a channel or two", description: "Fewer than you think." },
      { title: "Seed it from tickets", description: "Publish answers you already gave." },
      { title: "List it", description: "When it is worth arriving at." },
    ],
  },
  cta: {
    heading: "Answer it once, publicly",
    blurb: "Open a space and publish three answers.",
    secondary: { href: "/community", label: "Browse public communities" },
  },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
