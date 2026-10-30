"use client";

import { useState } from "react";
import { noteSent } from "@/app/(app)/accounts/actions";
import { CHANNEL_LABEL, sendLink, type Channel } from "@/lib/messages";

// Opens WhatsApp or the SMS app with the message ready, and notes in Ilmora that it went out.
// It is a real link, so it works even if the note fails, and on a phone it opens the app directly.
export function SendButton({ channel, phone, body, kind, familyId, messageId, primary, label }: {
  channel: Channel; phone: string; body: string; kind: string;
  familyId?: string; messageId?: string; primary?: boolean; label?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <a
      href={sendLink(channel, phone, body)}
      target={channel === "whatsapp" ? "_blank" : undefined}
      rel="noreferrer"
      className={`${primary ? "btn" : "btn-ghost"} min-h-10 px-3 text-sm`}
      onClick={() => {
        setDone(true);
        void noteSent({ message_id: messageId, family_id: familyId, channel, to_phone: phone, body, kind });
      }}
    >
      {done ? "Sent ✓" : (label ?? `Send on ${CHANNEL_LABEL[channel]}`)}
    </a>
  );
}
