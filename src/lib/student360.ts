// Labels for the student 360 profile.
export const DOC_KINDS: Record<string, string> = {
  b_form: "B-form", birth_certificate: "Birth certificate", guardian_cnic: "Guardian CNIC", photo: "Photo",
  previous_result: "Previous result card", leaving_certificate: "Previous school leaving certificate", medical: "Medical record", domicile: "Domicile", other: "Other",
};

export const STATUS_LABEL: Record<string, string> = { enrolled: "Studying", left: "Left the school", struck_off: "Struck off", passed_out: "Passed out" };

export const MOVE_LABEL: Record<string, string> = {
  promote: "Promoted", conditional: "Promoted on condition", detain: "Retained (repeats the class)", leave: "Left the school",
  move: "Moved section", pass_out: "Passed out", strike_off: "Struck off", rejoin: "Re-joined", status: "Status changed",
};

export const CERT_LABEL: Record<string, string> = { character: "Character", leaving: "School leaving", fee: "Fee clearance", bonafide: "Bonafide student" };
