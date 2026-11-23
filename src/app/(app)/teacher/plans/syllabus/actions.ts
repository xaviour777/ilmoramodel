"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { callAi } from "@/lib/ai";
import { todayPK } from "@/lib/format";
import { CHAPTERS_SCHEMA, cleanChapters, parseContents, periodDates, planLessons, teachingDays, type Chapter } from "@/lib/syllabus";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const staff = () => requireRole("teacher", "principal", "owner");
const page = (cls: string, subj: string) => `/teacher/plans/syllabus?cls=${cls}&subj=${subj}`;
const fail = (back: string, msg: string): never => redirect(`${back}&error=${encodeURIComponent(msg)}`);

// Asks the school's AI for the chapters and topics: from the book's own text, a photo of the
// contents page, or (with neither) from the Punjab textbook it knows.
async function aiChapters(supabase: SupabaseClient, a: { className: string; subject: string; title: string; text: string; image: string | null }) {
  const r = await callAi(supabase, {
    feature: "quiz",
    maxTokens: 6000,
    schema: CHAPTERS_SCHEMA as unknown as Record<string, unknown>,
    image: a.image,
    system: [
      `You list the chapters of a school textbook for ${a.className}, ${a.subject}, in Punjab, Pakistan (Punjab Curriculum and Textbook Board).`,
      "Give every chapter in order with n (its number), title, pages as \"start-end\" when known (else \"\"), and its main topics (the numbered headings, like \"3.2 Newton's second law\") with pages when known.",
      "Use only what the contents page or the text shows. When you are given neither, list the chapters of the current Punjab textbook for this class and subject as you know them.",
      "Keep titles short, in the book's own words and language. No made-up page numbers.",
    ].join("\n"),
    messages: [{ role: "user", text: a.text ? `Book: ${a.title}\n\nText from the book's first pages (contents):\n${a.text.slice(0, 24000)}` : a.image ? `Book: ${a.title}\nThe photo is the contents page.` : `Book: ${a.title}\nList its chapters and topics.` }],
  });
  if (!r.ok) return { chapters: [] as Chapter[], why: r.reason === "off" ? "AI is off (Settings → AI)." : r.reason === "budget" ? "Today's AI limit is used up." : (r.message ?? "The AI could not read the book.") };
  try { return { chapters: cleanChapters((JSON.parse(r.text) as { chapters: never[] }).chapters ?? []), why: "" }; }
  catch { return { chapters: [] as Chapter[], why: "The AI answer could not be read." }; }
}

// Periods the class has for this subject between two dates: timetable weekdays, minus Sundays,
// holidays and the class's exam days.
async function slotsFor(supabase: SupabaseClient, b: { class_id: string; subject_id: string; periods_per_week: number }, from: string, to: string) {
  const { data: secs } = await supabase.from("sections").select("id").eq("class_id", b.class_id);
  const ids = (secs ?? []).map((s) => s.id);
  const [{ data: tt }, { data: hol }, { data: papers }] = await Promise.all([
    ids.length ? supabase.from("timetable_slots").select("section_id, weekday").in("section_id", ids).eq("subject_id", b.subject_id) : Promise.resolve({ data: [] }),
    supabase.from("holidays").select("starts_on, ends_on, kind").lte("starts_on", to).gte("ends_on", from),
    supabase.from("exam_papers").select("paper_date").eq("class_id", b.class_id).gte("paper_date", from).lte("paper_date", to),
  ]);
  // the section with the most periods stands for the class
  const bySec = new Map<string, number[]>();
  for (const t of (tt ?? []) as { section_id: string; weekday: number }[]) bySec.set(t.section_id, [...(bySec.get(t.section_id) ?? []), t.weekday]);
  const days = teachingDays(b.periods_per_week, [...bySec.values()].sort((x, y) => y.length - x.length)[0] ?? []);
  const off = [
    ...((hol ?? []) as { starts_on: string; ends_on: string; kind: string }[]).filter((h) => h.kind !== "event"),
    ...((papers ?? []) as { paper_date: string }[]).map((p) => ({ starts_on: p.paper_date, ends_on: p.paper_date })),
  ];
  return periodDates(from, to, days, off);
}

