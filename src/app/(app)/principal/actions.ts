"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { mobilePK, noticeText } from "@/lib/messages";
import { familiesForAudience, queueForFamilies } from "@/lib/outbox";
import { deliverQueued } from "@/lib/deliver";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, error?: string, ok?: string): never => {
  const sep = path.includes("?") ? "&" : "?";
  if (error) redirect(`${path}${sep}error=${encodeURIComponent(error)}`);
  revalidatePath(path.split("?")[0]);
  redirect(`${path}${ok ? `${sep}saved=${ok}` : ""}`);
};
const admin = () => requireRole("principal", "owner");

// ---------- Classes and sections ----------
export async function createClass(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { data: cls, error } = await supabase.from("classes")
    .insert({ campus_id: me.campus_id, name: str(f, "name"), board: str(f, "board") || null, sort: Number(str(f, "sort")) || 0 })
    .select("id").single();
  if (error) return back("/principal/classes", error.message);
  const names = str(f, "sections").split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length) {
    const { error: e2 } = await supabase.from("sections").insert(names.map((n) => ({
      campus_id: me.campus_id, class_id: cls.id, name: n, capacity: Number(str(f, "capacity")) || 40,
    })));
    if (e2) return back("/principal/classes", e2.message);
  }
  back("/principal/classes", undefined, "class");
}

export async function addSection(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("sections").insert({
    campus_id: me.campus_id, class_id: str(f, "class_id"), name: str(f, "name"), capacity: Number(str(f, "capacity")) || 40,
  });
  back("/principal/classes", error?.message, "section");
}

export async function setClassTeacher(f: FormData) {
  await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("sections").update({ class_teacher_id: str(f, "teacher_id") || null }).eq("id", str(f, "section_id"));
  back("/principal/classes", error?.message, "teacher");
}

export async function assignSubjectTeacher(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("section_subjects").upsert({
    campus_id: me.campus_id, section_id: str(f, "section_id"), subject_id: str(f, "subject_id"), teacher_id: str(f, "teacher_id") || null,
  }, { onConflict: "section_id,subject_id" });
  back(`/principal/classes?tab=timetable&section=${str(f, "section_id")}`, error?.message, "subject");
}

export async function createSubject(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("subjects").insert({ campus_id: me.campus_id, name: str(f, "name") });
  back("/principal/classes", error?.message, "subjectadded");
}

// ---------- Timings ----------
export async function createTimingProfile(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("timing_profiles")
    .insert({ campus_id: me.campus_id, name: str(f, "name"), active_from: str(f, "active_from") || null, active_to: str(f, "active_to") || null })
    .select("id").single();
  back(`/principal/classes?tab=timings${data ? `&profile=${data.id}` : ""}`, error?.message, "profile");
}

export async function addPeriod(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const profile = str(f, "timing_profile_id");
  const { error } = await supabase.from("periods").insert({
    campus_id: me.campus_id, timing_profile_id: profile, name: str(f, "name"), kind: str(f, "kind") || "class",
    starts_at: str(f, "starts_at"), ends_at: str(f, "ends_at"), sort: Number(str(f, "sort")) || 0,
  });
  back(`/principal/classes?tab=timings&profile=${profile}`, error?.message, "period");
}

export async function deletePeriod(f: FormData) {
  await admin();
  const supabase = await createClient();
  const profile = str(f, "timing_profile_id");
  const { error } = await supabase.from("periods").delete().eq("id", str(f, "period_id"));
  back(`/principal/classes?tab=timings&profile=${profile}`, error?.message);
}

export async function activateTiming(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const id = str(f, "timing_profile_id");
  await supabase.from("timing_profiles").update({ is_active: false }).eq("campus_id", me.campus_id).eq("is_active", true);
  const { error } = await supabase.from("timing_profiles").update({ is_active: true }).eq("id", id);
  back(`/principal/classes?tab=timings&profile=${id}`, error?.message, "active");
}

