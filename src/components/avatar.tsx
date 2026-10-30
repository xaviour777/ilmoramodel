// A round profile photo, or the person's initials when there is none.
export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full font-black text-white"
      style={{ width: size, height: size, background: "var(--blue)", fontSize: size * 0.38 }}>{initials}</span>
  );
}
