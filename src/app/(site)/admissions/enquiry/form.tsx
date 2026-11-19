"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { sendEnquiry } from "./actions";
import type { UIKey } from "@/lib/site/i18n";
import type { Campus } from "@/lib/site/load";

const ERR: Record<string, UIKey> = { name: "errName", phone: "errPhone", date: "errDate", busy: "errBusy", site: "errSite", campus: "errClass", class: "errClass", message: "errGeneric", generic: "errGeneric" };
const mobileOk = (v: string) => /^(?:\+?92|0)?3\d{9}$/.test(v.replace(/[\s-]/g, ""));
const todayPK = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

// Choose class → child and parent → visit or question → confirmation. No account needed.
export function EnquiryForm({ campuses, words: w, wantVisit, whatsapp, preview }: {
  campuses: Campus[]; words: Record<UIKey, string>; wantVisit: boolean; whatsapp: string; preview: boolean;
}) {
  const [step, setStep] = useState(0);
  const [campus, setCampus] = useState(campuses.length === 1 ? campuses[0].id : "");
  const [klass, setKlass] = useState<string | null>(null);
  const [child, setChild] = useState("");
  const [guardian, setGuardian] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<"visit" | "question">(wantVisit ? "visit" : "question");
  const [visitOn, setVisitOn] = useState("");
  const [message, setMessage] = useState("");
  const [hp, setHp] = useState("");
  const [started] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const classes = useMemo(() => campuses.find((c) => c.id === campus)?.classes ?? [], [campuses, campus]);

  const next = () => {
    setError(null);
    if (step === 0 && (!campus || klass === null)) return setError(w.errClass);
    if (step === 1) {
      if (child.trim().length < 2 || guardian.trim().length < 2) return setError(w.errName);
      if (!mobileOk(phone)) return setError(w.errPhone);
    }
    setStep(step + 1);
  };

  const submit = () => {
    setError(null);
    const f = new FormData();
    Object.entries({ campus, class: klass ?? "", child, guardian, phone, kind, visit_on: visitOn, message, website: hp, started: String(started) }).forEach(([k, v]) => f.set(k, v));
    start(async () => {
      const r = await sendEnquiry(f);
      if (r.ref) setRef(r.ref);
      else setError(w[ERR[r.error ?? "generic"] ?? "errGeneric"]);
    });
  };

  if (ref) {
    return (
      <div className="form done" role="status" aria-live="polite">
        <span className="tick-big"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <h2 className="sh3" style={{ fontSize: "1.4rem" }}>{w.thanks}</h2>
        <p className="soft" style={{ margin: 0 }}>{w.thanksText}</p>
        <div className="ref">{ref}</div>
        <div className="hero-cta" style={{ justifyContent: "center" }}>
          {whatsapp && <a className="sbtn sbtn-wa" href={whatsapp} target="_blank" rel="noopener noreferrer">{w.whatsapp}</a>}
          <Link className="sbtn sbtn-ghost" href="/">{w.goHome}</Link>
        </div>
      </div>
    );
  }

  const steps = [w.step1, w.step2, w.step3];
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); if (step < 2) next(); else submit(); }} noValidate>
      <div>
        <div className="progress" aria-hidden>{steps.map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>
        <p className="soft" style={{ margin: "10px 0 0", fontSize: "0.9rem", fontWeight: 700 }}>{w.stepOf} {step + 1} / 3 · {steps[step]}</p>
      </div>
      <div className="hp" aria-hidden><label>Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} name="website" /></label></div>

      {step === 0 && (
        <>
          {campuses.length > 1 && (
            <fieldset className="sfield" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ marginBottom: 8 }}>{w.campus}</legend>
              <div className="schips">{campuses.map((c) => <button type="button" key={c.id} className="schip" aria-pressed={campus === c.id} onClick={() => { setCampus(c.id); setKlass(null); }}>{c.name}</button>)}</div>
            </fieldset>
          )}
          {campus && (
            <fieldset className="sfield" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ marginBottom: 8 }}>{w.klass}</legend>
              <div className="schips">
                {classes.map((k) => <button type="button" key={k.id} className="schip" aria-pressed={klass === k.id} onClick={() => setKlass(k.id)}>{k.name}</button>)}
                <button type="button" className="schip" aria-pressed={klass === ""} onClick={() => setKlass("")}>{w.notSure}</button>
              </div>
            </fieldset>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <label className="sfield">{w.childName}<input className="inp" value={child} onChange={(e) => setChild(e.target.value)} maxLength={80} autoComplete="off" required /></label>
          <label className="sfield">{w.guardianName}<input className="inp" value={guardian} onChange={(e) => setGuardian(e.target.value)} maxLength={80} autoComplete="name" required /></label>
          <label className="sfield">{w.mobile}
            <input className="inp ltr" style={{ display: "block" }} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0300 1234567" maxLength={20} required aria-invalid={!!error && !mobileOk(phone)} />
            <small>{w.mobileHint}</small>
          </label>
        </>
      )}

      {step === 2 && (
        <>
          <fieldset className="sfield" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ marginBottom: 8 }}>{w.whatNext}</legend>
            <div className="schips">
              <button type="button" className="schip" aria-pressed={kind === "visit"} onClick={() => setKind("visit")}>{w.wantVisit}</button>
              <button type="button" className="schip" aria-pressed={kind === "question"} onClick={() => setKind("question")}>{w.wantQuestion}</button>
            </div>
          </fieldset>
          {kind === "visit" && <label className="sfield">{w.visitDate}<input className="inp" type="date" min={todayPK()} value={visitOn} onChange={(e) => setVisitOn(e.target.value)} /></label>}
          <label className="sfield">{w.message}<textarea className="inp" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={600} /></label>
          <p className="soft" style={{ margin: 0, fontSize: "0.9rem" }}>{w.privacyNote}</p>
        </>
      )}

      {error && <div className="err" role="alert">{error}</div>}
      {preview && step === 2 && <div className="todo">{w.errSite}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
        {step > 0 ? <button type="button" className="sbtn sbtn-ghost" onClick={() => { setError(null); setStep(step - 1); }}>{w.back}</button> : <span />}
        <button type="submit" className="sbtn sbtn-primary" disabled={pending}>{step < 2 ? w.next : pending ? w.sending : w.send}</button>
      </div>
    </form>
  );
}
