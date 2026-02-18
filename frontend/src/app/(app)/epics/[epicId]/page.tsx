"use client";

import { redirect, useParams } from "next/navigation";
import { useEffect } from "react";

export default function EpicRedirectPage() {
  const params = useParams();
  const epicId = params.epicId as string;

  useEffect(() => {
    // Client-side redirect since we need the dynamic param
    window.location.href = `/sprints/epics/${epicId}`;
  }, [epicId]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>
  );
}
