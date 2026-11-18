import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { pct, shortDate, time, todayPK } from "@/lib/format";
import { Stats, Stat, Empty, Row, Chips, Bar } from "@/components/ilm";
import { saveBoardResult, saveBoardTarget, setInvigilator } from "./actions";

const sm = { minHeight: 36, padding: "0 12px", fontSize: 12 } as const;
type Paper = { id: string; exam_id: string; class_id: string; subject_id: string; paper_date: string; starts_at: string | null; ends_at: string | null; invigilator_id: string | null; classes: { name: string }; subjects: { name: string }; exams: { name: string } };

// ================= Exam day =================
export async function ExamDayTab({ date, roomId }: { date?: string; roomId?: string }) {
  const supabase = await createClient();
  const today = todayPK();
  const { data: upcoming } = await supabase.from("exam_papers").select("paper_date").gte("paper_date", today).order("paper_date").limit(60);
  const { data: recent } = await supabase.from("exam_papers").select("paper_date").lt("paper_date", today).order("paper_date", { ascending: false }).limit(10);
  const dates = [...new Set([...(recent ?? []).map((x) => x.paper_date).reverse(), ...(upcoming ?? []).map((x) => x.paper_date)])];
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : (upcoming ?? [])[0]?.paper_date ?? (recent ?? [])[0]?.paper_date;
  if (!day) return <Empty>No papers on any date sheet yet. Add papers on the Plan tab, then this page plans the day.</Empty>;
  const [{ data: papers }, { data: rooms }, { data: staff }, { data: teach }, { data: leave }, { data: sections }] = await Promise.all([
    supabase.from("exam_papers").select("id, exam_id, class_id, subject_id, paper_date, starts_at, ends_at, invigilator_id, classes(name), subjects(name), exams(name)").eq("paper_date", day).order("starts_at"),
    supabase.from("rooms").select("id, name, capacity, kind").order("name"),
    supabase.from("profiles").select("id, full_name").in("role", ["teacher", "principal"]).eq("is_active", true).order("full_name"),
    supabase.from("section_subjects").select("section_id, subject_id, teacher_id, sections(class_id)"),
    supabase.from("leave_requests").select("profile_id").eq("status", "approved").lte("from_on", day).gte("to_on", day),
    supabase.from("sections").select("id, class_id"),
  ]);
  const P = (papers ?? []) as unknown as Paper[];
  const classIds = [...new Set(P.map((p) => p.class_id))];
  const secIds = (sections ?? []).filter((s) => classIds.includes(s.class_id)).map((s) => s.id);
  const kids = secIds.length ? await fetchAll<{ id: string; full_name: string; roll_no: string | null; admission_no: string | null; section_id: string; family_id: string | null }>((f, t) =>
    supabase.from("students").select("id, full_name, roll_no, admission_no, section_id, family_id").eq("status", "enrolled").in("section_id", secIds).order("roll_no").order("id").range(f, t) as unknown as PromiseLike<{ data: { id: string; full_name: string; roll_no: string | null; admission_no: string | null; section_id: string; family_id: string | null }[] | null; error: unknown }>) : [];
  const [{ data: absent }, { data: owing }] = await Promise.all([
    kids.length ? supabase.from("attendance").select("student_id").eq("date", day).eq("status", "absent").in("section_id", secIds) : Promise.resolve({ data: [] }),
    supabase.from("family_balances").select("family_id").gt("balance_paisa", 0),
  ]);
  const classOf = new Map((sections ?? []).map((s) => [s.id, s.class_id]));
  const absentSet = new Set((absent ?? []).map((a) => a.student_id));
  const owe = new Set((owing ?? []).map((o) => o.family_id));
  const blocked = kids.filter((k) => k.family_id && owe.has(k.family_id)).length;
  const leaveSet = new Set((leave ?? []).map((l) => l.profile_id));
  const teachesPaper = (tid: string, p: Paper) => ((teach ?? []) as unknown as { subject_id: string; teacher_id: string | null; sections: { class_id: string } | null }[])
    .some((t) => t.teacher_id === tid && t.subject_id === p.subject_id && t.sections?.class_id === p.class_id);
  const name = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  // seating: two classes alternate seat by seat, so neighbours never have the same paper
  const halls = (rooms ?? []).filter((r) => r.kind !== "other" && r.capacity);
  const hall = halls.find((r) => r.id === roomId) ?? halls[0];
  const byClass = classIds.map((c) => kids.filter((k) => classOf.get(k.section_id) === c));
  const seats: { label: string; cls: number; absent: boolean }[] = [];
  if (hall) {
    const queues = byClass.map((q) => [...q]);
    for (let i = 0; seats.length < hall.capacity! && queues.some((q) => q.length); i++) {
      const q = queues[i % queues.length]; const k = q.shift();
      if (k) seats.push({ label: k.roll_no ? `${k.roll_no}` : k.admission_no ?? "", cls: i % queues.length, absent: absentSet.has(k.id) });
    }
  }
  const COL = ["#e0f2fe", "#fce7f3", "#dcfce7", "#ede9fe", "#ffedd5"];
  const exams = [...new Map(P.map((p) => [p.exam_id, p.exams.name])).entries()];
  const back = `/principal/exams?tab=day&date=${day}`;
  const started = P.filter((p) => p.starts_at && (day < today || (day === today && p.starts_at.slice(0, 5) <= new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date())))).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Chips label="Exam date" current={day} items={dates.slice(0, 12).map((d) => ({ id: d, label: d === today ? "Today" : shortDate(d), href: `/principal/exams?tab=day&date=${d}` }))} />
      </div>
      <Stats>
        <Stat label="Papers" value={P.length} sub={`${exams.map(([, n]) => n).join(", ")} · ${shortDate(day)}`} />
        <Stat label="Students sitting" value={kids.length.toLocaleString("en-IN")} sub={absent?.length ? `${absent.length} absent so far` : day > today ? "not started" : "no absences marked"} />
        <Stat label="Halls" value={halls.length} sub={halls.length ? `${halls.reduce((t, h) => t + (h.capacity ?? 0), 0)} seats` : "add rooms in Classes"} />
        <Stat label="Admit cards held" value={blocked} sub="families with unpaid fees · you can allow" warn={blocked > 0} />
      </Stats>
      <section className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">Seating plan{hall ? ` · ${hall.name}` : ""}</h2>
              {halls.length > 1 && <Chips label="Hall" current={hall?.id ?? ""} items={halls.map((h) => ({ id: h.id, label: `${h.name} (${h.capacity})`, href: `${back}&room=${h.id}` }))} />}
            </div>
            {!hall ? <div className="mt-2"><Empty>No rooms with seats yet. Add rooms in Classes → Classrooms.</Empty></div> : byClass.length < 2 ? (
              <p className="muted mt-2 text-[13px]">Only one class sits a paper this day, so there is nothing to mix. Seats follow roll numbers.</p>
            ) : <p className="muted mt-1 text-[13px]">{byClass.length} classes sit alternately, so no two neighbours have the same paper.</p>}
            {hall && seats.length > 0 && (
              <>
                <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}>
                  {seats.map((st, i) => <div key={i} className="rounded-[8px] py-2 text-center text-[11px] font-black" style={{ background: st.absent ? "#fee2e2" : COL[st.cls % COL.length], color: st.absent ? "#b91c1c" : "#1f2937" }}>{st.absent ? "Absent" : st.label}</div>)}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[12px] font-extrabold">{classIds.map((c, i) => <span key={c} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: COL[i % COL.length] }} />{P.find((p) => p.class_id === c)?.classes.name}</span>)}<span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#fee2e2]" />Absent</span></div>
                {kids.length > hall.capacity! && <p className="muted mt-1 text-[12px]">{kids.length - hall.capacity!} more students need another hall.</p>}
              </>
            )}
          </div>
          <div className="card">
            <h2 className="h2">Invigilators</h2>
            {P.map((p) => {
              const inv = p.invigilator_id;
              const bad = inv && teachesPaper(inv, p) ? ["Teaches this paper", "r"] : inv && leaveSet.has(inv) ? ["On leave · needs cover", "y"] : inv ? ["OK", "g"] : ["None", "r"];
              return (
                <form key={p.id} action={setInvigilator}><Row>
                  <input type="hidden" name="paper_id" value={p.id} /><input type="hidden" name="back" value={back} />
                  <span className="min-w-[180px] flex-1 font-bold">{p.subjects.name} · {p.classes.name}<span className="muted block text-[12px]">{time(p.starts_at)}{p.ends_at ? `–${time(p.ends_at)}` : ""}</span></span>
                  <select className="input w-48" style={{ minHeight: 36 }} name="invigilator_id" defaultValue={inv ?? ""} aria-label="Invigilator">
                    <option value="">Choose</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}{leaveSet.has(s.id) ? " (on leave)" : teachesPaper(s.id, p) ? " (teaches it)" : ""}</option>)}
                  </select>
                  <span className={`tagx ${bad[1]}`}>{bad[0]}</span>
                  <button className="btn-ghost" style={sm} type="submit">{bad[1] === "g" ? "Save" : "Swap"}</button>
                </Row></form>
              );
            })}
            <p className="muted mt-1 text-[12px]">Teachers of the subject in that class, or on approved leave that day, are flagged.{[...new Set(P.map((p) => p.invigilator_id).filter(Boolean))].length ? ` ${[...new Set(P.map((p) => p.invigilator_id).filter(Boolean))].map((id) => name.get(id!)).join(", ")} on duty.` : ""}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
          <div className="card">
            <h2 className="h2">Print</h2>
            <p className="muted text-[13px]">For {exams.map(([, n]) => n).join(", ")}. Admit cards are held for families with unpaid fees unless you allow them.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {exams.flatMap(([id]) => [["admit", "Admit cards"], ["slips", "Roll number slips"], ["attendance", "Attendance sheets"], ["labels", "Answer sheet labels"]].map(([t, l]) => (
                <Link key={id + t} href={`/print/exam-day?exam=${id}&type=${t}&date=${day}`} target="_blank" className="btn-ghost" style={sm}>{l}</Link>
              )))}
              {exams.map(([id]) => <Link key={id + "all"} href={`/print/exam-day?exam=${id}&type=admit&date=${day}&allow=1`} target="_blank" className="btn-ghost col-span-2" style={sm}>Admit cards for everyone</Link>)}
            </div>
          </div>
          <div className="card">
            <h2 className="h2">Live {day === today ? "today" : shortDate(day)}</h2>
            <Row><span className="flex-1 font-bold">Papers started</span><span className={`tagx ${started === P.length ? "g" : "y"}`}>{started} of {P.length}</span></Row>
            <Row><span className="flex-1 font-bold">Absent students</span><span className="font-black">{absent?.length ?? 0}</span></Row>
            <Row><span className="flex-1 font-bold">Invigilator problems</span><span className={`tagx ${P.some((p) => !p.invigilator_id || teachesPaper(p.invigilator_id, p) || leaveSet.has(p.invigilator_id)) ? "r" : "g"}`}>{P.filter((p) => !p.invigilator_id || teachesPaper(p.invigilator_id, p) || leaveSet.has(p.invigilator_id)).length || "None"}</span></Row>
            <p className="muted mt-1 text-[12px]">Absences come from the day&apos;s attendance.</p>
          </div>
        </div>
      </section>
    </>
  );
}

