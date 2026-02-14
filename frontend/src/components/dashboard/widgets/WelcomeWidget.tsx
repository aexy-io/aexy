"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ClipboardCheck,
  Target,
  Calendar,
} from "lucide-react";
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          {user?.avatar_url && (
            <div className="relative">
              <Image
                src={user.avatar_url}
                alt={user.name || "User"}
                width={56}
                height={56}
                className="rounded-full ring-2 ring-border"
              />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-success rounded-full border-2 border-background"></div>
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome back, {user?.name?.split(" ")[0] || "Developer"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {user?.github_connection ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-success rounded-full"></span>
                  Connected as @{user.github_connection.github_username}
                </span>
              ) : (
                "Connect your GitHub to get started"
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <CustomizeButton onClick={onCustomize} />
          <Link
            href="/reviews"
            className="px-4 py-2 bg-card hover:bg-accent text-muted-foreground hover:text-foreground rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <ClipboardCheck className="w-4 h-4" />
            Reviews
          </Link>
          <Link
            href="/learning"
            className="px-4 py-2 bg-card hover:bg-accent text-muted-foreground hover:text-foreground rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <Target className="w-4 h-4" />
            Learning Path
          </Link>
          <Link
            href="/sprints"
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            Sprint Planning
          </Link>
        </div>
      </div>
    </div>
  );
}
