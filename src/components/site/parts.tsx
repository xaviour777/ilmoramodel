import Link from "next/link";
import type { ReactNode } from "react";

// Small building blocks shared by the public website pages.

export function Arrow({ size = 16 }: { size?: number }) {
  return (
    <svg className="flip" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Tick({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  academics: <path d="M3 8l9-4 9 4-9 4-9-4zm4 2v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" />,
  science: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 14h9" />,
  technology: <path d="M4 5h16v10H4zM9 19h6M12 15v4M9 9l-2 1 2 1M15 9l2 1-2 1" />,
  creative: <path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5zM7.5 11h.01M10 7h.01M15 7h.01" />,
  sports: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9.5c3 1 6 .5 8.5-2.5M20.5 14.5c-3-1-6-.5-8.5 2.5M8 4.5c2 3 2.5 9 0 15M16 4.5c-2.5 6-2 12 0 15" />,
  character: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />,
};

export function AreaIcon({ k }: { k: string }) {
  return (
    <span className="icon-dot">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICONS[k] ?? ICONS.academics}
      </svg>
    </span>
  );
}

// A school photo, or (until the school uploads one) a quiet tile. Never a stock photo of children.
export function Photo({ src, alt, label, tall, video, priority }: { src: string; alt: string; label: string; tall?: boolean; video?: string; priority?: boolean }) {
  return (
    <div className={`photo${tall ? " tall" : ""}`}>
      {video ? (
        <video src={video} poster={src || undefined} controls preload="none" playsInline aria-label={alt} />
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
      ) : (
        <div className="photo-empty" role="img" aria-label={label}>
          <span>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></svg>
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

// Shown only in the draft preview, where the school still has to add a fact.
export function ToAdd({ show, children }: { show: boolean; children: ReactNode }) {
  return show ? <div className="todo">{children}</div> : null;
}

export function PageHead({ eyebrow, title, lead, children }: { eyebrow?: string; title: string; lead?: string; children?: ReactNode }) {
  return (
    <section className="phead">
      <div className="wrap reveal">
        {eyebrow && <div className="kicker" style={{ marginBottom: 12 }}>{eyebrow}</div>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}

export function CTA({ href, children, kind = "primary" }: { href: string; children: ReactNode; kind?: "primary" | "navy" | "ghost" | "light" | "wa" }) {
  const external = href.startsWith("http") || href.startsWith("tel:") || href.startsWith("mailto:");
  return external
    ? <a href={href} className={`sbtn sbtn-${kind}`} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{children}</a>
    : <Link href={href} className={`sbtn sbtn-${kind}`}>{children}</Link>;
}

// wa.me link for the school's official WhatsApp number (stored as typed, e.g. 0300 1234567)
export function waLink(raw: string, text?: string) {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(2);
  else if (d.startsWith("0")) d = "92" + d.slice(1);
  if (!/^92\d{10}$/.test(d)) return "";
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
export const telLink = (raw: string) => (raw.replace(/[^\d+]/g, "") ? `tel:${raw.replace(/[^\d+]/g, "")}` : "");