async function writeLessons(supabase: SupabaseClient, book: { id: string; campus_id: string; class_id: string; subject_id: string }, rows: ReturnType<typeof planLessons>, keepDone: Map<string, { done_on: string; done_by: string | null }>) {
  const { error: delErr } = await supabase.from("syllabus_lessons").delete().eq("book_id", book.id);
  if (delErr) return delErr.message;
  const ins = rows.map((l) => {
    const d = keepDone.get(`${l.chapter_n}|${l.topic}`);
    return { ...l, campus_id: book.campus_id, book_id: book.id, class_id: book.class_id, subject_id: book.subject_id, done_on: d?.done_on ?? null, done_by: d?.done_by ?? null };
  });
  for (let i = 0; i < ins.length; i += 500) {
    const { error } = await supabase.from("syllabus_lessons").insert(ins.slice(i, i + 500));
    if (error) return error.message;
  }
  return "";
}

// Teacher gives the book; AI (or the typed list) gives the chapters; Ilmora plans every period.
export async function createSyllabus(f: FormData) {
  const me = await staff();
  const supabase = await createClient();
  const cls = str(f, "class_id"), subj = str(f, "subject_id");
  const back = page(cls, subj);
  const starts = str(f, "starts_on") || todayPK();
  const finish = str(f, "finish_by");
  if (!finish || finish <= starts) fail(back, "Pick a finish date after the start date.");
  const ppw = Math.max(1, Math.min(14, Math.floor(Number(str(f, "periods_per_week")) || 6)));
  const source = (["pdf", "photo", "typed", "ai"].includes(str(f, "source")) ? str(f, "source") : "ai") as "pdf" | "photo" | "typed" | "ai";
  const text = str(f, "text").slice(0, 40000);
  const image = str(f, "image").replace(/^data:image\/\w+;base64,/, "") || null;
  if (image && image.length > 2_000_000) fail(back, "The photo is too big. Take it again a little further away.");
  const [{ data: c }, { data: s }] = await Promise.all([
    supabase.from("classes").select("name").eq("id", cls).single(),
    supabase.from("subjects").select("name").eq("id", subj).single(),
  ]);
  if (!c || !s) fail(back, "Class or subject not found.");
  const title = str(f, "title") || `${s!.name} · ${c!.name}`;

  // typed lists are read in code; everything else goes to the AI, with the code reader as a fallback
  let chapters: Chapter[] = source === "typed" ? parseContents(text) : [];
  let why = "";
  if (!chapters.length) {
    const r = await aiChapters(supabase, { className: c!.name, subject: s!.name, title, text: source === "photo" ? "" : text, image: source === "photo" ? image : null });
    chapters = r.chapters; why = r.why;
  }
  if (!chapters.length && text) chapters = parseContents(text);
  if (!chapters.length) fail(back, `Could not find the chapters. ${why} Type the contents instead: one chapter per line, like "1 Force and motion (p 1-24)".`);

  const { data: book, error } = await supabase.from("syllabus_books").upsert({
    campus_id: me.campus_id, class_id: cls, subject_id: subj, title, source, starts_on: starts, finish_by: finish,
    periods_per_week: ppw, chapters, updated_at: new Date().toISOString(),
  }, { onConflict: "class_id,subject_id" }).select("id, campus_id, class_id, subject_id").single();
  if (error || !book) fail(back, error?.message ?? "Could not save the book.");
  const slots = await slotsFor(supabase, { class_id: cls, subject_id: subj, periods_per_week: ppw }, starts, finish);
  const msg = await writeLessons(supabase, book!, planLessons(chapters, slots), new Map());
  if (msg) fail(back, msg);
  revalidatePath("/teacher/plans/syllabus");
  redirect(`${back}&saved=planned`);
}

