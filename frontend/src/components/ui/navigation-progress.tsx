"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NProgress from "nprogress";

NProgress.configure({
  showSpinner: false,
  speed: 300,
  minimum: 0.1,
  easing: "ease",
  trickleSpeed: 200,
});

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    NProgress.done();
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");

      if (anchor) {
        const href = anchor.getAttribute("href");
        const isExternal = anchor.target === "_blank" || anchor.rel?.includes("external");
        const isSamePageAnchor = href?.startsWith("#");
        const isCurrentPage = href === pathname;

        if (href && !isExternal && !isSamePageAnchor && !isCurrentPage && href.startsWith("/")) {
          NProgress.start();
        }
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname]);

  return null;
}
