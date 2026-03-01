"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { track } from "@/lib/track";

export default function TrackPageView() {
  const pathname = usePathname();
  const lastPath = useRef("");

  useEffect(() => {
    if (pathname && pathname !== lastPath.current) {
      lastPath.current = pathname;
      const category = pathname.split("/")[1] || "home";
      track("page_view", category);
    }
  }, [pathname]);

  return null;
}
