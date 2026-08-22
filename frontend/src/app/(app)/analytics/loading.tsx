import { PageSkeleton } from "@/components/ui/page";

// Streams while this module's server work resolves.
//
// There were 30 `error.tsx` files under (app) and not one `loading.tsx`, so a
// slow route showed the previous page frozen until it was ready. Meanwhile 212
// files hand-rolled their own `animate-pulse` block *inside* the page, which
// only starts once the page is already rendering — too late to cover the wait
// that actually shows.
export default function Loading() {
  return <PageSkeleton rows={2} />;
}
