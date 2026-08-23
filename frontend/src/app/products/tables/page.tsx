import type { Metadata } from "next";
import { Table2, Filter, Link2, Eye, Upload, Lock } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "tables",
  eyebrow: "Tables",
  title: "The spreadsheet that stopped being a spreadsheet",
  subtitle:
    "Typed columns, saved views and real relationships \u2014 for the operational data that currently lives in a shared sheet nobody trusts.",
  proof: ["Typed fields", "Saved views per person", "Shareable read-only links"],
  features: [
    { icon: Table2, title: "Columns with types", description: "Text, number, select, date, person, attachment, formula and reference. A column that means \u201cone of these five\u201d enforces it, so the data is still usable a year later." },
    { icon: Filter, title: "Views, not copies", description: "Filters, sorts and hidden columns saved as a named view. Everyone looks at the table their way without anyone duplicating a tab." },
    { icon: Link2, title: "Linked records", description: "Point a row at a CRM company, a sprint task or another table. The link is a reference, so renaming the target does not orphan anything." },
    { icon: Upload, title: "Import that guesses well", description: "Paste or upload a CSV and the column types are inferred, shown to you, and editable before anything is written." },
    { icon: Eye, title: "Public views", description: "Publish a read-only view at a token URL for a client or a supplier. No account, no access to anything else." },
    { icon: Lock, title: "Governed like the rest", description: "Tables sit inside the same workspace permissions as every other module, so \u201cshare the sheet\u201d stops meaning \u201cshare everything\u201d." },
  ],
  how: {
    heading: "Move one sheet and see",
    blurb: "The test is whether the data is easier to work with a month later, not on the day you import it.",
    steps: [
      { title: "Import a CSV", description: "Types inferred, then confirmed by you." },
      { title: "Fix the columns", description: "Turn free text into selects and dates." },
      { title: "Save your view", description: "Filters and sorts, named and shared." },
      { title: "Link it up", description: "Reference the CRM or a sprint task." },
    ],
  },
  cta: { heading: "Retire the shared sheet", blurb: "Import it and see what the types catch." },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
