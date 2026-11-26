"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { siteDomain } from "@/lib/site/load";

export type EnquiryResult = { ref?: string; error?: string };

// A parent's admission enquiry. Everything is checked again in the database (site_enquiry):
// the site must be live, the class must belong to the campus, and floods are refused.
export async function sendEnquiry(form: FormData): Promise<EnquiryResult> {
  // a bot fills the hidden field, or submits faster than a person can type
  if (String(form.get("website") ?? "") !== "") return { ref: "MS-OK" };
  const started = Number(form.get("started") ?? 0);
  if (!started || Date.now() - started < 3000) return { error: "busy" };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const visit = s("kind") === "visit";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("site_enquiry", {
    p_domain: await siteDomain(),
    p_campus: s("campus") || null,
    p_class: s("class") || null,
    p_child: s("child").slice(0, 80),
    p_guardian: s("guardian").slice(0, 80),
    p_phone: s("phone").slice(0, 20),
    p_visit: visit,
    p_visit_on: visit && /^\d{4}-\d{2}-\d{2}$/.test(s("visit_on")) ? s("visit_on") : null,
    p_message: s("message").slice(0, 600),
    p_ip: ip,
  });
  if (error) return { error: "generic" };
  const r = data as { ref?: string; error?: string } | null;
  return r?.ref ? { ref: r.ref } : { error: r?.error ?? "generic" };
}
