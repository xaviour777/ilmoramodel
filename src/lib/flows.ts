import type { SupabaseClient } from "@supabase/supabase-js";
import { mobilePK } from "@/lib/messages";
import { rupees, shortDate, todayPK } from "@/lib/format";

// ---------- shape of a flow ----------
export type FlowNode =
  | { id: string; type: "trigger"; x: number; y: number; data: Record<string, never> }
  | { id: string; type: "wait"; x: number; y: number; data: { mode: "days" | "due"; days: number } }
  | { id: string; type: "check"; x: number; y: number; data: { cond: Cond } }
  | { id: string; type: "send"; x: number; y: number; data: { text: string } }
  | { id: string; type: "end"; x: number; y: number; data: Record<string, never> };
export type FlowEdge = { from: string; to: string; branch?: "yes" | "no" };
export type Cond = "unpaid" | "still_absent" | "not_submitted";
export type Trigger = "fee_due" | "absent" | "absent_streak" | "homework" | "result" | "birthday" | "new_admission";

export const TRIGGERS: Record<Trigger, { label: string; hint: string; due?: boolean }> = {
  fee_due: { label: "Fee challan unpaid", hint: "Starts for every challan with money owed. Waits can be set from the due date.", due: true },
  absent: { label: "Marked absent", hint: "Starts the day a child is marked absent." },
  absent_streak: { label: "Absent 3 days in a week", hint: "Starts when a child has 3 or more absences in 7 days." },
  homework: { label: "Homework given", hint: "Starts for each family when homework is set for their child's class." },
  result: { label: "Result published", hint: "Starts when an exam's results are published." },
  birthday: { label: "Birthday", hint: "Starts on the child's birthday." },
  new_admission: { label: "New admission", hint: "Starts when a child is admitted." },
};
export const CONDS: Record<Cond, string> = { unpaid: "Fee still unpaid?", still_absent: "Absent today?", not_submitted: "Homework not handed in?" };
export const VARS = ["{parent}", "{student}", "{class}", "{amount}", "{due_date}", "{exam}", "{school}", "{date}"];

// Ready-made flows a school can start from.
export const TEMPLATES: { name: string; trigger: Trigger; nodes: FlowNode[]; edges: FlowEdge[] }[] = [
  {
    name: "Fee reminder: before, on and after the due date", trigger: "fee_due",
    nodes: [
      { id: "t", type: "trigger", x: 40, y: 40, data: {} },
      { id: "w1", type: "wait", x: 40, y: 150, data: { mode: "due", days: -3 } },
      { id: "s1", type: "send", x: 40, y: 260, data: { text: "Assalam-o-Alaikum {parent}. A reminder from {school}: {student}'s fee of {amount} is due on {due_date}. JazakAllah." } },
      { id: "w2", type: "wait", x: 40, y: 380, data: { mode: "due", days: 1 } },
      { id: "c1", type: "check", x: 40, y: 490, data: { cond: "unpaid" } },
      { id: "s2", type: "send", x: 40, y: 610, data: { text: "{parent}, {student}'s fee of {amount} was due on {due_date}. Please pay at the school office or online. Thank you." } },
      { id: "w3", type: "wait", x: 40, y: 730, data: { mode: "due", days: 7 } },
      { id: "c2", type: "check", x: 40, y: 840, data: { cond: "unpaid" } },
      { id: "s3", type: "send", x: 40, y: 960, data: { text: "{parent}, {amount} is still unpaid for {student}. Please contact the office today so we can help." } },
      { id: "e", type: "end", x: 360, y: 560, data: {} },
    ],
    edges: [{ from: "t", to: "w1" }, { from: "w1", to: "s1" }, { from: "s1", to: "w2" }, { from: "w2", to: "c1" }, { from: "c1", to: "s2", branch: "yes" }, { from: "c1", to: "e", branch: "no" },
      { from: "s2", to: "w3" }, { from: "w3", to: "c2" }, { from: "c2", to: "s3", branch: "yes" }, { from: "c2", to: "e", branch: "no" }],
  },
  {
    name: "Absent today", trigger: "absent",
    nodes: [{ id: "t", type: "trigger", x: 40, y: 40, data: {} }, { id: "s1", type: "send", x: 40, y: 160, data: { text: "Assalam-o-Alaikum {parent}. {student} ({class}) is absent today, {date}. If this is a mistake, please tell the class teacher." } }],
    edges: [{ from: "t", to: "s1" }],
  },
  {
    name: "Absent 3 days: call the parents", trigger: "absent_streak",
    nodes: [{ id: "t", type: "trigger", x: 40, y: 40, data: {} }, { id: "s1", type: "send", x: 40, y: 160, data: { text: "{parent}, {student} has missed 3 or more days this week. Please call the school so we can help {student} catch up." } }],
    edges: [{ from: "t", to: "s1" }],
  },
  {
    name: "Homework: remind if not handed in", trigger: "homework",
    nodes: [{ id: "t", type: "trigger", x: 40, y: 40, data: {} }, { id: "w1", type: "wait", x: 40, y: 150, data: { mode: "due", days: 0 } },
      { id: "c1", type: "check", x: 40, y: 260, data: { cond: "not_submitted" } },
      { id: "s1", type: "send", x: 40, y: 380, data: { text: "{parent}, {student}'s homework was due today and isn't handed in yet. Please check tonight." } }, { id: "e", type: "end", x: 360, y: 380, data: {} }],
    edges: [{ from: "t", to: "w1" }, { from: "w1", to: "c1" }, { from: "c1", to: "s1", branch: "yes" }, { from: "c1", to: "e", branch: "no" }],
  },
  {
    name: "Birthday wish", trigger: "birthday",
    nodes: [{ id: "t", type: "trigger", x: 40, y: 40, data: {} }, { id: "s1", type: "send", x: 40, y: 160, data: { text: "Happy birthday {student}! 🎂 Best wishes from everyone at {school}." } }],
    edges: [{ from: "t", to: "s1" }],
  },
];