// ---------- Timetable ----------
export async function setSlot(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const section = str(f, "section_id");
  const subject = str(f, "subject_id");
  const path = `/principal/classes?tab=timetable&section=${section}`;
  if (!subject) {
    const { error } = await supabase.from("timetable_slots").delete()
      .eq("section_id", section).eq("weekday", Number(str(f, "weekday"))).eq("period_id", str(f, "period_id"));
    return back(path, error?.message, "slot");
  }
  const { error } = await supabase.from("timetable_slots").upsert({
    campus_id: me.campus_id, section_id: section, weekday: Number(str(f, "weekday")), period_id: str(f, "period_id"),
    subject_id: subject, teacher_id: str(f, "teacher_id") || null,
  }, { onConflict: "section_id,weekday,period_id" });
  const clash = error?.message.includes("timetable_slots_teacher_id_weekday_period_id_key");
  back(path, clash ? "That teacher already has a class in this period. Pick another teacher or period." : error?.message, "slot");
}

// ---------- Exams ----------
export async function createExam(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const term = str(f, "term_id");
  const { data: exam, error } = await supabase.from("exams").insert({
    campus_id: me.campus_id, term_id: term, name: str(f, "name"), kind: str(f, "kind"),
    starts_on: str(f, "starts_on") || null, ends_on: str(f, "ends_on") || null,
    total_marks: Number(str(f, "total_marks")) || 100, weight_percent: Number(str(f, "weight_percent")) || 0,
    grading_scale_id: str(f, "grading_scale_id") || null,
  }).select("id").single();
  if (error) return back(`/principal/exams?term=${term}`, error.message);
  const classIds = f.getAll("class_id").map(String);
  if (classIds.length) {
    const { data: secs } = await supabase.from("sections").select("id").in("class_id", classIds);
    if (secs?.length) await supabase.from("exam_sections").insert(secs.map((s) => ({ exam_id: exam.id, section_id: s.id, campus_id: me.campus_id })));
  }
  back(`/principal/exams?term=${term}&exam=${exam.id}`, undefined, "exam");
}

export async function setExamStatus(f: FormData) {
  await admin();
  const supabase = await createClient();
  const id = str(f, "exam_id");
  const status = str(f, "status");
  const { error } = await supabase.from("exams").update({ status }).eq("id", id);
  // publishing results locks every mark so nothing changes after parents see it
  if (!error && status === "results") await supabase.from("marks").update({ locked: true }).eq("exam_id", id);
  back(`/principal/exams?term=${str(f, "term_id")}&exam=${id}`, error?.message, "status");
}

export async function addPaper(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const exam = str(f, "exam_id");
  const { error } = await supabase.from("exam_papers").upsert({
    campus_id: me.campus_id, exam_id: exam, class_id: str(f, "class_id"), subject_id: str(f, "subject_id"),
    paper_date: str(f, "paper_date"), starts_at: str(f, "starts_at") || null, ends_at: str(f, "ends_at") || null,
    invigilator_id: str(f, "invigilator_id") || null,
  }, { onConflict: "exam_id,class_id,subject_id" });
  back(`/principal/exams?term=${str(f, "term_id")}&exam=${exam}`, error?.message, "paper");
}

// ---------- Staff, leave and substitutes ----------
export async function decideLeave(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests")
    .update({ status: str(f, "status"), decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", str(f, "leave_id"));
  back("/principal/staff", error?.message, "leave");
}

export async function assignSubstitute(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("substitutions").upsert({
    campus_id: me.campus_id, date: str(f, "date"), timetable_slot_id: str(f, "slot_id"),
    absent_teacher_id: str(f, "absent_teacher_id") || null, substitute_id: str(f, "substitute_id") || null, created_by: me.id,
  }, { onConflict: "date,timetable_slot_id" });
  back("/principal/staff", error?.message, "sub");
}

export async function addStaff(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").insert({
    campus_id: me.campus_id, role: str(f, "role"), full_name: str(f, "full_name"),
    phone: str(f, "phone") || null, email: str(f, "email") || null,
  });
  back("/principal/staff", error?.message, "staff");
}

// ---------- Admissions (principal and front office) ----------
const channelChoice = (f: FormData) => (["whatsapp", "sms"].includes(str(f, "reminder_channel")) ? str(f, "reminder_channel") : "auto");

export async function addInquiry(f: FormData) {
  const me = await requireRole("principal", "owner", "accountant");
  const supabase = await createClient();
  const reminder = str(f, "reminder_phone");
  if (reminder && !mobilePK(reminder)) return back("/principal/admissions", "The reminder number is not a mobile number. Write it like 03001234567.");
  const { error } = await supabase.from("admissions").insert({
    campus_id: me.campus_id, child_name: str(f, "child_name"), guardian_name: str(f, "guardian_name"),
    phone: str(f, "phone"), applying_class_id: str(f, "class_id") || null, notes: str(f, "notes") || null,
    reminder_phone: reminder || null, reminder_channel: channelChoice(f),
  });
  back("/principal/admissions", error?.message, "inquiry");
}

