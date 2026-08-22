import type { Metadata } from "next";
import { HardDrive, FolderTree, Sparkles, Search, Share2, Gauge } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "drive",
  eyebrow: "Drive",
  title: "File storage that files things for you",
  subtitle:
    "Upload once and let the AI tagging pipeline decide what it is. Smart views group files by what they contain, without moving a single one.",
  proof: ["AI tagging on upload", "Smart views over folders", "Direct-to-storage uploads"],
  features: [
    { icon: Sparkles, title: "Tagged on arrival", description: "Every upload runs through a metadata pipeline that extracts text, classifies the document and tags it. You get search that works on contents, not filenames." },
    { icon: FolderTree, title: "Smart views instead of copies", description: "A smart view is a saved filter that looks like a folder and moves nothing. One invoice can appear under Invoices, Q3 and Acme at once while living in exactly one place." },
    { icon: Search, title: "Search that reads the file", description: "Names, tags and extracted content, over a GIN-indexed store. Finding the contract by a clause in it is the normal case, not a special feature." },
    { icon: HardDrive, title: "Uploads that do not queue", description: "Files go straight to object storage over a presigned URL rather than through an API worker, so a large upload does not compete with the rest of the app." },
    { icon: Share2, title: "Sharing inside the same permissions", description: "Drive sits in the workspace access model. Sharing a folder does not mean handing over an account." },
    { icon: Gauge, title: "Quota you can see", description: "Used, limit and file count, per workspace, on the page \u2014 rather than discovered when an upload fails." },
  ],
  how: {
    heading: "Upload a folder and search it",
    blurb: "The interesting moment is the first search that finds something by its contents.",
    steps: [
      { title: "Drop in some files", description: "Tagging starts immediately." },
      { title: "Wait for annotation", description: "Runs in the background." },
      { title: "Build a smart view", description: "Filter on the tags it found." },
      { title: "Search the contents", description: "Not just the names." },
    ],
  },
  cta: { heading: "Stop naming files carefully", blurb: "Upload a folder and let the tags do it." },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
