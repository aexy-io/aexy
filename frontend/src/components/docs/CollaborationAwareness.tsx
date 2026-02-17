"use client";

import { useState } from "react";
import { Users, Wifi, WifiOff, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollaborationUser {
  id: string;
  name: string;
  email?: string;
  color: string;
  cursor?: { anchor: number; head: number } | null;
  selection?: { anchor: number; head: number } | null;
  lastActive?: string;
}

interface CollaborationAwarenessProps {
  users: CollaborationUser[];
  currentUserId: string;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  onReconnect?: () => void;
  className?: string;
}

export function CollaborationAwareness({
  users,
  currentUserId,
  connectionStatus,
  onReconnect,
  className,
}: CollaborationAwarenessProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const otherUsers = users.filter((u) => u.id !== currentUserId);

  const statusConfig = {
    connecting: {
      icon: RefreshCw,
      label: "Connecting...",
      color: "text-amber-400",
      bgColor: "bg-amber-900/30",
      animate: true,
    },
    connected: {
      icon: Wifi,
      label: "Connected",
      color: "text-green-400",
      bgColor: "bg-green-900/30",
      animate: false,
    },
    disconnected: {
      icon: WifiOff,
      label: "Disconnected",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      animate: false,
    },
    error: {
      icon: AlertCircle,
      label: "Connection error",
      color: "text-red-400",
      bgColor: "bg-red-900/30",
      animate: false,
    },
  };

  const status = statusConfig[connectionStatus];
  const StatusIcon = status.icon;

  return (
    <div className={cn("relative", className)}>
      {/* Collapsed View - User Avatars */}
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Connection Status Indicator */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs",
            status.bgColor
          )}
        >
          <StatusIcon
            className={cn("h-3.5 w-3.5", status.color, status.animate && "animate-spin")}
          />
          {connectionStatus !== "connected" && (
            <span className={status.color}>{status.label}</span>
          )}
        </div>

        {/* User Avatars Stack */}
        {otherUsers.length > 0 && (
          <div className="flex items-center -space-x-2">
            {otherUsers.slice(0, 3).map((user) => (
              <UserAvatar key={user.id} user={user} size="sm" />
            ))}
            {otherUsers.length > 3 && (
              <div className="flex items-center justify-center h-7 w-7 rounded-full bg-accent border-2 border-background text-xs text-foreground">
                +{otherUsers.length - 3}
              </div>
            )}
          </div>
        )}

        {/* User Count */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{users.length}</span>
        </div>
      </div>

      {/* Expanded View - User List */}
      {isExpanded && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-muted border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-medium text-foreground">Collaborators</span>
            <span className="text-xs text-muted-foreground">{users.length} active</span>
          </div>

          {/* User List */}
          <div className="max-h-64 overflow-y-auto">
            {users.map((user) => (
              <div
                key={user.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 hover:bg-accent/50",
                  user.id === currentUserId && "bg-accent/30"
                )}
              >
                <UserAvatar user={user} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.name}
                    {user.id === currentUserId && (
                      <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  {user.email && (
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  )}
                </div>
                <ActiveIndicator isActive={!!user.cursor || user.id === currentUserId} />
              </div>
            ))}
          </div>

          {/* Connection Status Footer */}
          <div className="px-3 py-2 border-t border-border bg-muted">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon
                  className={cn("h-4 w-4", status.color, status.animate && "animate-spin")}
                />
                <span className={cn("text-xs", status.color)}>{status.label}</span>
              </div>
              {(connectionStatus === "disconnected" || connectionStatus === "error") &&
                onReconnect && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReconnect();
                    }}
                    className="text-xs text-primary-400 hover:text-primary-300"
                  >
                    Reconnect
                  </button>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
}

// User Avatar Component
function UserAvatar({
  user,
  size = "sm",
}: {
  user: CollaborationUser;
  size?: "sm" | "md";
}) {
  const sizeClasses = {
    sm: "h-7 w-7 text-xs",
    md: "h-8 w-8 text-sm",
  };

  const initials = (user.name || "?")
    .split(" ")
    .map((n) => n[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-medium text-foreground border-2 border-background",
        sizeClasses[size]
      )}
      style={{ backgroundColor: user.color }}
      title={user.name || "Unknown"}
    >
      {initials}
    </div>
  );
}

// Active Indicator (shows if user is actively editing)
function ActiveIndicator({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={cn(
        "h-2 w-2 rounded-full",
        isActive ? "bg-green-400 animate-pulse" : "bg-muted"
      )}
    />
  );
}

// Compact badge version for the editor header
export function CollaborationBadge({
  users,
  currentUserId,
  connectionStatus,
  className,
}: {
  users: CollaborationUser[];
  currentUserId: string;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  className?: string;
}) {
  const otherUsers = users.filter((u) => u.id !== currentUserId);

  if (connectionStatus !== "connected") {
    const icons = {
      connecting: RefreshCw,
      disconnected: WifiOff,
      error: AlertCircle,
    };
    const Icon = icons[connectionStatus];

    return (
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-lg text-xs",
          connectionStatus === "error" ? "bg-red-900/30 text-red-400" : "bg-accent text-muted-foreground",
          className
        )}
      >
        <Icon className={cn("h-3 w-3", connectionStatus === "connecting" && "animate-spin")} />
        <span>{connectionStatus === "connecting" ? "Connecting..." : connectionStatus}</span>
      </div>
    );
  }

  if (otherUsers.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex -space-x-1.5">
        {otherUsers.slice(0, 3).map((user) => (
          <div
            key={user.id}
            className="h-6 w-6 rounded-full border border-border flex items-center justify-center text-[10px] font-medium text-foreground"
            style={{ backgroundColor: user.color }}
            title={user.name || "Unknown"}
          >
            {(user.name || "?").charAt(0).toUpperCase()}
          </div>
        ))}
      </div>
      {otherUsers.length > 3 && (
        <span className="text-xs text-muted-foreground">+{otherUsers.length - 3}</span>
      )}
    </div>
  );
}