// ---------- engine ----------
type Ctx = { family_id: string | null; student_id: string | null; due_on?: string; homework_id?: string; exam?: string };
type Run = { id: string; flow_id: string; family_id: string | null; student_id: string | null; node_id: string; next_at: string; log: { at: string; node?: string; note: string; ctx?: Ctx; waiting?: string; catchup?: boolean }[] };
type Flow = { id: string; campus_id: string; trigger: Trigger; nodes: FlowNode[]; edges: FlowEdge[] };
const DAY = 864e5;
const at9 = (d: string) => new Date(d + "T04:00:00Z"); // 9 am Pakistan time

// What starts a run: one row per family/student and event, deduplicated by `ref`.
async function starts(sb: SupabaseClient, f: Flow, today: string): Promise<{ ref: string; ctx: Ctx }[]> {
  const ago = (n: number) => new Date(Date.parse(today) - n * DAY).toISOString().slice(0, 10);
  const c = f.campus_id;
  if (f.trigger === "fee_due") {
    const { data: owing } = await sb.from("family_balances").select("family_id").eq("campus_id", c).gt("balance_paisa", 0).limit(5000);
    const fam = (owing ?? []).map((x) => x.family_id);
    if (!fam.length) return [];
    const out: { ref: string; ctx: Ctx }[] = [];
    for (let i = 0; i < fam.length; i += 200) {
      const { data } = await sb.from("invoices").select("id, family_id, due_on").eq("campus_id", c).in("family_id", fam.slice(i, i + 200)).gte("due_on", ago(30));
      for (const v of data ?? []) out.push({ ref: `inv:${v.id}`, ctx: { family_id: v.family_id, student_id: null, due_on: v.due_on } });
    }
    return out;
  }
  if (f.trigger === "absent") {
    const { data } = await sb.from("attendance").select("student_id, date, students(family_id)").eq("campus_id", c).eq("status", "absent").eq("date", today);
    return (data ?? []).map((a) => ({ ref: `abs:${a.student_id}:${a.date}`, ctx: { family_id: (a.students as unknown as { family_id: string } | null)?.family_id ?? null, student_id: a.student_id } }));
  }
  if (f.trigger === "absent_streak") {
    const { data } = await sb.from("attendance").select("student_id, students(family_id)").eq("campus_id", c).eq("status", "absent").gte("date", ago(6));
    const n = new Map<string, { k: number; fam: string | null }>();
    for (const a of data ?? []) { const x = n.get(a.student_id) ?? { k: 0, fam: (a.students as unknown as { family_id: string } | null)?.family_id ?? null }; x.k++; n.set(a.student_id, x); }
    const week = ago(((new Date(today).getUTCDay() + 6) % 7));
    return [...n].filter(([, x]) => x.k >= 3).map(([sid, x]) => ({ ref: `streak:${sid}:${week}`, ctx: { family_id: x.fam, student_id: sid } }));
  }
  if (f.trigger === "homework") {
    const { data: hw } = await sb.from("homework").select("id, section_id, due_on").eq("campus_id", c).gte("created_at", ago(1));
    const out: { ref: string; ctx: Ctx }[] = [];
    for (const h of hw ?? []) {
      const { data: kids } = await sb.from("students").select("id, family_id").eq("section_id", h.section_id).eq("status", "enrolled");
      for (const k of kids ?? []) out.push({ ref: `hw:${h.id}:${k.id}`, ctx: { family_id: k.family_id, student_id: k.id, due_on: h.due_on, homework_id: h.id } });
    }
    return out;
  }
  if (f.trigger === "result") {
    const { data: ex } = await sb.from("exams").select("id, name, exam_sections(section_id)").eq("campus_id", c).eq("status", "results").gte("ends_on", ago(30));
    const out: { ref: string; ctx: Ctx }[] = [];
    for (const e of ex ?? []) {
      const secs = ((e.exam_sections ?? []) as { section_id: string }[]).map((s) => s.section_id);
      if (!secs.length) continue;
      const { data: kids } = await sb.from("students").select("id, family_id").in("section_id", secs).eq("status", "enrolled");
      for (const k of kids ?? []) out.push({ ref: `res:${e.id}:${k.id}`, ctx: { family_id: k.family_id, student_id: k.id, exam: e.name } });
    }
    return out;
  }
  if (f.trigger === "birthday") {
    const { data } = await sb.from("students").select("id, family_id, date_of_birth").eq("campus_id", c).eq("status", "enrolled").not("date_of_birth", "is", null).limit(5000);
    return (data ?? []).filter((s) => s.date_of_birth!.slice(5) === today.slice(5)).map((s) => ({ ref: `bday:${s.id}:${today.slice(0, 4)}`, ctx: { family_id: s.family_id, student_id: s.id } }));
  }
  const { data } = await sb.from("students").select("id, family_id").eq("campus_id", c).gte("admitted_on", ago(1));
  return (data ?? []).map((s) => ({ ref: `adm:${s.id}`, ctx: { family_id: s.family_id, student_id: s.id } }));
}

