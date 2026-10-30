"use client";

import { useState } from "react";

// Builds one ZIP of the class's photos in the browser, each named by B-form (or roll number),
// ready to upload to the board's portal. Plain "stored" ZIP: photos are already compressed.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable.at((c ^ x) & 0xff)! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files: { name: string; data: Uint8Array }[]) {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true); local.setUint32(22, f.data.length, true); local.setUint16(26, name.length, true);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint32(16, crc, true);
    dir.setUint32(20, f.data.length, true); dir.setUint32(24, f.data.length, true); dir.setUint16(28, name.length, true); dir.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const size = central.reduce((t, c) => t + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: "application/zip" });
}

export function BoardPhotosZip({ photos, fileName }: { photos: { name: string; url: string }[]; fileName: string }) {
  const [state, setState] = useState("");
  const run = async () => {
    const files: { name: string; data: Uint8Array }[] = [];
    let failed = 0;
    for (const [i, p] of photos.entries()) {
      setState(`Getting photo ${i + 1} of ${photos.length}...`);
      try {
        const res = await fetch(p.url);
        if (!res.ok) throw new Error();
        const ext = (res.headers.get("content-type") ?? "").includes("png") ? "png" : "jpg";
        files.push({ name: `${p.name}.${ext}`, data: new Uint8Array(await res.arrayBuffer()) });
      } catch {
        failed++;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zip(files));
    a.download = fileName;
    a.click();
    setState(failed ? `${files.length} photos saved; ${failed} could not be fetched.` : `${files.length} photos saved.`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-ghost" onClick={run} disabled={!photos.length}>Download {photos.length} photos (ZIP)</button>
      {state && <span className="muted text-sm">{state}</span>}
    </div>
  );
}
