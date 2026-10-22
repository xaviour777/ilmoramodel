"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Listens to Supabase Realtime and re-renders the page when any of the given tables change.
// Row-level security still applies: each viewer only hears about rows they can see.
export function LiveRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel("live-" + key);
    for (const table of key.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 800); // batch bursts like a whole class being marked
      });
    }
    channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [key, router]);

  return (
    <span className="pill" style={{ background: live ? "var(--green-soft)" : "#f2f2f2", color: live ? "var(--green-ink)" : "#4b4b4b" }}>
      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: live ? "var(--green)" : "#afafaf" }} />
      {live ? "Live" : "Connecting"}
    </span>
  );
}
