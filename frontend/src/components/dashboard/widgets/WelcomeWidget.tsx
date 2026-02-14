"use client";

import Link from "next/link";
import Image from "next/image";
import { ClipboardCheck } from "lucide-react";
import { CustomizeButton } from "../CustomizeButton";

interface WelcomeWidgetProps {
  user: {
    name?: string;
    avatar_url?: string;
    github_connection?: {
      github_username: string;
    };
  } | null;
  onCustomize: () => void;
}

export function WelcomeWidget({ user, onCustomize }: WelcomeWidgetProps) {
  return (
    <div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {user?.avatar_url && (
            <div className="relative shrink-0">
              <Image
                src={user.avatar_url}
                alt={user.name || "User"}
                width={48}
                height={48}
                className="rounded-full ring-2 ring-border"
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success rounded-full border-2 border-background"></div>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">
              Welcome back, {user?.name?.split(" ")[0] || "Developer"}
            </h1>
            <p className="text-muted-foreground text-sm truncate">
              {user?.github_connection ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-success rounded-full shrink-0"></span>
                  Connected as @{user.github_connection.github_username}
                </span>
              ) : (
                "Connect your GitHub to get started"
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CustomizeButton onClick={onCustomize} />
          <Link
            href="/reviews"
            className="px-3 py-1.5 bg-card hover:bg-accent text-muted-foreground hover:text-foreground rounded-lg text-sm font-medium transition flex items-center gap-1.5 whitespace-nowrap"
          >
            <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
            Reviews
          </Link>
        </div>
      </div>
    </div>
  );
}