// Fix the chapter list by hand; done lessons stay done.
export async function saveChapters(f: FormData) {
  await staff();
  const supabase = await createClient();
  const { data: book } = await supabase.from("syllabus_books").select("*").eq("id", str(f, "book_id")).single();
  if (!book) redirect("/teacher/plans/syllabus?error=" + encodeURIComponent("Plan not found."));
  const back = page(book.class_id, book.subject_id);
  const chapters = parseContents(str(f, "contents"));
  if (!chapters.length) fail(back, "Write one chapter per line, like \"1 Force and motion (p 1-24)\".");
  const { data: done } = await supabase.from("syllabus_lessons").select("chapter_n, topic, done_on, done_by").eq("book_id", book.id).not("done_on", "is", null);
  const keep = new Map((done ?? []).map((d) => [`${d.chapter_n}|${d.topic}`, { done_on: d.done_on as string, done_by: d.done_by as string | null }]));
  const { error } = await supabase.from("syllabus_books").update({ chapters, updated_at: new Date().toISOString() }).eq("id", book.id);
  if (error) fail(back, error.message);
  const slots = await slotsFor(supabase, book, book.starts_on, book.finish_by);
  const msg = await writeLessons(supabase, book, planLessons(chapters, slots), keep);
  if (msg) fail(back, msg);
  revalidatePath("/teacher/plans/syllabus");
  redirect(`${back}&saved=chapters`);
}

// Spread what is left over the periods from today to the finish date (after falling behind, or a new holiday).
export async function replanFromToday(f: FormData) {
  await staff();
  const supabase = await createClient();
  const { data: book } = await supabase.from("syllabus_books").select("*").eq("id", str(f, "book_id")).single();
  if (!book) redirect("/teacher/plans/syllabus?error=" + encodeURIComponent("Plan not found."));
  const back = page(book.class_id, book.subject_id);
  const today = todayPK();
  const { data: left } = await supabase.from("syllabus_lessons").select("*").eq("book_id", book.id).is("done_on", null).order("sort");
  const slots = await slotsFor(supabase, book, today > book.starts_on ? today : book.starts_on, book.finish_by);
  if (!slots.length) fail(back, "No periods are left before the finish date. Move the finish date first.");
  const rows = left ?? [];
  const per = Math.min(slots.length, rows.length);
  const moved = rows.map((l, i) => ({ ...l, planned_on: slots[Math.min(slots.length - 1, Math.floor((i * per) / rows.length))] }));
  for (let i = 0; i < moved.length; i += 500) {
    const { error } = await supabase.from("syllabus_lessons").upsert(moved.slice(i, i + 500), { onConflict: "id" });
    if (error) fail(back, error.message);
  }
  revalidatePath("/teacher/plans/syllabus");
  redirect(`${back}&saved=replanned`);
}

export async function moveFinish(f: FormData) {
  await staff();
  const supabase = await createClient();
  const finish = str(f, "finish_by");
  const { data: book } = await supabase.from("syllabus_books").select("*").eq("id", str(f, "book_id")).single();
  if (!book) redirect("/teacher/plans/syllabus?error=" + encodeURIComponent("Plan not found."));
  const back = page(book.class_id, book.subject_id);
  if (!finish || finish <= book.starts_on) fail(back, "The finish date must be after the start.");
  const { error } = await supabase.from("syllabus_books").update({ finish_by: finish, updated_at: new Date().toISOString() }).eq("id", book.id);
  if (error) fail(back, error.message);
  f.set("book_id", book.id);
  return replanFromToday(f);
}

// Done: this lesson, or everything up to it ("we are here").
export async function markLessons(f: FormData) {
  const me = await staff();
  const supabase = await createClient();
  const back = page(str(f, "class_id"), str(f, "subject_id"));
  const undo = str(f, "undo") === "1";
  let q = supabase.from("syllabus_lessons").update(undo ? { done_on: null, done_by: null } : { done_on: todayPK(), done_by: me.id }).eq("book_id", str(f, "book_id"));
  q = str(f, "upto") === "1" ? q.lte("sort", Number(str(f, "sort"))).is("done_on", null) : q.eq("id", str(f, "lesson_id"));
  const { error } = await q;
  if (error) fail(back, error.message);
  revalidatePath("/teacher/plans/syllabus");
  redirect(`${back}&saved=${undo ? "undone" : "done"}#week`);
}

export async function deleteSyllabus(f: FormData) {
  await staff();
  const supabase = await createClient();
  const { error } = await supabase.from("syllabus_books").delete().eq("id", str(f, "book_id"));
  const back = page(str(f, "class_id"), str(f, "subject_id"));
  if (error) fail(back, error.message);
  revalidatePath("/teacher/plans/syllabus");
  redirect(`${back}&saved=deleted`);
}
