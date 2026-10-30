"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveAvatar } from "@/app/(app)/profile/actions";
import { Avatar } from "./avatar";

// Crops the chosen picture to a square, shrinks it to 320 px (a phone photo becomes ~30 KB),
// uploads it to the person's own folder and saves its address on the profile.
export function AvatarUpload({ name, url }: { name: string; url: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setBusy(true); setError(null);
    try {
      const bmp = await createImageBitmap(file);
      const side = Math.min(bmp.width, bmp.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 320;
      canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 320, 320);
      const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Could not read the picture."))), "image/jpeg", 0.85));
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const path = `${user.id}/${Date.now()}.jpg`;
      const up = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      const res = await saveAvatar(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
      if (res.error) throw new Error(res.error);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={name} url={url} size={96} />
      <div className="flex flex-col gap-2">
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost min-h-10 px-3 text-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : url ? "Change photo" : "Add photo"}</button>
          {url && <button type="button" className="muted text-xs underline" disabled={busy} onClick={async () => { await saveAvatar(null); router.refresh(); }}>Remove</button>}
        </div>
        <span className="muted text-xs">On a phone you can take a new picture with the camera.</span>
        {error && <span className="text-sm font-extrabold" style={{ color: "var(--red-ink)" }}>{error}</span>}
      </div>
    </div>
  );
}
