"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { savePhoto } from "@/app/(app)/principal/students/actions";
import { Avatar } from "./avatar";

// A passport-style photo taken by the office: cropped to 3:4, shrunk to 300x400 (~40 KB),
// stored in the campus folder of the photos bucket. Boards ask for a light blue background.
export function PhotoUpload({ kind, id, campusId, name, url }: { kind: "student" | "staff"; id: string; campusId: string; name: string; url: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setBusy(true); setError(null);
    try {
      const bmp = await createImageBitmap(file);
      const w = Math.min(bmp.width, bmp.height * 0.75), h = w / 0.75;
      const canvas = document.createElement("canvas");
      canvas.width = 300; canvas.height = 400;
      canvas.getContext("2d")!.drawImage(bmp, (bmp.width - w) / 2, (bmp.height - h) / 2, w, h, 0, 0, 300, 400);
      const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Could not read the picture."))), "image/jpeg", 0.85));
      const supabase = createClient();
      const path = `${campusId}/${kind}-${id}-${Date.now()}.jpg`;
      const up = await supabase.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      const res = await savePhoto(kind, id, supabase.storage.from("photos").getPublicUrl(path).data.publicUrl);
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
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={`Photo of ${name}`} width={72} height={96} className="rounded-xl object-cover" style={{ width: 72, height: 96 }} />
        : <Avatar name={name} url={null} size={72} />}
      <div className="flex flex-col gap-2">
        <input ref={input} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        <button type="button" className="btn-ghost min-h-10 self-start px-3 text-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : url ? "Change photo" : "Add photo"}</button>
        <span className="muted text-xs">Face in the middle, light blue background, as the board asks.</span>
        {error && <span className="text-sm font-extrabold" style={{ color: "var(--red-ink)" }}>{error}</span>}
      </div>
    </div>
  );
}
