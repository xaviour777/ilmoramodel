// First-visit welcome video and step-by-step tour, per role.
// Replace GUIDE_VIDEO with the school's own YouTube guide (the id after watch?v=),
// or set NEXT_PUBLIC_GUIDE_VIDEO in Vercel. The default is a placeholder video.
export const GUIDE_VIDEO = process.env.NEXT_PUBLIC_GUIDE_VIDEO || "aqz-KE-bpKQ";

export type Step = { sel?: string; title: string; body: string };
type Role = "owner" | "principal" | "accountant" | "teacher" | "parent" | "student";

const P = (href: string) => `a[href="${href}"]`;

export const TOURS: Record<Role, Step[]> = {
  principal: [
    { title: "Welcome to your school", body: "A one-minute tour of the places you will use every day. You can open it again any time from the ? button." },
    { sel: P("/principal"), title: "Home", body: "Today at a glance: attendance, fees that came in, and anything that needs you." },
    { sel: P("/principal/attendance"), title: "Attendance", body: "See which classes have marked attendance and remind the teachers who have not." },
    { sel: P("/accounts"), title: "Fees", body: "Challans, payments by cash, JazzCash or Easypaisa, and families who still owe." },
    { sel: P("/principal/students"), title: "Students", body: "Every child's marks, attendance and fees. Sign-up requests from parents are approved here." },
    { sel: P("/principal/staff"), title: "Staff & pay", body: "Add teachers and press Create login to give them their sign-in." },
    { sel: P("/accounts/messages"), title: "Messages", body: "Fee reminders and WhatsApp to parents, all in one place." },
    { sel: P("/settings"), title: "Settings", body: "School details, AI, extra modules and your own password." },
    { sel: "[data-guide-help]", title: "Help is here", body: "Press ? to watch the video or take this tour again." },
  ],
  owner: [],
  accountant: [
    { title: "Welcome", body: "A quick tour of the fee desk." },
    { sel: P("/accounts"), title: "Fee desk", body: "Find a family, take a payment and print the receipt." },
    { sel: P("/accounts/messages"), title: "Messages", body: "Fee reminders, WhatsApp numbers and auto messages, all in one place." },
    { sel: P("/principal/admissions"), title: "Admissions", body: "New enquiries and admissions." },
    { sel: "[data-guide-help]", title: "Help is here", body: "Press ? to see this again." },
  ],
  teacher: [
    { title: "Welcome", body: "A quick tour of your day." },
    { sel: P("/teacher"), title: "Attendance", body: "Mark your class every morning. Parents of absent children get a message." },
    { sel: P("/teacher/homework"), title: "Homework", body: "Give homework; it reaches every parent's phone." },
    { sel: P("/teacher/marks"), title: "Marks", body: "Enter test and exam marks." },
    { sel: P("/teacher/plans"), title: "Lessons", body: "Weekly plans, the whole-year syllabus and today's lesson diary." },
    { sel: "[data-guide-help]", title: "Help is here", body: "Press ? to see this again." },
  ],
  parent: [
    { title: "Welcome", body: "See your child's school day on your phone." },
    { sel: P("/parent"), title: "My Child Today", body: "Attendance, homework and messages from school." },
    { sel: P("/parent/exams"), title: "Exams & report card", body: "Results and the report card." },
    { sel: P("/parent/tutor"), title: "Homework tutor", body: "Help with homework in easy Urdu." },
    { sel: "[data-guide-help]", title: "Help is here", body: "Press ? to see this again." },
  ],
  student: [
    { title: "Welcome", body: "Your learning space." },
    { sel: P("/student"), title: "My Learning Space", body: "Today's homework, tests and goals." },
    { sel: P("/student/tutor"), title: "Homework tutor", body: "Ask when you are stuck. It explains; it does not do the work for you." },
    { sel: P("/student/exams"), title: "My exams", body: "Date sheet and results." },
    { sel: "[data-guide-help]", title: "Help is here", body: "Press ? to see this again." },
  ],
};
TOURS.owner = TOURS.principal;
