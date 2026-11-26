"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { href: string; label: string };

// Sticky header: full menu on desktop, a drawer on phones, EN / اردو switch, My Model and Apply.
export function SiteHeader({ name, logoUrl, items, lang, labels }: {
  name: string; logoUrl: string | null; items: Item[]; lang: "en" | "ur";
  labels: { myModel: string; apply: string; menu: string; close: string; language: string };
}) {
  const path = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);

  const flip = () => {
    document.cookie = `lang=${lang === "ur" ? "en" : "ur"}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  const current = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const short = name.toUpperCase().includes("MODEL") ? "MODEL SCHOOL" : name;

  const langButton = (
    <button type="button" className="lang" onClick={flip} aria-label={labels.language}>
      {lang === "ur" ? "EN" : <span className="ur" lang="ur">اردو</span>}
    </button>
  );

  return (
    <header className="hdr" data-scrolled={scrolled ? "1" : "0"}>
      <div className="wrap hdr-in">
        <Link href="/" className="logo" aria-label={name}>
          <span className="logo-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="" width={38} height={38} /> : "M"}
          </span>
          <span>{short}</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={current(i.href) ? "page" : undefined}>{i.label}</Link>
          ))}
        </nav>
        <div className="hdr-end">
          {langButton}
          <Link href="/portal" className="sbtn sbtn-ghost hide-sm">{labels.myModel}</Link>
          <Link href="/admissions/enquiry" className="sbtn sbtn-primary hide-sm">{labels.apply}</Link>
          <button type="button" className="burger" aria-label={labels.menu} aria-expanded={open} onClick={() => setOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label={labels.menu} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="drawer-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              {langButton}
              <button type="button" className="burger" aria-label={labels.close} onClick={() => setOpen(false)} autoFocus>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {items.map((i) => (
              <Link key={i.href} href={i.href} className="item" aria-current={current(i.href) ? "page" : undefined}>{i.label}</Link>
            ))}
            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <Link href="/admissions/enquiry" className="sbtn sbtn-primary">{labels.apply}</Link>
              <Link href="/portal" className="sbtn sbtn-ghost">{labels.myModel}</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
