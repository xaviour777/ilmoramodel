import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { FeesTabs } from "@/components/fees-tabs";
import { loadCategories } from "@/lib/expenses";
import { addCategory, addStandardCategories, editCategory } from "../../money-actions";

// Expense groups and their sub-categories: the standard school list plus the school's own.
export default async function ExpenseCategories({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const cats = await loadCategories(supabase);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/accounts/expenses" className="eyebrow">‹ Expenses</Link>
          <h1 className="h1">Expense categories</h1>
          <p className="muted text-base">Main groups with sub-categories. Add your own, rename them, or hide the ones you don&apos;t use.</p>
        </div>
        <FeesTabs current="expenses" salaries={me.role === "accountant"} />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section className="card flex-[2]">
          {cats.groups.length === 0 && <p className="muted">No categories yet. Add the standard list on the right, then change it as you like.</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {cats.groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-2 rounded-2xl border-2 p-3" style={{ borderColor: "var(--line)", opacity: g.is_active ? 1 : 0.6 }}>
                <form action={editCategory} className="flex items-center gap-2">
                  <input type="hidden" name="category_id" value={g.id} />
                  <input className="input min-h-10 flex-1 py-1 text-sm font-black" name="name" defaultValue={g.name} aria-label="Group name" />
                  <label className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" name="is_active" defaultChecked={g.is_active} /> in use</label>
                  <button className="eyebrow" type="submit">Save</button>
                </form>
                {cats.subsOf(g.id).map((s) => (
                  <form key={s.id} action={editCategory} className="flex items-center gap-2 pl-3">
                    <input type="hidden" name="category_id" value={s.id} />
                    <input className="input min-h-9 flex-1 py-1 text-sm" name="name" defaultValue={s.name} aria-label="Category name" />
                    <label className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" name="is_active" defaultChecked={s.is_active} /> in use</label>
                    <button className="eyebrow" type="submit">Save</button>
                  </form>
                ))}
                <form action={addCategory} className="flex items-center gap-2 pl-3">
                  <input type="hidden" name="parent_id" value={g.id} />
                  <input className="input min-h-9 flex-1 py-1 text-sm" name="name" placeholder="New sub-category" required aria-label={`New sub-category in ${g.name}`} />
                  <button className="eyebrow" type="submit">Add</button>
                </form>
              </div>
            ))}
          </div>
        </section>
        <div className="flex flex-1 flex-col gap-5">
          <form action={addStandardCategories} className="card">
            <h2 className="h2">Standard school categories</h2>
            <p className="muted">Rent, utilities, academic, board fees, transport, events, admissions marketing, office, furniture and more, each with its sub-categories. Ones you already have stay as they are.</p>
            <button className="btn-ghost self-start" type="submit">Add standard categories</button>
          </form>
          <form action={addCategory} className="card">
            <h2 className="h2">New main group</h2>
            <label className="field">Name<input className="input" name="name" required placeholder="Hostel, Canteen" /></label>
            <button className="btn self-start" type="submit">Add group</button>
          </form>
          <p className="muted">A category can&apos;t be deleted once used, so old records keep their name. Untick &quot;in use&quot; to hide it from the list.</p>
        </div>
      </div>
    </>
  );
}
