"use client";

import * as React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface PremiumCardProps extends HTMLMotionProps<"div"> {
  variant?: "default" | "glass" | "elevated" | "interactive";
  glow?: boolean;
  glowColor?: string;
}

const PremiumCard = React.forwardRef<HTMLDivElement, PremiumCardProps>(
  ({ className, variant = "default", glow = false, glowColor = "primary", children, ...props }, ref) => {
    const variants = {
      default: "bg-muted/80 border-border/50",
      glass: "bg-muted/40 backdrop-blur-xl border-border/30",
      elevated: "bg-muted border-border shadow-xl shadow-black/20",
      interactive: "bg-muted/80 border-border/50 hover:border-border hover:bg-muted/90 cursor-pointer",
    };

    const glowColors: Record<string, string> = {
      primary: "shadow-primary-500/20",
      green: "shadow-green-500/20",
      amber: "shadow-amber-500/20",
      purple: "shadow-purple-500/20",
      red: "shadow-red-500/20",
    };

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        whileHover={variant === "interactive" ? { scale: 1.01, y: -2 } : undefined}
        whileTap={variant === "interactive" ? { scale: 0.99 } : undefined}
        className={cn(
          "rounded-xl border transition-all duration-200",
          variants[variant],
          glow && `shadow-lg ${glowColors[glowColor] || glowColors.primary}`,
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
PremiumCard.displayName = "PremiumCard";

// Card Header with gradient border option
interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  gradient?: boolean;
}

const PremiumCardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, gradient = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col space-y-1.5 p-4",
        gradient && "border-b border-gradient-to-r from-slate-700 via-slate-600 to-slate-700",
        !gradient && "border-b border-border/50",
        className
      )}
      {...props}
    />
  )
);
PremiumCardHeader.displayName = "PremiumCardHeader";

const PremiumCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-foreground",
      className
    )}
    {...props}
  />
));
PremiumCardTitle.displayName = "PremiumCardTitle";

const PremiumCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
PremiumCardDescription.displayName = "PremiumCardDescription";

const PremiumCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
PremiumCardContent.displayName = "PremiumCardContent";

const PremiumCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-4 pt-0", className)}
    {...props}
  />
));
PremiumCardFooter.displayName = "PremiumCardFooter";

// Animated list item wrapper
interface AnimatedListItemProps extends HTMLMotionProps<"div"> {
  index?: number;
}

const AnimatedListItem = React.forwardRef<HTMLDivElement, AnimatedListItemProps>(
  ({ className, index = 0, children, ...props }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, delay: index * 0.05, ease: "easeOut" }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
);
AnimatedListItem.displayName = "AnimatedListItem";

// Skeleton with shimmer effect
interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = "text", width, height, ...props }, ref) => {
    const variants = {
      text: "h-4 rounded",
      circular: "rounded-full",
      rectangular: "rounded-lg",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden bg-accent/50",
          variants[variant],
          className
        )}
        style={{ width, height }}
        {...props}
      >
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-slate-600/30 to-transparent" />
      </div>
    );
  }
);
Skeleton.displayName = "Skeleton";

// Badge with subtle animation
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error" | "info" | "outline";
  size?: "sm" | "md";
  pulse?: boolean;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", size = "sm", pulse = false, children, ...props }, ref) => {
    const variants = {
      default: "bg-accent text-foreground",
      success: "bg-green-900/50 text-green-400 border-green-800/50",
      warning: "bg-amber-900/50 text-amber-400 border-amber-800/50",
      error: "bg-red-900/50 text-red-400 border-red-800/50",
      info: "bg-blue-900/50 text-blue-400 border-blue-800/50",
      outline: "bg-transparent border-border text-muted-foreground",
    };

    const sizes = {
      sm: "text-xs px-2 py-0.5",
      md: "text-sm px-2.5 py-1",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-medium transition-colors",
          variants[variant],
          sizes[size],
          pulse && "animate-pulse",
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);
Badge.displayName = "Badge";

// Icon Button with hover effects
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    const variants = {
      default: "bg-accent hover:bg-muted text-foreground",
      ghost: "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
      outline: "border border-border hover:bg-accent/50 text-muted-foreground hover:text-foreground",
    };

    const sizes = {
      sm: "h-7 w-7",
      md: "h-9 w-9",
      lg: "h-11 w-11",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-2 focus:ring-offset-slate-900",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "active:scale-95",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
IconButton.displayName = "IconButton";

export {
  PremiumCard,
  PremiumCardHeader,
  PremiumCardTitle,
  PremiumCardDescription,
  PremiumCardContent,
  PremiumCardFooter,
  AnimatedListItem,
  Skeleton,
  Badge,
  IconButton,
};
