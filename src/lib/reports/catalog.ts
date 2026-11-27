// Every report in the Report Center. The rows come from the database function report_rows(id, filters),
// run as the signed-in person, so row-level security decides what each person sees.
// A filter "retires" the columns it fixes: choose one section and the class and section columns go.

export type ColType = "text" | "int" | "money" | "pct" | "date" | "num";
export type Col = { k: string; l: string; t?: ColType };
export type FilterKey = "dates" | "day" | "month" | "class" | "section" | "status" | "gender" | "exam" | "van" | "route" | "category" | "days" | "min" | "top";
export type Report = {
  id: string; cat: string; name: string; desc: string;
  filters?: FilterKey[];
  dates?: "month" | "year" | "all";          // default period for "dates"
  status?: { label: string; options: [string, string][]; def?: string };
  cols: Col[];
  link?: string;                             // a card that opens another screen instead of a table
  sensitive?: boolean;                       // phones, CNICs: never sent to AI
};

export const CATEGORIES: [string, string][] = [
  ["students", "Students & Enrollment"], ["admissions", "Admissions"], ["attendance", "Attendance"],
  ["fees", "Fees & Collections"], ["finance", "Finance & Accounts"], ["payroll", "Payroll & HR"],
  ["exams", "Exams & Results"], ["timetable", "Timetable & Teaching"], ["transport", "Transport"],
  ["communication", "Communication"], ["discipline", "Discipline"], ["documents", "Documents & Certificates"],
];

// which filter retires which columns
export const RETIRES: Partial<Record<FilterKey, string[]>> = {
  class: ["class"], section: ["class", "section"], gender: ["gender"], status: ["status", "mode", "kind"],
  van: ["vehicle", "plate", "driver"], route: ["route"], category: ["category"], exam: ["exam"],
};

const STUDENT_STATUS: [string, string][] = [["enrolled", "Studying"], ["left", "Left"], ["struck_off", "Struck off"], ["passed_out", "Passed out"]];
const C = (k: string, l: string, t: ColType = "text"): Col => ({ k, l, t });
const cls = C("class", "Class"), sec = C("section", "Section"), gr = C("gr", "GR no"), name = C("name", "Name"), phone = C("phone", "Phone");

