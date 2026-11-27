import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { PageHead, Row, Empty } from "@/components/ilm";
import { ResetLogin } from "./reset";

type Person = { id: string; name: string; role: string; campus: string; email: string | null; phone: string | null; active: boolean;
  login: string | null; last_login: string | null; can_phone: boolean };

const ROLES: [string, string][] = [["", "Everyone"], ["owner", "Owner"], ["principal", "Principal"], ["accountant", "Office"], ["teacher", "Teachers"], ["parent", "Parents"], ["student", "Students"]];

// Every login at one school: who they are, what they sign in with, and a reset button.
// Passwords are never shown or stored here; a reset makes a new one and shows it once.
export default async function SchoolLogins({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; role?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80), role = ROLES.some(([r]) => r === sp.role) ? sp.role! : "";
  const supabase = await createClient();
  const [{ data, error }, school] = await Promise.all([
    supabase.rpc("super_school_people", { p_school: id, p_q: q, p_role: role }),
    supabase.rpc("super_school", { p_school: id }),
  ]);
  if (error) return <div className="notice-bad">{error.message}</div>;
  const d = data as { counts: Record<string, number>; people: Person[] };
  const name = (school.data as { school?: { name: string } } | null)?.school?.name ?? "School";
  const total = Object.values(d.counts).reduce((a, b) => a + Number(b), 0);
  const withLogin = d.people.filter((p) => p.login).length;
  const href = (r: string) => `/super/${id}/logins?${new URLSearchParams({ ...(q ? { q } : {}), ...(r ? { role: r } : {}) })}`;
  const shownLogin = (l: string) => { const m = l.match(/^m92(\d{10})@phone\.prinqo\.app$/); return m ? `0${m[1]} (mobile)` : l; };

  return (
    <>
      <PageHead kick={<Link href={`/super/${id}`} className="underline">{name}</Link>} title="Logins" sub={`${total} people at this school. Passwords are kept locked (hashed), so nobody can read them, not even you. Reset one to give a person a new password.`} />
      <form className="card flex flex-wrap items-end gap-3" action={`/super/${id}/logins`}>
        {role && <input type="hidden" name="role" value={role} />}
        <label className="field min-w-0 flex-[1_1_260px]">Search<input className="input" name="q" defaultValue={q} placeholder="Name, email or mobile" /></label>
        <button className="btn" type="submit">Search</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {ROLES.map(([r, label]) => (
          <Link key={r} href={href(r)} className={r === role ? "btn" : "btn-ghost"} style={{ minHeight: 34, padding: "0 12px", fontSize: 13 }}>
            {label}{r ? ` · ${d.counts[r] ?? 0}` : ` · ${total}`}
          </Link>
        ))}
      </div>
      <div className="card">
        <div className="muted text-[13px]">{d.people.length >= 300 ? "Showing the first 300. Search to narrow down." : `${d.people.length} shown · ${withLogin} can sign in`}</div>
        {d.people.length === 0 && <div className="mt-2"><Empty>Nobody matches.</Empty></div>}
        {d.people.map((p) => (
          <Row key={p.id}>
            <div className="min-w-[200px] flex-1">
              <div className="font-black">{p.name} <span className="tagx">{p.role}</span>{!p.active && <span className="tagx r ml-1">inactive</span>}</div>
              <div className="muted text-[12px]">
                {p.login ? <>Signs in with <b>{shownLogin(p.login)}</b></> : p.email || p.can_phone ? "No login yet" : "No email or mobile number on file"}
                {" · "}{p.campus}{p.phone ? ` · ${p.phone}` : ""}
                {p.login && ` · ${p.last_login ? `last login ${shortDate(p.last_login.slice(0, 10))}` : "never signed in"}`}
              </div>
            </div>
            {(p.login || p.email || p.can_phone) && <ResetLogin schoolId={id} profileId={p.id} name={p.name} hasLogin={!!p.login} />}
          </Row>
        ))}
      </div>
    </>
  );
}
