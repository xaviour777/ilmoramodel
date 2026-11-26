"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// A website photo: upload from the phone or computer (shrunk to at most 1600 px wide, ~200 KB,
// into the school's own folder of the public "site" bucket), or paste a link. Saved with the form.
export function ImageField({ name, label, value, schoolId, hint }: { name: string; label: string; value: string; schoolId: string; hint?: string }) {
  const [url, setUrl] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setBusy(true); setError(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please choose a photo (JPG, PNG or WebP).");
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / bmp.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Could not read the picture."))), "image/webp", 0.82));
      const supabase = createClient();
      const path = `${schoolId}/${name.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}.webp`;
      const up = await supabase.storage.from("site").upload(path, blob, { contentType: "image/webp" });
      if (up.error) throw new Error(up.error.message);
      setUrl(supabase.storage.from("site").getPublicUrl(path).data.publicUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" className="h-20 w-28 rounded-xl object-cover" />
          : <div className="flex h-20 w-28 items-center justify-center rounded-xl bg-[#f1f5f9] text-[11px] font-bold text-[#64748b]">No photo</div>}
        <div className="flex flex-col gap-1.5">
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          <div className="flex gap-2">
            <button type="button" className="btn-ghost min-h-9 px-3 text-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : url ? "Change" : "Upload photo"}</button>
            {url && <button type="button" className="btn-ghost min-h-9 px-3 text-sm" onClick={() => setUrl("")}>Remove</button>}
          </div>
          {hint && <span className="muted text-xs">{hint}</span>}
          {error && <span className="text-sm font-extrabold" style={{ color: "var(--red-ink)" }}>{error}</span>}
        </div>
      </div>
      <input type="hidden" name={name} value={url} />
    </div>
  );
}
