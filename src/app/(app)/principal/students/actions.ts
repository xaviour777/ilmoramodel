"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { mobilePK } from "@/lib/messages";

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
    b_form: str(f, "b_form") || null, gender: str(f, "gender") || null, date_of_birth: str(f, "date_of_birth") || null,
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
