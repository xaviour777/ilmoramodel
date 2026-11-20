"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Reloads the page's data every few seconds while the van is on the road.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => router.refresh(), seconds * 1000); return () => clearInterval(t); }, [router, seconds]);
  return <span className="pill pill-green">Live</span>;
}
