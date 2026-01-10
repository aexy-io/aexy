"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";

// Redirect to the main CRM settings page with integrations section
export default function IntegrationsRedirectPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  useEffect(() => {
    router.replace("/crm/settings?section=integrations");
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="text-slate-400">Redirecting to settings...</div>
      </div>
    </div>
  );
}