// ================= Gaps and checks =================
export async function ExamGapsTab() {
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: year }, { data: classes }, { data: exams }, { data: unreviewed }, { data: settings }, { data: history }] = await Promise.all([
    supabase.from("academic_sessions").select("starts_on, ends_on").eq("is_current", true).maybeSingle(),
    supabase.from("classes").select("id, name, sort, level").order("sort"),
    supabase.from("exams").select("id, name, kind, status, starts_on, ends_on, total_marks, terms!inner(academic_sessions!inner(is_current)), exam_sections(section_id)").eq("terms.academic_sessions.is_current", true),
    supabase.from("paper_tests").select("id", { count: "exact" }).eq("status", "submitted"),
    supabase.from("campus_settings").select("whatsapp_template_lang, board_target").maybeSingle(),
    supabase.from("board_results").select("year, class_level, appeared, passed, a_plus, average").order("year"),
  ]);
  const board = (classes ?? []).filter((c) => c.sort === 9 || c.sort === 10);
  const boardIds = board.map((c) => c.id);
  const [{ data: boardSecs }, { data: papers }] = await Promise.all([
    boardIds.length ? supabase.from("sections").select("id, class_id").in("class_id", boardIds) : Promise.resolve({ data: [] as { id: string; class_id: string }[] }),
    supabase.from("exam_papers").select("subject_id, class_id, paper_date, subjects(name)").gte("paper_date", year?.starts_on ?? "1900-01-01"),
  ]);
  const { data: boardKids } = (boardSecs ?? []).length ? await supabase.from("students").select("id, board_reg_no, section_id").eq("status", "enrolled").in("section_id", (boardSecs ?? []).map((s) => s.id)) : { data: [] };
  const ex = exams ?? [];
  const gaps: { t: string; d: string; sev: "High" | "Medium" | "Low"; fix: string; href: string }[] = [];
  const practical = ((papers ?? []) as unknown as { subjects: { name: string } | null; class_id: string }[]).filter((p) => /practical/i.test(p.subjects?.name ?? ""));
  if (board.length && !practical.length) gaps.push({ t: "Practical exams not scheduled", d: "Class 9 and 10 practicals (Physics, Chemistry, Biology, Computer) carry marks in the board result. None are on a date sheet.", sev: "High", fix: "Book practicals", href: "/principal/exams?tab=plan#create" });
  const mocks = ex.filter((e) => e.kind === "sendup").length;
  if (board.length && mocks < 1) gaps.push({ t: "No mock exam in board pattern this session", d: "There is no send-up exam yet. Students do best after timed board-pattern mocks.", sev: "High", fix: "Plan a mock", href: "/principal/exams?tab=plan#create" });
  const unreg = (boardKids ?? []).filter((k) => !k.board_reg_no).length;
  if (unreg) gaps.push({ t: `${unreg} board student${unreg === 1 ? "" : "s"} not registered with BISE`, d: "Class 9–10 students with no board registration number on record.", sev: "High", fix: "Open list", href: "/principal/students/board" });
  const late = ex.filter((e) => e.status === "marks_entry" && e.ends_on && e.ends_on < today);
  if (late.length) gaps.push({ t: `Marks entry late for ${late.length} exam${late.length === 1 ? "" : "s"}`, d: `${late.map((e) => e.name).join(", ")} ended but results aren't published.`, sev: "Medium", fix: "Open marks entry", href: `/principal/exams?tab=plan&exam=${late[0].id}` });
  // marking differences: same exam and subject, sections differ by 10+ points
  const published = ex.filter((e) => e.status === "results").map((e) => e.id);
  if (published.length) {
    const marks = await fetchAll<{ exam_id: string; subject_id: string; obtained: number; students: { section_id: string } }>((f, t) => supabase.from("marks").select("exam_id, subject_id, obtained, students!inner(section_id)").in("exam_id", published).eq("is_absent", false).not("obtained", "is", null).order("id").range(f, t) as unknown as PromiseLike<{ data: { exam_id: string; subject_id: string; obtained: number; students: { section_id: string } }[] | null; error: unknown }>);
    const tot = new Map(ex.map((e) => [e.id, e.total_marks || 100]));
    const by = new Map<string, Map<string, number[]>>();
    for (const m of marks) { const k = `${m.exam_id}|${m.subject_id}`; const s = by.get(k) ?? new Map(); s.set(m.students.section_id, [...(s.get(m.students.section_id) ?? []), Number(m.obtained) / (tot.get(m.exam_id) ?? 100)]); by.set(k, s); }
    let diff = 0;
    for (const s of by.values()) { const avgs = [...s.values()].filter((v) => v.length >= 5).map((v) => v.reduce((a, b) => a + b, 0) / v.length); if (avgs.length > 1 && Math.max(...avgs) - Math.min(...avgs) >= 0.1) diff++; }
    if (diff) gaps.push({ t: `Marking differs between sections in ${diff} paper${diff === 1 ? "" : "s"}`, d: "Sections of the same class differ by 10+ points on the same paper. Worth a second check (moderation).", sev: "Medium", fix: "See results", href: "/principal/exams?tab=results&view=class" });
    const latest = published.at(-1)!;
    const failers = new Set(marks.filter((m) => m.exam_id === latest && Number(m.obtained) / (tot.get(latest) ?? 100) < 0.33).map((m) => `${m.students.section_id}`)).size;
    const failedStudents = marks.filter((m) => m.exam_id === latest && Number(m.obtained) / (tot.get(latest) ?? 100) < 0.33).length;
    if (failedStudents && !ex.some((e) => /retake|supple/i.test(e.name))) gaps.push({ t: "No retake for failed papers", d: `${failedStudents} failed paper${failedStudents === 1 ? "" : "s"} in the latest results (${failers} section${failers === 1 ? "" : "s"}) and no retake or supplementary test is planned.`, sev: "Medium", fix: "Schedule retake", href: "/principal/exams?tab=plan#create" });
  }
  if (unreviewed?.length) gaps.push({ t: `${unreviewed.length} checked test${unreviewed.length === 1 ? "" : "s"} not reviewed`, d: "AI-checked tests a teacher submitted that are still waiting for approval.", sev: "Medium", fix: "Review", href: "/principal/ai" });
  if (!settings?.board_target) gaps.push({ t: "No board target set", d: "Set the school's target board average so predictions show how far there is to go.", sev: "Low", fix: "Set target", href: "/principal/exams?tab=board" });
  if ((settings?.whatsapp_template_lang ?? "en") === "en") gaps.push({ t: "Result messages go in English only", d: "The WhatsApp template language is English. Parents who read Urdu may miss them.", sev: "Low", fix: "Message settings", href: "/settings" });
  const SEV = { High: ["r", "#ef4444"], Medium: ["y", "#f59e0b"], Low: ["b", "#0ea5e9"] } as const;
  const reg = (boardKids ?? []).length;
  const hist = (history ?? []).filter((h) => h.class_level === 10);
  const target = settings?.board_target;
  return (
    <section className="flex flex-wrap items-start gap-5">
      <div className="card min-w-0 flex-[3_1_520px]">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">What is missing in exams and board prep</h2><span className="muted text-[13px]">worked out from your data now</span></div>
        {gaps.length === 0 && <div className="mt-2"><Empty>Nothing missing. Every check passes.</Empty></div>}
        {gaps.map((g, i) => (
          <Row key={i}><span className="h-10 w-1.5 flex-none rounded-full" style={{ background: SEV[g.sev][1] }} />
            <div className="min-w-[180px] flex-1"><div className="font-black">{g.t}</div><div className="muted text-[12px]">{g.d}</div></div>
            <span className={`tagx ${SEV[g.sev][0]}`}>{g.sev}</span><Link href={g.href} className="btn-ghost" style={sm}>{g.fix}</Link></Row>
        ))}
        <p className="muted mt-2 text-[12px]">Personal student targets aren&apos;t tracked in the app yet, so that check isn&apos;t shown.</p>
      </div>
      <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
        <div className="card">
          <h2 className="h2">BISE results, past years · Class 10</h2>
          {hist.length === 0 && <div className="mt-2"><Empty>No past board results entered yet.</Empty></div>}
          {hist.map((h) => { const r = h.appeared ? h.passed / h.appeared : 0; return (
            <div key={h.year} className="flex items-center gap-2 py-1"><span className="w-12 font-black">{h.year}</span><div className="flex-1"><Bar value={r} /></div><span className="w-32 text-right text-[12px] font-bold">{pct(r)} pass · {h.a_plus} A+</span></div>
          ); })}
          {target && <div className="flex items-center gap-2 py-1"><span className="w-12 font-black text-[#7c3aed]">Target</span><div className="flex-1"><Bar value={target / 100} color="#7c3aed" /></div><span className="w-32 text-right text-[12px] font-bold">{target}% average</span></div>}
          <form action={saveBoardResult} className="mt-3 grid grid-cols-3 gap-2">
            <label className="field">Year<input className="input" type="number" name="year" required defaultValue={new Date().getFullYear() - 1} /></label>
            <label className="field">Appeared<input className="input" type="number" name="appeared" required min={0} /></label>
            <label className="field">Passed<input className="input" type="number" name="passed" required min={0} /></label>
            <label className="field">A+<input className="input" type="number" name="a_plus" min={0} defaultValue={0} /></label>
            <label className="field">Average %<input className="input" type="number" step="0.1" name="average" /></label>
            <input type="hidden" name="class_level" value="10" />
            <button className="btn-ghost self-end" type="submit">Add year</button>
          </form>
        </div>
        <div className="card">
          <h2 className="h2">Board readiness · Class 9–10</h2>
          <Row><span className="flex-1 font-bold">Registered with BISE</span><span className={`tagx ${unreg ? "y" : "g"}`}>{reg - unreg} of {reg}</span></Row>
          <Row><span className="flex-1 font-bold">Practicals on the date sheet</span><span className={`tagx ${practical.length ? "g" : "r"}`}>{practical.length ? `${practical.length} booked` : "None"}</span></Row>
          <Row><span className="flex-1 font-bold">Mock (send-up) exams</span><span className={`tagx ${mocks ? "g" : "y"}`}>{mocks}</span></Row>
          <Row><span className="flex-1 font-bold">Board target set</span><span className={`tagx ${target ? "g" : "y"}`}>{target ? `${target}%` : "No"}</span></Row>
        </div>
      </div>
    </section>
  );
}

// small piece for the board tab: the school's target
export async function BoardTarget({ back }: { back: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("campus_settings").select("board_target").maybeSingle();
  return (
    <form action={saveBoardTarget} className="flex items-end gap-2">
      <input type="hidden" name="back" value={back} />
      <label className="field">Board target average %<input className="input w-28" type="number" min={1} max={100} name="board_target" defaultValue={data?.board_target ?? ""} /></label>
      <button className="btn-ghost" style={sm} type="submit">Save</button>
    </form>
  );
}

