import { requireRole } from "@/lib/me";
import { SettingsTabs } from "@/components/settings-tabs";
import { MODULES, moduleOn } from "@/lib/modules";
import { setSchoolModule } from "./actions";

// Extra parts of the app a school can add when it is ready. They start switched off.
export default async function Modules({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const on = await Promise.all(MODULES.map((m) => moduleOn(m.id)));
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kick">Settings</div><h1 className="h1">Extra modules</h1>
          <p className="muted text-base">Not needed on day one. Switch one on when your teachers are ready, and it appears for students and parents straight away.</p>
        </div>
        <SettingsTabs current="modules" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {MODULES.map((m, i) => (
        <form key={m.id} action={setSchoolModule} className="card flex flex-row flex-wrap items-center justify-between gap-3">
          <input type="hidden" name="module" value={m.id} /><input type="hidden" name="on" value={on[i] ? "0" : "1"} />
          <div className="min-w-0 flex-[1_1_320px]">
            <h2 className="h2">{m.name} <span className={`tagx ${on[i] ? "g" : ""}`}>{on[i] ? "On" : "Off"}</span></h2>
            <p className="muted text-[14px]">{m.what}</p>
            <p className="muted text-[12px]">For: {m.who}</p>
          </div>
          <button className={on[i] ? "btn-ghost" : "btn"} type="submit">{on[i] ? "Switch off" : "Switch on"}</button>
        </form>
      ))}
    </>
  );
}
