// What the Punjab boards (BISE) ask for when a student is registered in Class 9.
// Each board's online form changes a little from year to year, so this is the common set;
// check the board's notice before submitting.

export const BOARD_GROUPS: Record<string, string> = {
  science_biology: "Science (Biology)",
  science_computer: "Science (Computer)",
  humanities: "Humanities (Arts)",
};

// "3520212345671" or "35202-1234567-1" -> "35202-1234567-1"; anything else -> null
export function cnic(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 13 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : null;
}

export type BoardStudent = {
  full_name: string; father_name: string | null; father_cnic: string | null; b_form: string | null;
  date_of_birth: string | null; gender: string | null; religion: string | null; nationality: string | null;
  address: string | null; photo_url: string | null; board_group: string | null;
};

// The fields still missing or wrong, in the words the office uses.
export function boardMissing(s: BoardStudent, phone: string | null) {
  const miss: string[] = [];
  if (!s.full_name?.trim()) miss.push("name");
  if (!s.father_name) miss.push("father's name");
  if (!s.father_cnic) miss.push("father's CNIC");
  else if (!cnic(s.father_cnic)) miss.push("father's CNIC (13 digits)");
  if (!s.b_form) miss.push("B-form");
  else if (!cnic(s.b_form)) miss.push("B-form (13 digits)");
  if (!s.date_of_birth) miss.push("date of birth");
  if (!s.gender) miss.push("gender");
  if (!s.religion) miss.push("religion");
  if (!s.nationality) miss.push("nationality");
  if (!phone) miss.push("mobile number");
  if (!s.address) miss.push("address");
  if (!s.photo_url) miss.push("photo");
  if (!s.board_group) miss.push("group");
  return miss;
}

export const BOARD_COLS = "id, full_name, roll_no, admission_no, father_name, father_cnic, mother_name, b_form, date_of_birth, gender, religion, nationality, address, photo_url, board_group, board_reg_no, hafiz_quran, disability, identification_mark, previous_school, families(phone)";
