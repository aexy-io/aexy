import { redirect } from "next/navigation";

/**
 * `APP_CATALOG.email_marketing` declares a `settings` module at
 * `/email-marketing/settings` — enabled by two of the four shipped bundles —
 * and nothing was ever built there. The page it means is
 * `/settings/email-marketing`, which exists and is gated to the same app by
 * `ROUTE_TO_APP`.
 *
 * A redirect rather than a catalog edit, because the module entry is doing
 * real work: it is how a workspace grants or withholds email settings
 * independently of campaigns and templates. Removing it would silently widen
 * access for anyone whose bundle listed it. This makes the declared route
 * true instead.
 */
export default function EmailMarketingSettingsRedirect() {
  redirect("/settings/email-marketing");
}
