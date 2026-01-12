"use client"
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "./AppHeader";
import SideBar from "./SideBar";

export default function PrimaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />
      <div className="flex max-w-7xl mx-auto px-4">
        <SideBar />
        <main className="ml-[65px] w-full">{children}</main>
      </div>
    </div>
  );
}
