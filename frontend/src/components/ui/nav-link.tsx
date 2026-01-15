"use client";

import * as React from "react";
import Link, { LinkProps } from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface NavLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ children, className, onClick, ...props }, ref) => {
    return (
      <motion.span
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
        className="inline-block"
      >
        <Link
          ref={ref}
          className={cn(className)}
          onClick={onClick}
          {...props}
        >
          {children}
        </Link>
      </motion.span>
    );
  }
);
NavLink.displayName = "NavLink";

export { NavLink };
