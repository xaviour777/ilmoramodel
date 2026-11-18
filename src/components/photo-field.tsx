"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// A passport photo inside a form: upload a file or take one with the camera.
// The picture is cropped to 3:4, shrunk to 300x400 and stored in the campus
// folder of the photos bucket; the form gets its address in a hidden field.
export function PhotoField({ campusId, name = "photo_url" }: { campusId: string; name?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => cam?.getTracks().forEach((t) => t.stop()), [cam]);
  useEffect(() => { if (cam && video.current) { video.current.srcObject = cam; void video.current.play(); } }, [cam]);

  async function save(src: CanvasImageSource, w0: number, h0: number) {
    setBusy(true); setError(null);
    try {
      const w = Math.min(w0, h0 * 0.75), h = w / 0.75;
      const canvas = document.createElement("canvas");
      canvas.width = 300; canvas.height = 400;
      canvas.getContext("2d")!.drawImage(src, (w0 - w) / 2, (h0 - h) / 2, w, h, 0, 0, 300, 400);
      const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Could not read the picture."))), "image/jpeg", 0.85));
      const supabase = createClient();
      const path = `${campusId}/admission-${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      setUrl(supabase.storage.from("photos").getPublicUrl(path).data.publicUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openCamera() {
    setError(null);
    try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })); }
    catch { file.current?.click(); }  // no camera, or permission refused: fall back to choosing a file
  }

  async function snap() {
    const v = video.current;
    if (!v) return;
    await save(v, v.videoWidth, v.videoHeight);
    cam?.getTracks().forEach((t) => t.stop());
    setCam(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <input type="hidden" name={name} value={url} />
      <div className="flex h-[96px] w-[72px] flex-none items-center justify-center overflow-hidden rounded-[14px] border-2 border-dashed border-[#cbd5e1] bg-[#f8fafc]" role="img" aria-label={url ? "Student photo" : "No photo yet"}>
        {cam ? <video ref={video} playsInline muted className="h-full w-full object-cover" />
          // eslint-disable-next-line @next/next/no-img-element
          : url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="muted text-[12px]">Photo</span>}
      </div>
      <div className="flex flex-col gap-2">
        <input ref={file} type="file" accept="image/*" capture="user" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const b = await createImageBitmap(f); await save(b, b.width, b.height); } }} />
        <div className="flex flex-wrap gap-2">
          {cam
            ? <button type="button" className="btn" style={{ minHeight: 36, fontSize: 12 }} disabled={busy} onClick={snap}>Take photo</button>
            : <button type="button" className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }} disabled={busy} onClick={openCamera}>Camera</button>}
          <button type="button" className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }} disabled={busy} onClick={() => file.current?.click()}>{busy ? "Saving…" : url ? "Change" : "Upload"}</button>
        </div>
        <span className="muted text-[12px]">Passport size, plain background. Shows on the profile, result card and admit card.</span>
        {error && <span className="text-[13px] font-extrabold text-[#b91c1c]">{error}</span>}
      </div>
    </div>
  );
}