async function check(sb: SupabaseClient, cond: Cond, ctx: Ctx, today: string) {
  if (cond === "unpaid") {
    const { data } = await sb.from("family_balances").select("balance_paisa").eq("family_id", ctx.family_id ?? "").maybeSingle();
    return Number(data?.balance_paisa ?? 0) > 0;
  }
  if (cond === "still_absent") {
    const { data } = await sb.from("attendance").select("status").eq("student_id", ctx.student_id ?? "").eq("date", today).maybeSingle();
    return data?.status === "absent";
  }
  const { data } = await sb.from("homework_submissions").select("submitted_at").eq("homework_id", ctx.homework_id ?? "").eq("student_id", ctx.student_id ?? "").maybeSingle();
  return !data?.submitted_at;
}

async function fill(sb: SupabaseClient, text: string, ctx: Ctx, campusName: string, today: string) {
  const [{ data: fam }, { data: kids }, { data: bal }] = await Promise.all([
    sb.from("families").select("name, phone, reminder_phone").eq("id", ctx.family_id ?? "").maybeSingle(),
    ctx.student_id ? sb.from("students").select("full_name, sections(name, classes(name))").eq("id", ctx.student_id) : sb.from("students").select("full_name, sections(name, classes(name))").eq("family_id", ctx.family_id ?? "").eq("status", "enrolled"),
    sb.from("family_balances").select("balance_paisa").eq("family_id", ctx.family_id ?? "").maybeSingle(),
  ]);
  type K = { full_name: string; sections: { name: string; classes: { name: string } } | null };
  const K = (kids ?? []) as unknown as K[];
  const v: Record<string, string> = {
    parent: fam?.name ?? "Parent", student: K.map((k) => k.full_name.split(" ")[0]).join(" & ") || "your child",
    class: K[0]?.sections ? `${K[0].sections.classes.name}-${K[0].sections.name}` : "", amount: rupees(Math.max(0, Number(bal?.balance_paisa ?? 0))),
    due_date: ctx.due_on ? shortDate(ctx.due_on) : "", exam: ctx.exam ?? "", school: campusName, date: shortDate(today),
  };
  return { body: text.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m), phone: mobilePK(fam?.reminder_phone) ?? mobilePK(fam?.phone) };
}