export async function moveAdmission(f: FormData) {
  await requireRole("principal", "owner", "accountant");
  const supabase = await createClient();
  const { error } = await supabase.from("admissions")
    .update({ status: str(f, "status"), test_on: str(f, "test_on") || undefined })
    .eq("id", str(f, "admission_id"));
  back("/principal/admissions", error?.message, "moved");
}

// Admit: creates the family (or uses one with the same phone) and the student, then links the admission.
export async function admitStudent(f: FormData) {
  const me = await requireRole("principal", "owner", "accountant");
  const supabase = await createClient();
  const { data: a, error } = await supabase.from("admissions").select("*").eq("id", str(f, "admission_id")).single();
  if (error || !a) return back("/principal/admissions", error?.message ?? "Admission not found");
  let { data: fam } = await supabase.from("families").select("id").eq("phone", a.phone).maybeSingle();
  if (!fam) {
    const res = await supabase.from("families").insert({
      campus_id: me.campus_id, name: `${a.guardian_name} family`, phone: a.phone,
      reminder_phone: a.reminder_phone, reminder_channel: a.reminder_channel ?? "auto",
    }).select("id").single();
    if (res.error) return back("/principal/admissions", res.error.message);
    fam = res.data;
  } else if (a.reminder_phone || (a.reminder_channel && a.reminder_channel !== "auto")) {
    // a sibling's family is already here: the newest choice the parent gave wins
    await supabase.from("families").update({
      ...(a.reminder_phone ? { reminder_phone: a.reminder_phone } : {}),
      ...(a.reminder_channel !== "auto" ? { reminder_channel: a.reminder_channel } : {}),
    }).eq("id", fam.id);
  }
  const { data: stu, error: e2 } = await supabase.from("students").insert({
    campus_id: me.campus_id, family_id: fam.id, section_id: str(f, "section_id"), full_name: a.child_name,
    roll_no: str(f, "roll_no") || null,
  }).select("id").single();
  if (e2) return back("/principal/admissions", e2.message);
  const { error: e3 } = await supabase.from("admissions").update({ status: "admitted", student_id: stu.id }).eq("id", a.id);
  back("/principal/admissions", e3?.message, "admitted");
}

// ---------- Notices ----------
export async function createNotice(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const audience = str(f, "audience");
  const target = str(f, "target");
  const res = await publishNotice(supabase, me, {
    title: str(f, "title"), body: str(f, "body"), audience,
    classId: audience === "class" ? target || null : null,
    sectionId: audience === "section" ? target || null : null,
    toPhones: f.get("send_phone") === "on", kind: "notice",
  });
  back("/principal/notices", res.error ?? undefined, res.saved);
}

type Me = Awaited<ReturnType<typeof admin>>;
// Saves the notice for the app and, when asked, puts a WhatsApp or SMS for each family in the outbox.
async function publishNotice(supabase: Awaited<ReturnType<typeof createClient>>, me: Me, n: {
  title: string; body: string; audience: string; classId: string | null; sectionId: string | null; toPhones: boolean; kind: "notice" | "holiday";
}) {
  const { data: notice, error } = await supabase.from("notices").insert({
    campus_id: me.campus_id, title: n.title, body: n.body, audience: n.audience,
    class_id: n.classId, section_id: n.sectionId, created_by: me.id,
  }).select("id").single();
  if (error) return { error: error.message, saved: "" };
  if (!n.toPhones) return { error: null, saved: "notice" };
  const families = await familiesForAudience(supabase, n.audience, n.classId, n.sectionId);
  const q = await queueForFamilies(supabase, {
    campusId: me.campus_id, families, kind: n.kind, noticeId: notice.id,
    text: () => noticeText({ title: n.title, body: n.body, campus: me.campus_name }),
  });
  if (q.error) return { error: q.error, saved: "" };
  const d = await deliverQueued(supabase);
  return { error: null, saved: `phones-${q.queued}-${q.skipped}-${d.sent}-${d.failed}` };
}

