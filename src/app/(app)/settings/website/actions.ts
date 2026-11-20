"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { ACHIEVEMENT_CATEGORIES, PROJECT_CATEGORIES, type SiteContent, type T } from "@/lib/site/content";

const back = (q: string): never => redirect(`/settings/website?${q}`);
type Raw = Record<string, unknown>;

// "hero.title.en" → { hero: { title: { en } } }; numeric parts make arrays.
function unflatten(f: FormData): Raw {
  const out: Raw = {};
  for (const [key, value] of f.entries()) {
    if (typeof value !== "string" || !/^[a-zA-Z0-9_.]+$/.test(key) || key.startsWith("$")) continue;
    const parts = key.split(".");
    let cur: Raw = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = value;
      else cur = (cur[p] ??= {}) as Raw;
    });
  }
  return out;
}

const s = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const tx = (v: unknown, max = 4000): T => ({ en: s((v as Raw | undefined)?.en, max), ur: s((v as Raw | undefined)?.ur, max) });
const url = (v: unknown) => { const u = s(v, 600); return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ""; };
const list = (v: unknown): Raw[] => (v && typeof v === "object" ? Object.keys(v as Raw).sort((a, b) => Number(a) - Number(b)).map((k) => (v as Raw)[k] as Raw) : []);
const phone = (v: unknown) => s(v, 20).replace(/[^\d+\s-]/g, "");

// Everything typed in Settings → Website, checked field by field (only known fields are kept).
function toContent(r: Raw): SiteContent {
  const g = (k: string) => (r[k] ?? {}) as Raw;
  const showcase = (v: unknown, cats: string[]) => list(v).map((x) => ({
    title: tx(x.title, 160), category: cats.includes(s(x.category)) ? s(x.category) : cats[0], text: tx(x.text, 600), image: url(x.image),
    verified: x.verified === "1", consent: x.consent === "1",
  })).filter((x) => x.title.en || x.title.ur).slice(0, 60);
  return {
    hero: { eyebrow: tx(g("hero").eyebrow, 120), title: tx(g("hero").title, 120), text: tx(g("hero").text, 400), image: url(g("hero").image), video: url(g("hero").video) },
    intro: { title: tx(g("intro").title, 160), text: tx(g("intro").text, 800), image: url(g("intro").image), pillars: list(g("intro").pillars).map((p) => ({ title: tx(p.title, 60), text: tx(p.text, 160) })).slice(0, 6) },
    principal: { name: s(g("principal").name, 100), title: tx(g("principal").title, 120), message: tx(g("principal").message, 3000), photo: url(g("principal").photo), video: url(g("principal").video) },
    about: { story: tx(g("about").story), mission: tx(g("about").mission, 1000), vision: tx(g("about").vision, 1000), image: url(g("about").image) },
    leadership: list(r.leadership).map((p) => ({ name: s(p.name, 100), role: tx(p.role, 100), bio: tx(p.bio, 600), photo: url(p.photo) })).filter((p) => p.name).slice(0, 20),
    areas: list(r.areas).map((a) => ({ key: s(a.key, 30), title: tx(a.title, 80), short: tx(a.short, 200), body: tx(a.body, 2000), image: url(a.image) })).slice(0, 6),
    aiLab: { title: tx(g("aiLab").title, 160), text: tx(g("aiLab").text, 800), image: url(g("aiLab").image), points: list(g("aiLab").points).map((p) => tx(p, 200)).filter((p) => p.en || p.ur).slice(0, 8) },
    day: { title: tx(g("day").title, 120), text: tx(g("day").text, 300), image: url(g("day").image), items: list(g("day").items).map((d) => ({ time: s(d.time, 20), title: tx(d.title, 80), text: tx(d.text, 200) })).filter((d) => d.title.en || d.title.ur).slice(0, 10) },
    achievements: showcase(r.achievements, ACHIEVEMENT_CATEGORIES),
    projects: showcase(r.projects, PROJECT_CATEGORIES),
    admissions: { open: g("admissions").open === "1", title: tx(g("admissions").title, 160), text: tx(g("admissions").text, 600), requirements: tx(g("admissions").requirements, 2000), note: tx(g("admissions").note, 600) },
    contact: { address: tx(g("contact").address, 300), phone: phone(g("contact").phone), whatsapp: phone(g("contact").whatsapp), email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(g("contact").email)) ? s(g("contact").email, 120) : "", mapUrl: url(g("contact").mapUrl), hours: tx(g("contact").hours, 200) },
    social: { facebook: url(g("social").facebook), instagram: url(g("social").instagram), youtube: url(g("social").youtube), tiktok: url(g("social").tiktok) },
    policies: { privacy: tx(g("policies").privacy, 6000), childSafety: tx(g("policies").childSafety, 6000) },
    seo: { description: tx(g("seo").description, 300) },
  };
}

const domainList = (v: string) => [...new Set(v.toLowerCase().split(/[\s,]+/).map((d) => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean))];

export async function saveSite(f: FormData) {
  const me = await requireRole("principal", "owner");
  if (!me.school_id) back("error=" + encodeURIComponent("Your login is not linked to a school."));
  const domains = domainList(String(f.get("$domains") ?? ""));
  if (domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) back("error=" + encodeURIComponent("A web address looks wrong. Write it like modelschool.edu.pk"));
  const supabase = await createClient();
  const { error } = await supabase.from("school_sites").upsert({ school_id: me.school_id, draft: toContent(unflatten(f)), domains }, { onConflict: "school_id" });
  if (error) back("error=" + encodeURIComponent(error.message));
  revalidatePath("/settings/website");
  const then = String(f.get("$then") ?? "");
  if (then === "preview") redirect("/site-preview");
  if (then === "publish") return publishSite();
  back("saved=1");
}

export async function publishSite() {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.rpc("site_publish");
  if (error) back("error=" + encodeURIComponent(error.message));
  revalidatePath("/", "layout");
  back("published=1");
}

export async function withdrawSite() {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.rpc("site_withdraw");
  if (error) back("error=" + encodeURIComponent(error.message));
  revalidatePath("/", "layout");
  back("withdrawn=1");
}
