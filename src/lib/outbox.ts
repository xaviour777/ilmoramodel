import { createClient } from "@/lib/supabase/server";
import { recommendChannel, type Channel, type ChannelChoice, type Recommendation } from "@/lib/messages";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type FamilyContact = {
  id: string;
  name: string;
  phone: string | null;
  reminder_phone: string | null;
  reminder_channel: ChannelChoice;
};

// Families with their reminder recommendation. Fee history (last reminder, last payment)
// only matters for fee reminders, so notices skip it.
export async function withRecommendations(supabase: Supabase, families: FamilyContact[], fees: boolean) {
  const ids = families.map((f) => f.id);
  const lastReminder = new Map<string, { channel: Channel; created_at: string }>();
  const lastPayment = new Map<string, string>();
  // ids go in the URL, so ask in batches
  for (let i = 0; fees && i < ids.length; i += 150) {
    const batch = ids.slice(i, i + 150);
    const [{ data: msgs }, { data: pays }] = await Promise.all([
      supabase.from("messages").select("family_id, channel, created_at").in("family_id", batch).eq("kind", "fee_reminder").in("status", ["queued", "sent"]).order("created_at", { ascending: false }),
      supabase.from("payments").select("family_id, received_at").in("family_id", batch).order("received_at", { ascending: false }),
    ]);
    for (const m of msgs ?? []) if (!lastReminder.has(m.family_id)) lastReminder.set(m.family_id, m);
    for (const p of pays ?? []) if (!lastPayment.has(p.family_id)) lastPayment.set(p.family_id, p.received_at);
  }
  return families.map((f) => ({
    ...f,
    rec: recommendChannel({
      reminderPhone: f.reminder_phone, familyPhone: f.phone, choice: f.reminder_channel,
      lastReminder: lastReminder.get(f.id) ?? null, lastPaymentAt: lastPayment.get(f.id) ?? null,
    }) as Recommendation,
  }));
}

// Puts one message per family in the outbox, on each family's recommended channel.
// Families without a mobile number are skipped and counted.
export async function queueForFamilies(supabase: Supabase, p: {
  campusId: string; families: FamilyContact[]; kind: "fee_reminder" | "notice" | "holiday";
  text: (f: FamilyContact) => string; noticeId?: string | null; fees?: boolean;
}) {
  const recs = await withRecommendations(supabase, p.families, !!p.fees);
  const rows = recs.filter((f) => f.rec.channel && f.rec.phone && !(p.fees && f.rec.recentlySent)).map((f) => ({
    campus_id: p.campusId, family_id: f.id, channel: f.rec.channel!, to_phone: f.rec.phone!,
    body: p.text(f), kind: p.kind, notice_id: p.noticeId ?? null,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("messages").insert(rows.slice(i, i + 500));
    if (error) return { error: error.message, queued: i, skipped: recs.length - rows.length };
  }
  return { error: null, queued: rows.length, skipped: recs.length - rows.length };
}

const FAMILY_COLS = "id, name, phone, reminder_phone, reminder_channel";

// Supabase returns at most 1,000 rows per request; a big school has more families than that.
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

export async function familiesByIds(supabase: Supabase, ids: string[]) {
  const out: FamilyContact[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase.from("families").select(FAMILY_COLS).in("id", ids.slice(i, i + 150));
    out.push(...((data ?? []) as FamilyContact[]));
  }
  return out;
}

// Families who should hear a notice: everyone / parents → all families; a class or a section →
// families with an enrolled child there. Staff-only notices go to no family.
export async function familiesForAudience(supabase: Supabase, audience: string, classId: string | null, sectionId: string | null) {
  if (audience === "staff") return [];
  if (audience === "everyone" || audience === "parents") {
    return allRows<FamilyContact>((a, b) => supabase.from("families").select(FAMILY_COLS).order("id").range(a, b));
  }
  const kids = await allRows<{ family_id: string }>((a, b) => {
    const q = supabase.from("students").select("family_id, sections!inner(class_id)").eq("status", "enrolled").order("id").range(a, b);
    return audience === "section" ? q.eq("section_id", sectionId) : q.eq("sections.class_id", classId);
  });
  return familiesByIds(supabase, [...new Set(kids.map((k) => k.family_id))]);
}
