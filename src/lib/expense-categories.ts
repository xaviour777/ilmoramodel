// Ready-made expense groups for a school or college in Pakistan. The office can add its own
// groups and sub-categories, rename them, or hide the ones it doesn't use.
export const STANDARD_EXPENSE_CATEGORIES: [string, string[]][] = [
  ["Building and rent", ["Rent", "Repairs and maintenance", "Construction and renovation", "Cleaning and sanitation", "Security guard"]],
  ["Utilities", ["Electricity", "Gas", "Water", "Internet and phone", "Generator fuel and UPS"]],
  ["Academic", ["Books and stationery", "Science lab material", "Computer lab", "Library books", "Exam papers and printing", "Sports equipment"]],
  ["Board and government fees", ["Board registration and exam fees", "Affiliation and licence", "PEF / government fees", "Taxes"]],
  ["Staff (other than salary)", ["Staff training", "Staff welfare and Eid", "Uniforms for staff", "Overtime and extra duty"]],
  ["Transport", ["Vehicle fuel", "Vehicle maintenance", "Driver and helper", "Vehicle token and insurance"]],
  ["Events and functions", ["Annual day and prize distribution", "Parent-teacher meeting", "Trips and tours", "Independence Day and national days"]],
  ["Admissions and marketing", ["Banners and flex", "Social media ads", "Newspaper and radio ads", "Brochures and prospectus"]],
  ["Office and admin", ["Printing and photocopy", "Office supplies", "Bank charges", "Courier and postage", "Software and subscriptions"]],
  ["Furniture and equipment", ["Furniture", "Computers and IT", "CCTV and security", "Fans, AC and electrical", "Water cooler and filters"]],
  ["Hospitality", ["Tea and guests", "Meetings and meals"]],
  ["Other", ["Charity and donations", "Miscellaneous"]],
];

export const EXPENSE_MODES: Record<string, string> = { cash: "Cash", bank: "Bank", jazzcash: "JazzCash", easypaisa: "Easypaisa", cheque: "Cheque" };

export const CALL_RESULT: Record<string, string> = {
  promised: "Promised to pay", no_answer: "No answer", call_later: "Call later", refused: "Refused",
  wrong_number: "Wrong number", paid_already: "Says already paid",
};

// The day in Pakistan as a timestamp range, for payments stored in UTC.
export const pkDayRange = (date: string) => {
  const next = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  return [`${date}T00:00:00+05:00`, `${next}T00:00:00+05:00`] as const;
};
