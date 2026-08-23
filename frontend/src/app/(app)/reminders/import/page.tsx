import { redirect } from "next/navigation";

/**
 * Reminders moved under Compliance, which is where the product always pointed.
 *
 * These eight pages shipped at two URLs: the implementation lived here, and
 * `compliance/reminders/*` was eight seven-line files re-exporting it. Only the
 * compliance tree was navigable — it is the `reminders` module of
 * `APP_CATALOG.compliance` and the sidebar entry — so this copy was reachable
 * only by typing it, while still being built, indexed and maintained. Two URLs
 * for one page also meant two breadcrumb trails and two `metadata` titles that
 * had already drifted apart.
 *
 * The implementation now lives in the canonical tree and this redirects to it.
 * Nothing in the product ever linked here — the backend builds no reminder deep
 * links — so this exists for hand-made bookmarks, not for the app.
 */
export default function RemindersImportRedirect() {
  redirect("/compliance/reminders/import");
}