// Starts new runs and moves due runs forward. Messages go to the outbox (kind "flow").
// Works with a signed-in client (RLS) or the service client from the cron, always scoped to one campus.
export async function runFlows(sb: SupabaseClient, campusId: string, campusName: string, flowId?: string) {
  const today = todayPK();
  const now = new Date();
  let q = sb.from("wa_flows").select("id, campus_id, trigger, nodes, edges").eq("campus_id", campusId).eq("enabled", true);
  if (flowId) q = q.eq("id", flowId);
  const { data: flows } = await q;
  let started = 0, queued = 0;
  for (const f of (flows ?? []) as Flow[]) {
    const trig = f.nodes.find((n) => n.type === "trigger");
    if (!trig) continue;
    const s = await starts(sb, f, today);
    for (let i = 0; i < s.length; i += 200) {
      const rows = s.slice(i, i + 200).map((x) => ({ campus_id: campusId, flow_id: f.id, family_id: x.ctx.family_id, student_id: x.ctx.student_id, ref: x.ref, node_id: trig.id,
        // a challan that was already overdue when the flow was switched on skips the reminders whose time has passed
        log: [{ at: now.toISOString(), note: "started", ctx: x.ctx, catchup: !!x.ctx.due_on && f.trigger === "fee_due" && x.ctx.due_on < today }] }));
      const { data } = await sb.from("wa_flow_runs").upsert(rows, { onConflict: "flow_id,ref", ignoreDuplicates: true }).select("id");
      started += data?.length ?? 0;
    }
    const { data: due } = await sb.from("wa_flow_runs").select("id, flow_id, family_id, student_id, node_id, next_at, log").eq("flow_id", f.id).eq("status", "waiting").lte("next_at", now.toISOString()).limit(500);
    for (const r of (due ?? []) as Run[]) {
      const ctx = r.log.find((l) => l.ctx)?.ctx ?? { family_id: r.family_id, student_id: r.student_id };
      let catchup = r.log.at(-1)?.catchup ?? false;
      let node = f.nodes.find((n) => n.id === r.node_id);
      const log = [...r.log];
      let nextAt: Date | null = null, status: "waiting" | "done" = "waiting";
      for (let steps = 0; node && steps < 50; steps++) {
        let branch: "yes" | "no" | undefined;
        if (node.type === "wait") {
          const waitKey = node.id;
          const target = node.data.mode === "due" && ctx.due_on ? at9(new Date(Date.parse(ctx.due_on) + node.data.days * DAY).toISOString().slice(0, 10))
            : log.at(-1)?.waiting === waitKey ? new Date(r.next_at) : new Date(now.getTime() + node.data.days * DAY);
          if (target > now) { nextAt = target; log.push({ at: now.toISOString(), node: node.id, note: `waiting until ${target.toISOString().slice(0, 10)}`, waiting: waitKey, catchup: false }); break; }
          if (target.getTime() > now.getTime() - DAY) catchup = false; // a step that is due now, not one missed long ago
        } else if (node.type === "check") {
          branch = (await check(sb, node.data.cond, ctx, today)) ? "yes" : "no";
          log.push({ at: now.toISOString(), node: node.id, note: `${CONDS[node.data.cond]} ${branch}`, catchup });
        } else if (node.type === "send") {
          if (catchup) log.push({ at: now.toISOString(), node: node.id, note: "skipped: its time had already passed when the flow started", catchup });
          else {
            const m = await fill(sb, node.data.text, ctx, campusName, today);
            if (!m.phone) log.push({ at: now.toISOString(), node: node.id, note: "no mobile number", catchup });
            else {
              const { error } = await sb.from("messages").insert({ campus_id: campusId, family_id: ctx.family_id, channel: "whatsapp", to_phone: m.phone, body: m.body, kind: "flow", dedupe_key: `flow:${r.id}:${node.id}` });
              if (!error) queued++;
              log.push({ at: now.toISOString(), node: node.id, note: error ? `not queued: ${error.message}` : "message queued", catchup });
            }
          }
        } else if (node.type === "end") { status = "done"; break; }
        const e = f.edges.find((x) => x.from === node!.id && (branch ? x.branch === branch : true));
        if (!e) { status = "done"; break; }
        node = f.nodes.find((n) => n.id === e.to);
      }
      if (!node) status = "done";
      await sb.from("wa_flow_runs").update({ node_id: node?.id ?? r.node_id, next_at: (nextAt ?? now).toISOString(), status: nextAt ? "waiting" : status, log: log.slice(-30) }).eq("id", r.id);
    }
    await sb.from("wa_flows").update({ last_run_at: now.toISOString() }).eq("id", f.id);
  }
  return { started, queued };
}