export const REPORTS: Report[] = [
  // ---------- Students & enrolment ----------
  { id: "student-roster", cat: "students", name: "Student directory", desc: "Full student list with class, father and contact.", filters: ["class", "section", "gender", "status"],
    status: { label: "Status", options: STUDENT_STATUS, def: "enrolled" }, sensitive: true,
    cols: [gr, name, C("father", "Father"), cls, sec, C("roll", "Roll"), C("gender", "Gender"), C("dob", "Born", "date"), phone, C("status", "Status"), C("admitted", "Admitted", "date")] },
  { id: "class-strength", cat: "students", name: "Class strength & capacity", desc: "Students per section with boys, girls and seats used.", filters: ["class"],
    cols: [cls, sec, C("boys", "Boys", "int"), C("girls", "Girls", "int"), C("total", "Total", "int"), C("capacity", "Seats", "int"), C("used", "Seats used", "pct")] },
  { id: "joiners-leavers", cat: "students", name: "Joiners & leavers", desc: "New admissions against students who left, by class.", filters: ["dates", "class"], dates: "year",
    cols: [cls, C("joined", "Joined", "int"), C("left_school", "Left", "int"), C("struck_off", "Struck off", "int"), C("passed_out", "Passed out", "int"), C("net", "Net", "int")] },
  { id: "sibling-families", cat: "students", name: "Sibling families", desc: "Families with two or more children studying here.", sensitive: true,
    cols: [C("family", "Family"), phone, C("children", "Children", "int"), C("names", "Names")] },
  { id: "incomplete-profiles", cat: "students", name: "Incomplete profiles", desc: "Studying students missing date of birth, B-form, father's name or phone.", filters: ["class", "section"], sensitive: true,
    cols: [gr, name, cls, sec, phone, C("missing", "Missing")] },
  { id: "student-withdrawn", cat: "students", name: "Left students", desc: "Withdrawn, struck off and passed out students with dates. History is never deleted.", filters: ["dates", "class", "status"], dates: "all",
    status: { label: "Status", options: STUDENT_STATUS.slice(1) }, sensitive: true,
    cols: [gr, name, C("father", "Father"), cls, sec, C("status", "Status"), C("admitted", "Admitted", "date"), C("left_on", "Left on", "date"), C("reason", "Reason"), phone] },
  { id: "age-distribution", cat: "students", name: "Age distribution", desc: "Studying students by age with boys and girls.", filters: ["class", "section"],
    cols: [C("age", "Age", "int"), C("boys", "Boys", "int"), C("girls", "Girls", "int"), C("total", "Total", "int")] },
  { id: "enrollment-by-session", cat: "students", name: "Enrollment by session", desc: "Admitted, left and on roll for each academic year.",
    cols: [C("session", "Session"), C("starts_on", "Starts", "date"), C("ends_on", "Ends", "date"), C("admitted", "Admitted", "int"), C("left_school", "Left", "int"), C("on_roll_at_end", "On roll at end", "int")] },
  { id: "promotion-retention", cat: "students", name: "Promotion & retention", desc: "Promoted, conditional, retained and passed out, per section.", filters: ["dates", "class"], dates: "year",
    cols: [cls, sec, C("promoted", "Promoted", "int"), C("conditional", "Conditional", "int"), C("retained", "Retained", "int"), C("passed_out", "Passed out", "int"), C("left_school", "Left", "int")] },
  { id: "student-churn", cat: "students", name: "Student churn by month", desc: "Joined, left and on roll for each month.", filters: ["dates"], dates: "year",
    cols: [C("month", "Month"), C("joined", "Joined", "int"), C("left_school", "Left", "int"), C("on_roll", "On roll", "int")] },
  { id: "new-admissions", cat: "students", name: "New admissions list", desc: "Students admitted in the period.", filters: ["dates", "class"], sensitive: true,
    cols: [C("admitted", "Admitted", "date"), gr, name, C("father", "Father"), cls, sec, C("gender", "Gender"), phone] },
  { id: "birthdays", cat: "students", name: "Birthdays this month", desc: "Students with a birthday in the month.", filters: ["month", "class", "section"], sensitive: true,
    cols: [C("birthday", "Birthday"), name, cls, sec, C("turns", "Turns", "int"), phone] },
  { id: "student-360", cat: "students", name: "Student 360 profile sheet", desc: "One student: identity, guardians, enrolment, fees, attendance, results, documents.", link: "/principal/students", cols: [] },

  // ---------- Admissions ----------
  { id: "admissions-pipeline", cat: "admissions", name: "Admissions pipeline", desc: "Inquiry, test, offer, admitted and declined, by class.", filters: ["dates"], dates: "year",
    cols: [cls, C("inquiry", "Inquiry", "int"), C("test", "Test", "int"), C("offered", "Offered", "int"), C("admitted", "Admitted", "int"), C("declined", "Declined", "int"), C("total", "Total", "int"), C("conversion", "Joined", "pct")] },
  { id: "admissions-list", cat: "admissions", name: "Admission inquiries", desc: "Every inquiry with guardian, class and stage.", filters: ["dates", "class", "status"], sensitive: true,
    status: { label: "Stage", options: [["inquiry", "Inquiry"], ["test", "Test"], ["offered", "Offered"], ["admitted", "Admitted"], ["declined", "Declined"]] },
    cols: [C("date", "Date", "date"), C("child", "Child"), C("guardian", "Guardian"), phone, cls, C("status", "Stage"), C("source", "Heard from"), C("test_on", "Test on", "date")] },
  { id: "admissions-by-source", cat: "admissions", name: "Where families heard of us", desc: "Inquiries and joins by source (Facebook, referral, banner…).", filters: ["dates"], dates: "year",
    cols: [C("source", "Source"), C("inquiries", "Inquiries", "int"), C("admitted", "Joined", "int"), C("conversion", "Rate", "pct")] },
  { id: "admission-tests", cat: "admissions", name: "Admission test schedule", desc: "Children booked for a test in the period.", filters: ["dates"], sensitive: true,
    cols: [C("test_on", "Test on", "date"), C("child", "Child"), C("guardian", "Guardian"), phone, cls, C("status", "Stage")] },
  { id: "admissions-followup", cat: "admissions", name: "Follow-up overdue", desc: "Inquiries still open after the chosen number of days.", filters: ["days"], sensitive: true,
    cols: [C("date", "Inquiry date", "date"), C("days_waiting", "Days waiting", "int"), C("child", "Child"), C("guardian", "Guardian"), phone, cls, C("status", "Stage"), C("notes", "Notes")] },

  // ---------- Attendance ----------
  { id: "att-daily-register", cat: "attendance", name: "Daily attendance register", desc: "One day: present, absent, late and leave per section, and who has not marked.", filters: ["day", "class"],
    cols: [cls, sec, C("on_roll", "On roll", "int"), C("present", "Present", "int"), C("absent", "Absent", "int"), C("late", "Late", "int"), C("on_leave", "Leave", "int"), C("rate", "Rate", "pct"), C("marked", "Marked")] },
  { id: "att-section-summary", cat: "attendance", name: "Attendance by section", desc: "Average attendance, absences and lates per section.", filters: ["dates", "class"],
    cols: [cls, sec, C("days", "Days", "int"), C("absences", "Absences", "int"), C("lates", "Lates", "int"), C("rate", "Average", "pct")] },
  { id: "att-student-percent", cat: "attendance", name: "Student attendance %", desc: "Each student's present, absent, late and leave days.", filters: ["dates", "class", "section"],
    cols: [gr, C("roll", "Roll"), name, cls, sec, C("present", "Present", "int"), C("absent", "Absent", "int"), C("late", "Late", "int"), C("on_leave", "Leave", "int"), C("rate", "Rate", "pct")] },
  { id: "att-chronic-absent", cat: "attendance", name: "Often absent", desc: "Students absent at least the chosen number of days.", filters: ["dates", "class", "section", "min"], sensitive: true,
    cols: [gr, name, cls, sec, phone, C("absent_days", "Days absent", "int"), C("last_absent", "Last absent", "date")] },
  { id: "att-not-marked", cat: "attendance", name: "Attendance not marked", desc: "School days where a section's register was left empty.", filters: ["dates", "class"],
    cols: [C("date", "Date", "date"), cls, sec, C("class_teacher", "Class teacher")] },
  { id: "att-late-comers", cat: "attendance", name: "Late comers", desc: "Students marked late, most first.", filters: ["dates", "class", "section"],
    cols: [gr, name, cls, sec, C("late_days", "Days late", "int"), C("last_late", "Last late", "date")] },
  { id: "att-monthly", cat: "attendance", name: "Monthly attendance trend", desc: "School-wide attendance rate month by month.", filters: ["dates", "class", "section"], dates: "year",
    cols: [C("month", "Month"), C("days", "School days", "int"), C("rate", "Rate", "pct"), C("absences", "Absences", "int")] },
  { id: "student-leave", cat: "attendance", name: "Student leave requests", desc: "Leave asked by parents, with the decision.", filters: ["dates", "class", "section"],
    cols: [C("from_on", "From", "date"), C("to_on", "To", "date"), name, cls, sec, C("reason", "Reason"), C("status", "Status")] },
  { id: "staff-attendance", cat: "attendance", name: "Staff attendance", desc: "Present, absent, late and leave for each staff member.", filters: ["dates"],
    cols: [name, C("role", "Role"), C("present", "Present", "int"), C("absent", "Absent", "int"), C("late", "Late", "int"), C("on_leave", "Leave", "int"), C("rate", "Rate", "pct")] },

  // ---------- Fees & collections ----------
  { id: "fee-collection-class", cat: "fees", name: "Collection by class", desc: "Billed against collected for each class.", filters: ["dates", "class"],
    cols: [cls, C("billed", "Billed", "money"), C("collected", "Collected", "money"), C("rate", "Rate", "pct")] },
  { id: "fee-defaulters", cat: "fees", name: "Defaulters", desc: "Families with fees due, biggest first, with last payment and last call.", filters: ["class", "min"], sensitive: true,
    cols: [C("family", "Family"), phone, C("children", "Children"), C("balance", "Due", "money"), C("last_paid", "Last paid", "date"), C("last_call", "Last call")] },
  { id: "fee-receipts", cat: "fees", name: "Receipts register", desc: "Every fee received, with receipt number and mode.", filters: ["dates", "status"],
    status: { label: "Mode", options: [["cash", "Cash"], ["jazzcash", "JazzCash"], ["easypaisa", "Easypaisa"]] },
    cols: [C("date", "Date", "date"), C("time", "Time"), C("receipt", "Receipt"), C("family", "Family"), C("mode", "Mode"), C("reference", "Reference"), C("amount", "Amount", "money"), C("received_by", "Received by")] },
  { id: "fee-by-mode", cat: "fees", name: "Collection by mode", desc: "Cash, JazzCash and Easypaisa totals.", filters: ["dates"],
    cols: [C("mode", "Mode"), C("receipts", "Receipts", "int"), C("amount", "Amount", "money")] },
  { id: "fee-by-head", cat: "fees", name: "Billing by fee head", desc: "Tuition, admission, exam and other heads billed.", filters: ["dates"],
    cols: [C("head", "Fee head"), C("lines", "Lines", "int"), C("billed", "Billed", "money")] },
  { id: "fee-cashier", cat: "fees", name: "Cashier collection", desc: "What each cashier received, cash and online.", filters: ["dates"],
    cols: [C("cashier", "Cashier"), C("receipts", "Receipts", "int"), C("cash", "Cash", "money"), C("online", "Online", "money"), C("amount", "Total", "money")] },
  { id: "fee-concessions", cat: "fees", name: "Concessions & reversals", desc: "Discounts given and entries reversed, with who did it.", filters: ["dates"],
    cols: [C("date", "Date", "date"), C("family", "Family"), C("kind", "Kind"), C("amount", "Amount", "money"), C("note", "Note"), C("by_whom", "By")] },
  { id: "fee-monthly", cat: "fees", name: "Monthly billed vs collected", desc: "Each month's bills against money received.", filters: ["dates"], dates: "year",
    cols: [C("month", "Month"), C("billed", "Billed", "money"), C("collected", "Collected", "money")] },
  { id: "fee-claims", cat: "fees", name: "Wallet payment claims", desc: "JazzCash / Easypaisa payments sent by parents for checking.", filters: ["dates", "status"],
    status: { label: "Status", options: [["pending", "Waiting"], ["confirmed", "Confirmed"], ["rejected", "Rejected"]] },
    cols: [C("paid_on", "Paid on", "date"), C("family", "Family"), C("mode", "Mode"), C("txn_id", "Transaction ID"), C("sender_phone", "Sender"), C("amount", "Amount", "money"), C("status", "Status"), C("reason", "Reason")] },
  { id: "fee-promises", cat: "fees", name: "Fee calls & promises", desc: "Calls to families and the dates they promised.", filters: ["dates"],
    cols: [C("called", "Called", "date"), C("family", "Family"), C("result", "Result"), C("promise_on", "Promised for", "date"), C("promised", "Promised", "money"), C("balance_now", "Due now", "money"), C("called_by", "By")] },

  // ---------- Finance ----------
  { id: "day-close", cat: "finance", name: "Day close", desc: "Each day's cash, wallets, count and difference.", filters: ["dates"],
    cols: [C("date", "Date", "date"), C("cashier", "Cashier"), C("cash_in", "Cash in", "money"), C("cash_out", "Cash out", "money"), C("jazzcash", "JazzCash", "money"), C("easypaisa", "Easypaisa", "money"), C("counted", "Counted", "money"), C("difference", "Difference", "money"), C("deposited", "Deposited", "money")] },
  { id: "cash-book", cat: "finance", name: "Cash book", desc: "Cash in, online in and cash out, day by day.", filters: ["dates"],
    cols: [C("date", "Date", "date"), C("cash_in", "Cash in", "money"), C("online_in", "Online in", "money"), C("cash_out", "Cash out", "money")] },
  { id: "expenses-list", cat: "finance", name: "Expense register", desc: "Every expense with voucher, category and payee.", filters: ["dates", "category"],
    cols: [C("date", "Date", "date"), C("voucher", "Voucher"), C("category", "Category"), C("paid_to", "Paid to"), C("mode", "Mode"), C("amount", "Amount", "money"), C("note", "Note")] },
  { id: "expenses-by-category", cat: "finance", name: "Expenses by category", desc: "Totals for each main category.", filters: ["dates"],
    cols: [C("category", "Category"), C("entries", "Entries", "int"), C("amount", "Amount", "money")] },
  { id: "income-expense", cat: "finance", name: "Income and costs (P&L)", desc: "Fees received minus salaries and expenses, month by month.", filters: ["dates"], dates: "year",
    cols: [C("month", "Month"), C("fees", "Fees received", "money"), C("salaries", "Salaries", "money"), C("expenses", "Expenses", "money"), C("net", "Net", "money")] },
  { id: "expenses-voided", cat: "finance", name: "Voided expenses", desc: "Expenses cancelled, with the reason and who did it.", filters: ["dates"],
    cols: [C("date", "Date", "date"), C("voucher", "Voucher"), C("category", "Category"), C("paid_to", "Paid to"), C("amount", "Amount", "money"), C("reason", "Reason"), C("voided_by", "Voided by")] },

  // ---------- Payroll & HR ----------
  { id: "staff-directory", cat: "payroll", name: "Staff directory", desc: "Every staff member with post, phone and salary.", filters: ["status"], sensitive: true,
    status: { label: "Role", options: [["teacher", "Teachers"], ["accountant", "Office"], ["principal", "Principal"], ["driver", "Drivers"]] },
    cols: [C("code", "Code"), name, C("role", "Role"), C("designation", "Post"), phone, C("cnic", "CNIC"), C("joining_date", "Joined", "date"), C("qualification", "Qualification"), C("salary", "Salary", "money")] },
  { id: "payroll-month", cat: "payroll", name: "Salary sheet", desc: "One month's salaries: basic, allowances, cuts and net.", filters: ["month"],
    cols: [C("code", "Code"), name, C("basic", "Basic", "money"), C("allowance", "Allowance", "money"), C("bonus", "Bonus", "money"), C("absent_days", "Absent", "int"), C("cuts", "Cuts", "money"), C("net", "Net", "money"), C("status", "Status"), C("pay_mode", "Paid by"), C("paid_on", "Paid on", "date")] },
  { id: "salary-advances", cat: "payroll", name: "Salary advances", desc: "Advances given and the monthly cut.", filters: ["dates"], dates: "year",
    cols: [C("given_on", "Given", "date"), name, C("amount", "Amount", "money"), C("monthly_cut", "Monthly cut", "money"), C("reason", "Reason")] },
  { id: "staff-leave", cat: "payroll", name: "Staff leave", desc: "Leave requests with days and decision.", filters: ["dates"],
    cols: [C("from_on", "From", "date"), C("to_on", "To", "date"), C("days", "Days", "int"), name, C("reason", "Reason"), C("status", "Status"), C("decided_by", "Decided by")] },
  { id: "substitutions", cat: "payroll", name: "Substitutions", desc: "Who covered which period for an absent teacher.", filters: ["dates"],
    cols: [C("date", "Date", "date"), C("absent_teacher", "Absent"), C("substitute", "Covered by"), C("section", "Class"), C("subject", "Subject"), C("period", "Period")] },

  // ---------- Exams & results ----------
  { id: "exam-section-results", cat: "exams", name: "Result by section", desc: "Average, pass rate and best score per section for one exam.", filters: ["exam", "class"],
    cols: [cls, sec, C("students", "Students", "int"), C("average", "Average", "pct"), C("pass_rate", "Pass rate", "pct"), C("best", "Best", "pct")] },
  { id: "exam-subject-average", cat: "exams", name: "Subject averages", desc: "Average and pass rate per subject for one exam.", filters: ["exam", "class", "section"],
    cols: [C("subject", "Subject"), C("papers", "Papers", "int"), C("average", "Average", "pct"), C("pass_rate", "Pass rate", "pct"), C("absent", "Absent", "int")] },
  { id: "exam-result-sheet", cat: "exams", name: "Result sheet", desc: "Each student's total, percentage and position.", filters: ["exam", "class", "section"],
    cols: [gr, C("roll", "Roll"), name, cls, sec, C("obtained", "Obtained", "num"), C("out_of", "Out of", "int"), C("percent", "%", "pct"), C("position", "Position", "int"), C("absent_papers", "Absent papers", "int")] },
  { id: "exam-toppers", cat: "exams", name: "Toppers", desc: "Highest scorers in one exam.", filters: ["exam", "class", "section", "top"],
    cols: [C("position", "Position", "int"), name, cls, sec, C("percent", "%", "pct")] },
  { id: "exam-failures", cat: "exams", name: "Failed subjects", desc: "Students below the pass mark, with subjects.", filters: ["exam", "class", "section"], sensitive: true,
    cols: [gr, name, cls, sec, phone, C("subjects_failed", "Subjects failed", "int"), C("failed_in", "Failed in")] },
  { id: "marks-entry-status", cat: "exams", name: "Marks entry status", desc: "Which teachers have entered marks for which section.", filters: ["exam", "class"],
    cols: [cls, sec, C("subject", "Subject"), C("teacher", "Teacher"), C("students", "Students", "int"), C("entered", "Entered", "int")] },
  { id: "board-results", cat: "exams", name: "Board results history", desc: "BISE results year by year.",
    cols: [C("year", "Year", "int"), C("class", "Class", "int"), C("appeared", "Appeared", "int"), C("passed", "Passed", "int"), C("pass_rate", "Pass rate", "pct"), C("a_plus", "A+", "int"), C("average", "Average", "num")] },

  // ---------- Timetable & teaching ----------
  { id: "teacher-load", cat: "timetable", name: "Teacher workload", desc: "Periods per week, sections and subjects for each teacher.",
    cols: [C("teacher", "Teacher"), C("periods_week", "Periods / week", "int"), C("sections", "Sections", "int"), C("subjects", "Subjects")] },
  { id: "timetable-coverage", cat: "timetable", name: "Timetable coverage", desc: "Periods set and periods without a teacher, per section.", filters: ["class"],
    cols: [cls, sec, C("periods_set", "Periods set", "int"), C("periods_needed", "Periods planned", "int"), C("no_teacher", "No teacher", "int")] },
  { id: "homework-given", cat: "timetable", name: "Homework given", desc: "Homework set per section and subject.", filters: ["dates", "class", "section"],
    cols: [cls, sec, C("subject", "Subject"), C("teacher", "Teacher"), C("homework", "Homework", "int"), C("last_given", "Last given", "date")] },

  // ---------- Transport ----------
  { id: "transport-routes", cat: "transport", name: "Routes", desc: "Each route with stops, vehicles, riders and fee.",
    cols: [C("route", "Route"), C("stops", "Stops", "int"), C("vehicles", "Vehicles"), C("students", "Students", "int"), C("fee", "Fee / month", "money")] },
  { id: "transport-students", cat: "transport", name: "Students on transport", desc: "Every rider with route, stop and vehicle.", filters: ["route", "van", "class"], sensitive: true,
    cols: [gr, name, cls, sec, C("route", "Route"), C("stop", "Stop"), C("vehicle", "Vehicle"), C("legs", "Trips"), phone] },
  { id: "vehicle-occupancy", cat: "transport", name: "Vehicle occupancy", desc: "Seats against riders for each vehicle.",
    cols: [C("vehicle", "Vehicle"), C("plate", "Plate"), C("route", "Route"), C("driver", "Driver"), C("seats", "Seats", "int"), C("riders", "Riders", "int"), C("used", "Used", "pct")] },
  { id: "trip-log", cat: "transport", name: "Trip log", desc: "Every trip with start, end, boarded, dropped and absent.", filters: ["dates", "van"],
    cols: [C("date", "Date", "date"), C("vehicle", "Vehicle"), C("leg", "Trip"), C("driver", "Driver"), C("started", "Started"), C("ended", "Ended"), C("boarded", "Boarded", "int"), C("dropped", "Dropped", "int"), C("absent", "Absent", "int"), C("status", "Status")] },
  { id: "custody-exceptions", cat: "transport", name: "Custody gaps", desc: "Children picked up with no drop recorded on a closed trip.", filters: ["dates"],
    cols: [C("date", "Date", "date"), C("vehicle", "Vehicle"), C("leg", "Trip"), C("student", "Student"), C("boarded_at", "Boarded at"), C("problem", "Problem")] },
  { id: "transport-costs", cat: "transport", name: "Vehicle running costs", desc: "Fuel, maintenance and repairs entered for each vehicle.", filters: ["dates", "van"],
    cols: [C("date", "Date", "date"), C("vehicle", "Vehicle"), C("kind", "Kind"), C("liters", "Litres", "num"), C("odometer", "Odometer", "int"), C("amount", "Amount", "money"), C("note", "Note")] },
  { id: "transport-cost-summary", cat: "transport", name: "Transport profit by vehicle", desc: "Van fee income against running costs.", filters: ["dates"],
    cols: [C("vehicle", "Vehicle"), C("fee_income", "Fee income", "money"), C("fuel", "Fuel", "money"), C("maintenance", "Maintenance", "money"), C("other", "Other", "money"), C("total_cost", "Total cost", "money")] },
  { id: "sos-log", cat: "transport", name: "SOS alerts", desc: "Every SOS from a driver, and who answered.", filters: ["dates"],
    cols: [C("date", "Date", "date"), C("time", "Time"), C("vehicle", "Vehicle"), C("driver", "Driver"), C("note", "Note"), C("status", "Status"), C("handled_by", "Answered by"), C("answered_at", "Answered at")] },
  { id: "vehicle-papers", cat: "transport", name: "Vehicle papers expiry", desc: "Fitness, insurance and route permit dates.",
    cols: [C("vehicle", "Vehicle"), C("plate", "Plate"), C("fitness", "Fitness", "date"), C("insurance", "Insurance", "date"), C("route_permit", "Route permit", "date"), C("days_left", "Days left", "int")] },

  // ---------- Communication ----------
  { id: "messages-sent", cat: "communication", name: "Messages sent", desc: "WhatsApp and SMS by kind, with failures.", filters: ["dates"],
    cols: [C("kind", "Kind"), C("channel", "Channel"), C("messages", "Messages", "int"), C("sent", "Sent", "int"), C("failed", "Failed", "int"), C("waiting", "Waiting", "int")] },
  { id: "message-failures", cat: "communication", name: "Failed messages", desc: "Messages that did not reach a family, with the error.", filters: ["dates"], sensitive: true,
    cols: [C("date", "Date", "date"), C("family", "Family"), phone, C("channel", "Channel"), C("kind", "Kind"), C("error", "Error")] },
  { id: "notices-sent", cat: "communication", name: "Notices", desc: "Notices sent and to whom.", filters: ["dates"],
    cols: [C("date", "Date", "date"), C("title", "Title"), C("audience", "For"), C("for_class", "Class"), C("by_whom", "By")] },
  { id: "feedback-log", cat: "communication", name: "Complaints & suggestions", desc: "Feedback by topic, status and days to reply.", filters: ["dates", "status"],
    status: { label: "Status", options: [["open", "Open"], ["in_progress", "In progress"], ["resolved", "Resolved"]] },
    cols: [C("date", "Date", "date"), C("kind", "Kind"), C("topic", "Topic"), C("status", "Status"), C("message", "Message"), C("days_to_reply", "Days to reply", "int")] },

  // ---------- Discipline ----------
  { id: "behaviour-notes", cat: "discipline", name: "Behaviour notes", desc: "Praise and concerns written by teachers.", filters: ["dates", "class", "section", "status"],
    status: { label: "Kind", options: [["praise", "Praise"], ["concern", "Concern"]] },
    cols: [C("date", "Date", "date"), name, cls, sec, C("kind", "Kind"), C("note", "Note"), C("teacher", "Teacher")] },
  { id: "behaviour-summary", cat: "discipline", name: "Behaviour by section", desc: "Praise and concerns counted per section.", filters: ["dates", "class"],
    cols: [cls, sec, C("praise", "Praise", "int"), C("concerns", "Concerns", "int"), C("students_with_concerns", "Students with concerns", "int")] },

  // ---------- Documents & certificates ----------
  { id: "documents-expiring", cat: "documents", name: "Documents expiring", desc: "Student documents expired or expiring within the chosen days.", filters: ["days"],
    cols: [gr, name, cls, sec, C("kind", "Document"), C("title", "Title"), C("number", "Number"), C("expires_on", "Expires", "date"), C("days_left", "Days left", "int")] },
  { id: "documents-missing", cat: "documents", name: "Documents missing", desc: "Studying students without B-form, birth certificate or guardian CNIC on file.", filters: ["class", "section"],
    cols: [gr, name, cls, sec, C("missing", "Missing")] },
  { id: "certificates-issued", cat: "documents", name: "Certificates issued", desc: "Every certificate printed, with its serial number.", filters: ["dates", "status"], dates: "year",
    status: { label: "Certificate", options: [["character", "Character"], ["leaving", "School leaving"], ["fee", "Fee clearance"], ["bonafide", "Bonafide"]] },
    cols: [C("issued_on", "Issued", "date"), C("serial", "Serial no"), C("kind", "Certificate"), gr, name, C("status", "Student status"), C("issued_by", "Issued by")] },
];

export const REPORT = new Map(REPORTS.map((r) => [r.id, r]));
