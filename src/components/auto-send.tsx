"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendWaitingQuietly } from "@/app/(app)/accounts/actions";

// When the office has WhatsApp or SMS connected, messages waiting in the outbox (absent alerts,
// reminders) go out as soon as someone from the office opens this page; nobody has to press Send.
export function AutoSend({ waiting }: { waiting: number }) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (!waiting || ran.current) return;
    ran.current = true;
    void sendWaitingQuietly().then((r) => { if (r.sent) router.refresh(); });
  }, [waiting, router]);
  return null;
}
