"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Replaces the current history entry with `href` once `condition` is true.
export default function useRedirectWhen(condition, href) {
  const router = useRouter();
  useEffect(() => {
    if (condition) router.replace(href);
  }, [condition, href, router]);
}
