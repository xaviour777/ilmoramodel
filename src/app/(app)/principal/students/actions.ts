"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { mobilePK } from "@/lib/messages";
import { BOARD_GROUPS, BOARD_ROW_COLS, boardMissing, cnic, missingForParent, type BoardRow } from "@/lib/board-form";
import { allRows, queueForFamilies, type FamilyContact } from "@/lib/outbox";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const office = () => requireRole("principal", "owner", "accountant");
const STATUSES = ["enrolled", "left", "struck_off"];
const CHANNELS = ["auto", "whatsapp", "sms"];

// Adds a student straight away (no inquiry), joining the family that has the same phone, or a new one.
export async function addStudent(f: FormData) {
  const me = await office();
  const supabase = await createClient();
  const phone = str(f, "phone");
  if (!mobilePK(phone)) redirect(`/principal/students?error=${encodeURIComponent("Write the parent's mobile like 03001234567.")}`);
  let { data: fam } = await supabase.from("families").select("id").eq("phone", phone).maybeSingle();
  if (!fam) {
    const res = await supabase.from("families").insert({
      campus_id: me.campus_id, name: `${str(f, "guardian_name") || str(f, "full_name")} family`, phone, address: str(f, "address") || null,
    }).select("id").single();
    if (res.error) redirect(`/principal/students?error=${encodeURIComponent(res.error.message)}`);
    fam = res.data;
  }
  const { data: stu, error } = await supabase.from("students").insert({
    campus_id: me.campus_id, family_id: fam!.id, section_id: str(f, "section_id") || null, full_name: str(f, "full_name"),
    roll_no: str(f, "roll_no") || null, admission_no: str(f, "admission_no") || null, gender: str(f, "gender") || null,
    date_of_birth: str(f, "date_of_birth") || null,
  }).select("id").single();
  if (error) redirect(`/principal/students?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/principal/students");
  redirect(`/principal/students/${stu!.id}?saved=added`);
}

export async function saveStudent(f: FormData) {
  await office();
  const supabase = await createClient();
  const id = str(f, "student_id");
  const back = `/principal/students/${id}`;
  const status = STATUSES.includes(str(f, "status")) ? str(f, "status") : "enrolled";
  const { error } = await supabase.from("students").update({
    full_name: str(f, "full_name"), roll_no: str(f, "roll_no") || null, admission_no: str(f, "admission_no") || null,
    gender: str(f, "gender") || null, date_of_birth: str(f, "date_of_birth") || null,
    section_id: str(f, "section_id") || null, status,
  }).eq("id", id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/principal/students");
  redirect(`${back}?saved=student`);
}

export async function saveFamily(f: FormData) {
  await office();
  const supabase = await createClient();
  const back = `/principal/students/${str(f, "student_id")}`;
  for (const k of ["phone", "reminder_phone"]) {
    if (str(f, k) && !mobilePK(str(f, k))) redirect(`${back}?error=${encodeURIComponent("Write mobile numbers like 03001234567.")}`);
  }
  const { error } = await supabase.from("families").update({
    name: str(f, "name"), phone: str(f, "phone") || null, address: str(f, "address") || null,
    reminder_phone: str(f, "reminder_phone") || null,
    reminder_channel: CHANNELS.includes(str(f, "reminder_channel")) ? str(f, "reminder_channel") : "auto",
  }).eq("id", str(f, "family_id"));
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/principal/students");
  redirect(`${back}?saved=family`);
}

// Everything the board form and the school record need beyond the basics.
export async function saveStudentDetails(f: FormData) {
  await office();
  const supabase = await createClient();
  const id = str(f, "student_id");
  const back = `/principal/students/${id}`;
  for (const k of ["father_cnic", "b_form"]) {
    if (str(f, k) && !cnic(str(f, k))) redirect(`${back}?error=${encodeURIComponent(`${k === "b_form" ? "B-form" : "Father's CNIC"} must have 13 digits, like 35202-1234567-1.`)}`);
  }
  const { error } = await supabase.from("students").update({
    father_name: str(f, "father_name") || null, father_cnic: cnic(str(f, "father_cnic")),
    mother_name: str(f, "mother_name") || null, guardian_occupation: str(f, "guardian_occupation") || null,
    b_form: cnic(str(f, "b_form")), religion: str(f, "religion") || null, nationality: str(f, "nationality") || "Pakistani",
    address: str(f, "address") || null, previous_school: str(f, "previous_school") || null,
    last_class_passed: str(f, "last_class_passed") || null, blood_group: str(f, "blood_group") || null,
    identification_mark: str(f, "identification_mark") || null, disability: str(f, "disability") || null,
    hafiz_quran: f.get("hafiz_quran") === "on",
    board_group: BOARD_GROUPS[str(f, "board_group")] ? str(f, "board_group") : null,
    board_reg_no: str(f, "board_reg_no") || null,
  }).eq("id", id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(back);
  redirect(`${back}?saved=details`);
}

// The office took a photo: kind is "student" or "staff".
export async function savePhoto(kind: string, id: string, url: string | null) {
  await office();
  const supabase = await createClient();
  const { error } = kind === "staff"
    ? await supabase.from("profiles").update({ avatar_url: url }).eq("id", id)
    : await supabase.from("students").update({ photo_url: url }).eq("id", id);
  return { error: error?.message ?? null };
}

// ---------- Board registration for a whole class ----------
const boardPage = (classId: string, q: string) => redirect(`/principal/students/board?class=${classId}&${q}`);

async function classForBoard(supabase: Awaited<ReturnType<typeof createClient>>, classId: string) {
  const { data: secs } = await supabase.from("sections").select("id").eq("class_id", classId);
  const ids = (secs ?? []).map((s) => s.id);
  if (!ids.length) return [];
  return allRows<BoardRow>((a, b) => supabase.from("students").select(BOARD_ROW_COLS)
    .in("section_id", ids).eq("status", "enrolled").order("full_name").order("id").range(a, b) as never);
}

// One WhatsApp/SMS to each family whose child's board form is incomplete, listing what to send.
export async function askParentsForMissing(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const classId = str(f, "class_id");
  const rows = await classForBoard(supabase, classId);
  const need = new Map<string, { fam: FamilyContact; lines: string[] }>();
  for (const r of rows) {
    const miss = boardMissing(r, r.families?.phone ?? null).filter((m) => m !== "mobile number");
    if (!miss.length || !r.families) continue;
    const entry = need.get(r.family_id) ?? {
      fam: { id: r.family_id, name: r.families.name, phone: r.families.phone, reminder_phone: r.families.reminder_phone, reminder_channel: r.families.reminder_channel as FamilyContact["reminder_channel"] },
      lines: [],
    };
    entry.lines.push(`${r.full_name}: ${missingForParent(miss)}`);
    need.set(r.family_id, entry);
  }
  if (!need.size) boardPage(classId, "saved=nothing");
  const res = await queueForFamilies(supabase, {
    campusId: me.campus_id, kind: "notice", families: [...need.values()].map((v) => v.fam),
    text: (fam) => `Assalam-o-Alaikum. Board registration ke liye ye cheezein school office mein jama karwa dein:\n${need.get(fam.id)!.lines.join("\n")}\n${me.campus_name}`,
  });
  if (res.error) boardPage(classId, `error=${encodeURIComponent(res.error)}`);
  revalidatePath("/principal/students/board");
  boardPage(classId, `asked=${res.queued}&skipped=${res.skipped}`);
}

// Board registration numbers back from the board: one line per student, "B-form or roll no, registration no".
export async function importRegNumbers(f: FormData) {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const classId = str(f, "class_id");
  const rows = await classForBoard(supabase, classId);
  const byKey = new Map<string, string>();
  for (const r of rows) {
    if (r.b_form) byKey.set(r.b_form.replace(/\D/g, ""), r.id);
    if (r.roll_no) byKey.set(`roll:${r.roll_no.trim().toLowerCase()}`, r.id);
  }
  let saved = 0;
  const unknown: string[] = [];
  for (const line of str(f, "lines").split(/\r?\n/)) {
    const [who, reg] = line.split(/[,\t;]/).map((x) => x.trim());
    if (!who || !reg) continue;
    const id = byKey.get(who.replace(/\D/g, "").length === 13 ? who.replace(/\D/g, "") : `roll:${who.toLowerCase()}`);
    if (!id) { unknown.push(who); continue; }
    const { error } = await supabase.from("students").update({ board_reg_no: reg }).eq("id", id);
    if (error) boardPage(classId, `error=${encodeURIComponent(error.message)}`);
    saved++;
  }
  revalidatePath("/principal/students/board");
  boardPage(classId, `imported=${saved}${unknown.length ? `&error=${encodeURIComponent(`Not found in this class: ${unknown.slice(0, 10).join(", ")}`)}` : ""}`);
}
