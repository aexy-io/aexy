import { redirect } from "next/navigation";

/**
 * An alias that outlived its target.
 *
 * This was a one-line re-export of `../../reminders/calendar/page`. When the
 * reminders implementation moved under Compliance — where the catalog module
 * and the sidebar had always pointed — that import started resolving to the
 * redirect stub left in its place, so `/compliance/calendar` redirected to
 * `/compliance/reminders/calendar` via a page that exists only to redirect.
 *
 * One hop instead of two. The calendar itself lives at
 * `/compliance/reminders/calendar`.
 */
export default function ComplianceCalendarRedirect() {
  redirect("/compliance/reminders/calendar");
}