export async function deleteNotice(f: FormData) {
  await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("notices").delete().eq("id", str(f, "notice_id"));
  back("/principal/notices", error?.message);
}

// ---------- Holiday calendar ----------
const HOLIDAY_KINDS = ["holiday", "vacation", "event"];

export async function addHoliday(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const title = str(f, "title");
  const starts = str(f, "starts_on");
  const ends = str(f, "ends_on") || starts;
  const month = `/principal/notices?month=${starts.slice(0, 7)}`;
  if (ends < starts) return back(month, "The last day can't be before the first day.");
  const { error } = await supabase.from("holidays").insert({
    campus_id: me.campus_id, title, starts_on: starts, ends_on: ends,
    kind: HOLIDAY_KINDS.includes(str(f, "kind")) ? str(f, "kind") : "holiday", note: str(f, "note") || null, created_by: me.id,
  });
  if (error) return back(month, error.message);
  if (f.get("announce") !== "on") return back(month, undefined, "holiday");
  const day = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const res = await publishNotice(supabase, me, {
    title: `Holiday: ${title}`,
    body: (starts === ends ? `School will stay closed on ${day(starts)}.` : `School will stay closed from ${day(starts)} to ${day(ends)}.`)
      + (str(f, "note") ? ` ${str(f, "note")}` : ""),
    audience: "everyone", classId: null, sectionId: null, toPhones: f.get("send_phone") === "on", kind: "holiday",
  });
  back(month, res.error ?? undefined, res.saved);
}

export async function deleteHoliday(f: FormData) {
  await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").delete().eq("id", str(f, "holiday_id"));
  back(`/principal/notices?month=${str(f, "month")}`, error?.message);
}

// Pakistan's public holidays that fall on the same date every year. Eid, Muharram and
// 12 Rabi-ul-Awwal follow the moon, so the principal adds them once the dates are announced.
const FIXED_HOLIDAYS: [string, string][] = [
  ["02-05", "Kashmir Solidarity Day"], ["03-23", "Pakistan Day"], ["05-01", "Labour Day"],
  ["05-28", "Youm-e-Takbeer"], ["08-14", "Independence Day"], ["11-09", "Iqbal Day"], ["12-25", "Quaid-e-Azam Day"],
];

export async function addPublicHolidays() {
  const me = await admin();
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const year = Number(today.slice(0, 4));
  // the next 12 months
  const dates = [year, year + 1].flatMap((y) => FIXED_HOLIDAYS.map(([md, t]) => [`${y}-${md}`, t] as const))
    .filter(([d]) => d >= today && d < `${year + 1}${today.slice(4)}`);
  const { data: have } = await supabase.from("holidays").select("starts_on").in("starts_on", dates.map(([d]) => d));
  const taken = new Set((have ?? []).map((h) => h.starts_on));
  const rows = dates.filter(([d]) => !taken.has(d))
    .map(([d, t]) => ({ campus_id: me.campus_id, title: t, starts_on: d, ends_on: d, kind: "holiday", created_by: me.id }));
  const { error } = rows.length ? await supabase.from("holidays").insert(rows) : { error: null };
  back("/principal/notices", error?.message, "public");
}

// ---------- Standard classes ----------
// Adds whichever of Class 1 to Class 10 the school doesn't have yet, each with section A.
export async function addStandardClasses(f: FormData) {
  const me = await admin();
  const path = str(f, "back") === "exams" ? "/principal/exams" : "/principal/classes";
  const supabase = await createClient();
  const { data: have } = await supabase.from("classes").select("name");
  const taken = new Set((have ?? []).map((c) => c.name.trim().toLowerCase()));
  const missing = Array.from({ length: 10 }, (_, i) => i + 1).filter((n) => !taken.has(`class ${n}`));
  if (!missing.length) return back(path, undefined, "classes");
  const { data: made, error } = await supabase.from("classes")
    .insert(missing.map((n) => ({ campus_id: me.campus_id, name: `Class ${n}`, sort: n, board: n >= 9 ? "BISE" : null })))
    .select("id");
  if (error) return back(path, error.message);
  const { error: e2 } = await supabase.from("sections").insert((made ?? []).map((c) => ({ campus_id: me.campus_id, class_id: c.id, name: "A", capacity: 40 })));
  back(path, e2?.message, "classes");
}
