import type { Metadata } from "next";
import { MessagesSquare, Bell, AtSign, Link2, Slack, Smartphone } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "chat",
  eyebrow: "Chat & Notifications",
  title: "Conversation attached to the thing being discussed",
  subtitle:
    "Workspace chat plus one notification system across in-app, email, web push and Slack \u2014 so a decision about a ticket is findable from the ticket.",
  proof: ["One delivery system", "Per-channel preferences", "Slack two-way"],
  features: [
    { icon: MessagesSquare, title: "Channels and direct messages", description: "The ordinary chat surface, in the same product as the work \u2014 so linking a sprint task or a CRM record produces a preview rather than a bare URL." },
    { icon: Bell, title: "One notification pipeline", description: "Every module emits into the same system. That is why preferences work: one place decides what reaches you and how, instead of each feature inventing its own." },
    { icon: AtSign, title: "Preferences per event, per channel", description: "Choose in-app for one thing, email for another, nothing for a third. Defaults are sane, and muting something actually mutes it everywhere." },
    { icon: Slack, title: "Slack that goes both ways", description: "Deliver into Slack, and act from it. A notification you cannot respond to is just a second inbox." },
    { icon: Smartphone, title: "Web push", description: "Browser push for the events that genuinely cannot wait, kept deliberately narrow so it stays meaningful." },
    { icon: Link2, title: "Threads that stay with the record", description: "Comments live on the ticket, the document, the deal. The conversation does not need to be rediscovered later in a chat scroll." },
  ],
  how: {
    heading: "Turn the noise down first",
    blurb: "The default posture is quiet. Add channels for the events you actually want interrupting you.",
    steps: [
      { title: "Set your preferences", description: "Per event type, per channel." },
      { title: "Connect Slack", description: "Optional, and two-way." },
      { title: "Enable web push", description: "For the narrow urgent set." },
      { title: "Comment on records", description: "Instead of a parallel thread." },
    ],
  },
  cta: { heading: "One inbox instead of five", blurb: "Set your notification preferences once." },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
