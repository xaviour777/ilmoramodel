import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { BOARD_COLS, BOARD_GROUPS, boardMissing, type BoardStudent } from "@/lib/board-form";

type Row = BoardStudent & { roll_no: string | null; admission_no: string | null; mother_name: string | null; hafiz_quran: boolean; disability: string | null; identification_mark: string | null; previous_school: string | null; families: { phone: string | null } | null };

// The board list as a CSV that opens in Excel, to copy into the board's portal.
export async function GET(req: Request) {
  await requireRole("principal", "owner", "accountant");
  const section = new URL(req.url).searchParams.get("section") ?? "";
  const supabase = await createClient();
  const { data } = await supabase.from("students").select(BOARD_COLS).eq("section_id", section).eq("status", "enrolled").order("roll_no").order("full_name");
  const head = ["Roll no", "Admission no", "Name", "Father name", "Father CNIC", "Mother name", "B-form", "Date of birth", "Gender", "Religion", "Nationality", "Group", "Hafiz-e-Quran", "Disability", "Identification mark", "Mobile", "Address", "Previous school", "Photo", "Missing"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ((data ?? []) as unknown as Row[]).map((r) => [
    r.roll_no, r.admission_no, r.full_name, r.father_name, r.father_cnic, r.mother_name, r.b_form, r.date_of_birth,
    r.gender === "male" ? "Male" : r.gender === "female" ? "Female" : "", r.religion, r.nationality,
    r.board_group ? BOARD_GROUPS[r.board_group] : "", r.hafiz_quran ? "Yes" : "No", r.disability, r.identification_mark,
    r.families?.phone, r.address, r.previous_school, r.photo_url, boardMissing(r, r.families?.phone ?? null).join("; "),
  ].map(esc).join(","));
  // the BOM makes Excel read Urdu names and symbols correctly
  return new Response("﻿" + [head.map(esc).join(","), ...lines].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="board-list.csv"` },
  });
}
