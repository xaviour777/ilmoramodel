import { PageHead } from "@/components/ilm";
import { createClient } from "@/lib/supabase/server";
import { rupees } from "@/lib/format";
import type { Plan } from "@/lib/super";
import { createSchool } from "../actions";

export default async function NewSchool({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const plans = ((await supabase.rpc("super_plans")).data ?? []) as Plan[];
  return (
    <>
      <PageHead kick="Platform" title="Add a school" sub="One form makes the school ready to use: campus, school year and terms, bell timings, Class 1 to 10, subjects, grading, fee heads and the principal's login." />
      {error && <div className="notice-bad">{error}</div>}
      <form action={createSchool} className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[3_1_480px] flex-col gap-3">
          <h2 className="h2">School</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">School name<input className="input" name="name" required placeholder="Azenu School" /></label>
            <label className="field">City<input className="input" name="city" placeholder="Lahore" /></label>
            <label className="field">First campus<input className="input" name="campus_name" placeholder="Main Campus" /></label>
            <label className="field">Domain<input className="input" name="custom_domain" placeholder="lms.azenu.edu.pk" /></label>
            <label className="field">Logo link<input className="input" name="logo_url" type="url" placeholder="https://…/logo.png" /></label>
            <label className="field">Brand colour<input className="input" name="primary_color" type="color" defaultValue="#16a34a" /></label>
            <label className="field">Support email<input className="input" name="support_email" type="email" placeholder="help@azenu.edu.pk" /></label>
            <label className="field">Notes (only you see these)<input className="input" name="notes" placeholder="Met at expo, wants fees module" /></label>
          </div>
        </section>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
          <section className="card flex flex-col gap-3">
            <h2 className="h2">Plan and trial</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Free trial
                <select className="input" name="trial_days" defaultValue="14"><option value="0">No trial (active)</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select>
              </label>
              <label className="field">Plan<select className="input" name="plan" defaultValue="standard">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price_paisa ? ` · ${rupees(p.price_paisa)}` : ""}</option>)}</select></label>
              <label className="field col-span-2">Student limit (empty for none)<input className="input" name="max_students" type="number" min={1} placeholder="500" /></label>
            </div>
          </section>
          <section className="card flex flex-col gap-3">
            <h2 className="h2">Principal&apos;s login</h2>
            <label className="field">Full name<input className="input" name="principal_name" required /></label>
            <label className="field">Email<input className="input" name="principal_email" type="email" required /></label>
            <label className="field">Phone<input className="input" name="principal_phone" inputMode="tel" placeholder="03001234567" /></label>
            <label className="field">Password (8 characters or more)<input className="input" name="principal_password" type="text" minLength={8} required autoComplete="off" /></label>
            <button className="btn" type="submit">Create school</button>
          </section>
        </div>
      </form>
    </>
  );
}
