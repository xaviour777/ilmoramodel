"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { mobilePK } from "@/lib/messages";
import { DOC_KINDS } from "@/lib/student360";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const office = () => requireRole("principal", "owner", "accountant");
const back = (id: string, tab: string, q: Record<string, string> = {}): never =>
  redirect(`/principal/students/${id}?${new URLSearchParams({ tab, ...q })}`);


export async function addContact(f: FormData) {
  const me = await office();
  const id = str(f, "student_id");
  const phone = str(f, "phone");
  if (phone && !mobilePK(phone)) back(id, "contacts", { error: "Write the mobile like 03001234567." });
  const supabase = await createClient();
  const { error } = await supabase.from("student_contacts").insert({
    campus_id: me.campus_id, student_id: id, name: str(f, "name"), relation: str(f, "relation") || "guardian", phone: phone || null,
    cnic: str(f, "cnic") || null, is_emergency: f.get("is_emergency") === "on", can_pick_up: f.get("can_pick_up") === "on", note: str(f, "note") || null,
  });
  back(id, "contacts", error ? { error: error.message } : { saved: "contact" });
}

export async function deleteContact(f: FormData) {
  await office();
  const supabase = await createClient();
  await supabase.from("student_contacts").delete().eq("id", str(f, "id"));
  back(str(f, "student_id"), "contacts");
}

export async function addDocument(f: FormData) {
  const me = await office();
  const id = str(f, "student_id");
  const kind = DOC_KINDS[str(f, "kind")] ? str(f, "kind") : "other";
  const supabase = await createClient();
  let file_path: string | null = null;
  const file = f.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) back(id, "documents", { error: "The file is bigger than 5 MB." });
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) back(id, "documents", { error: "Upload a photo (JPG, PNG) or a PDF." });
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    file_path = `${me.campus_id}/${id}/${kind}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("student-docs").upload(file_path, file, { contentType: file.type });
    if (up.error) back(id, "documents", { error: up.error.message });
  }
  const { error } = await supabase.from("student_documents").insert({
    campus_id: me.campus_id, student_id: id, kind, title: str(f, "title") || null, number: str(f, "number") || null,
    issued_on: str(f, "issued_on") || null, expires_on: str(f, "expires_on") || null, file_path, verified: f.get("verified") === "on",
  });
  back(id, "documents", error ? { error: error.message } : { saved: "document" });
}

export async function deleteDocument(f: FormData) {
  await office();
  const supabase = await createClient();
  const { data } = await supabase.from("student_documents").delete().eq("id", str(f, "id")).select("file_path").maybeSingle();
  if (data?.file_path) await supabase.storage.from("student-docs").remove([data.file_path]);
  back(str(f, "student_id"), "documents");
}

export async function openDocument(f: FormData) {
  await office();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("student-docs").createSignedUrl(str(f, "path"), 120);
  if (!data?.signedUrl) back(str(f, "student_id"), "documents", { error: "Could not open the file." });
  redirect(data!.signedUrl);
}

export async function issueCertificate(f: FormData) {
  await office();
  const id = str(f, "student_id");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_certificate", { p_student: id, p_kind: str(f, "kind") });
  if (error || !data) back(id, "certificates", { error: error?.message ?? "Could not issue." });
  revalidatePath(`/principal/students/${id}`);
  redirect(`/print/certificate/${id}?cert=${(data as { id: string }).id}`);
}

// Leaving, struck off, passed out or back to studying. Nothing is deleted: the history stays.
export async function changeStatus(f: FormData) {
  await requireRole("principal", "owner");
  const id = str(f, "student_id");
  const kind = str(f, "kind");
  if (!["leave", "strike_off", "pass_out", "rejoin"].includes(kind)) back(id, "status");
  const reason = str(f, "reason");
  if (kind !== "rejoin" && !reason) back(id, "status", { error: "Write the reason." });
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_student_moves", {
    p_moves: [{ student_id: id, kind, ...(kind === "rejoin" && str(f, "section_id") ? { to_section_id: str(f, "section_id") } : {}) }],
    p_reason: reason || "Re-joined", p_note: str(f, "note") || null, p_effective: str(f, "effective_on") || null,
  });
  revalidatePath("/principal/students");
  back(id, error ? "status" : "history", error ? { error: error.message } : { saved: "status" });
}
