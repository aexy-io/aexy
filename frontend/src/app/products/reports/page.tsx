import type { Metadata } from "next";
import { FileBarChart, LayoutTemplate, CalendarClock, Download, Filter, Copy } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "reports",
  eyebrow: "Reports",
  title: "Ask your own question, on a schedule",
  subtitle:
    "A report builder over every module's data, with templates to start from, scheduled delivery, and exports that survive a deploy.",
  proof: ["Build without SQL", "Scheduled delivery", "Bulk export to storage"],
  features: [
    { icon: Filter, title: "Define it, then run it", description: "A report is a saved definition \u2014 source, filters, groupings, columns, chart. Running it is a separate act, so the definition is stable while the numbers move." },
    { icon: LayoutTemplate, title: "Templates as a starting point", description: "Fork a shipped template into a report you own rather than beginning at an empty builder. The fork is yours; the template stays put." },
    { icon: CalendarClock, title: "Scheduled to the people who need it", description: "A report plus a cadence plus recipients. It runs on Temporal and delivers whether or not anybody opens the app that week." },
    { icon: Download, title: "Exports that do not time out", description: "Large extracts run in the background and land in object storage, so a big export is not a held-open request that dies on the next release." },
    { icon: Copy, title: "Clone and diverge", description: "Copy a report to answer the adjacent question. The copy is independent \u2014 editing the original will not silently change what your colleague receives." },
    { icon: FileBarChart, title: "The monthly engineering report", description: "One fixed report that exists because the same numbers were being rebuilt by hand every month. Generated, not assembled." },
  ],
  how: {
    heading: "From question to inbox",
    blurb: "The useful test is whether the recurring question stops being asked in chat.",
    steps: [
      { title: "Fork a template", description: "Or start from a data source." },
      { title: "Filter and group", description: "Preview as you go." },
      { title: "Save and run", description: "Definition and result are separate." },
      { title: "Schedule it", description: "Cadence and recipients." },
    ],
  },
  cta: { heading: "Answer it once, then never again", blurb: "Fork a template and schedule it." },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
