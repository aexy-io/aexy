"use client";

/**
 * A page's breadcrumb trail — published to the app topbar, not drawn here.
 *
 * This component used to render its own `<nav aria-label="Breadcrumb">` inside
 * the page body. That was the only breadcrumb the app had, so it was the right
 * shape. It is not any more: `AppTopbar` now derives a trail from the pathname
 * on every route, and 49 pages import this one — so `/tickets/<id>`,
 * `/tables`, `/agents/<id>` and 46 others would draw two trails, forty pixels
 * apart, saying almost but not quite the same thing. That is the exact defect
 * that made `/settings` show two disagreeing trails, and the fix is the same:
 * there is one breadcrumb on screen and it lives in the topbar.
 *
 * Publishing rather than deleting is deliberate. These 49 pages know things the
 * pathname cannot — a ticket's subject, an agent's name, the table you are
 * inside — and that is strictly better than the derived trail. So the call
 * sites keep passing exactly what they passed before, and the topbar renders
 * it. No page churns, and every one of them gets a record-aware trail in the
 * place users now look for it.
 *
 * New code should prefer `PageHeader`'s `breadcrumbs` prop, which is the same
 * mechanism with the page title attached.
 */

import { useBreadcrumbOverride, type Breadcrumb as BreadcrumbEntry } from "@/components/ui/page";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Accepted and ignored: the topbar owns this element's styling now. */
  className?: string;
}

function Breadcrumb({ items }: BreadcrumbProps) {
  // The last crumb is the page you are on; the topbar renders it unlinked
  // whether or not a caller passed an href for it.
  useBreadcrumbOverride(items as BreadcrumbEntry[]);
  return null;
}

export { Breadcrumb };
