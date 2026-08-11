"use client";

/**
 * The desk's settings moved into main Settings.
 *
 * They were the one settings surface you could not reach from Settings —
 * Escalation Matrix and Ticket Forms already lived there, so the desk's own
 * master data sitting behind the Service Desk app was an inconsistency people
 * had to learn. The eleven sections are now six pages under
 * `/settings/service-desk/*`.
 *
 * This route stays as a redirect rather than being deleted: it is linked from
 * the Service Desk nav and from anything anybody has bookmarked, and a 404
 * would read as the settings having been taken away.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Spinner } from "@/components/ui/spinner";

export default function ServiceDeskSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/service-desk/master-data");
  }, [router]);

  return (
    <div className="flex items-center justify-center p-12">
      <Spinner size="sm" />
    </div>
  );
}
