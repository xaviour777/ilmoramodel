import { createClient } from "@/lib/supabase/server";
import { rupees, shortDate } from "@/lib/format";
import { SHOP_CATS, SHOP_MODE, SHOP_STATUS } from "@/lib/shop";
import { cancelShopOrder, placeShopOrder } from "./actions";

type Item = { id: string; category: string; name: string; class_label: string | null; size: string | null; price_paisa: number; stock: number | null };
type Kid = { id: string; full_name: string; sections: { name: string; classes: { name: string } } | null };
type Order = { id: string; status: string; pay_mode: string; txn_id: string | null; total_paisa: number; created_at: string; student_id: string; shop_order_lines: { name: string; qty: number }[] };

// Parent or student: see what the school sells, order for a child, pay at the office or by wallet.
export async function FamilyShop({ base, sp }: { base: string; sp: { kid?: string; sent?: string; error?: string } }) {
  const sb = await createClient();
  const [{ data: it }, { data: ks }, { data: od }, { data: wallet }] = await Promise.all([
    sb.from("shop_items").select("id, category, name, class_label, size, price_paisa, stock").eq("active", true).order("name"),
    sb.from("students").select("id, full_name, sections(name, classes(name))").eq("status", "enrolled").order("full_name"),
    sb.from("shop_orders").select("id, status, pay_mode, txn_id, total_paisa, created_at, student_id, shop_order_lines(name, qty)").order("created_at", { ascending: false }).limit(20),
    sb.from("school_wallets").select("jazzcash_number, jazzcash_title, easypaisa_number, easypaisa_title").maybeSingle(),
  ]);
  const kids = (ks ?? []) as unknown as Kid[];
  const kid = kids.find((k) => k.id === sp.kid) ?? kids[0];
  const cls = kid?.sections?.classes.name ?? "";
  const norm = (s: string) => s.toLowerCase().replace(/class|grade/g, "").replace(/[^a-z0-9]/g, "");
  // items for the child's class plus items for every class
  const items = ((it ?? []) as Item[]).filter((i) => !i.class_label || !cls || norm(i.class_label) === norm(cls));
  const orders = (od ?? []) as unknown as Order[];
  const nameOf = new Map(kids.map((k) => [k.id, k.full_name]));
  const wallets = [
    wallet?.jazzcash_number ? ["jazzcash", "JazzCash", wallet.jazzcash_number, wallet.jazzcash_title] : null,
    wallet?.easypaisa_number ? ["easypaisa", "Easypaisa", wallet.easypaisa_number, wallet.easypaisa_title] : null,
  ].filter(Boolean) as [string, string, string, string | null][];

  return (
    <>
      <div><h1 className="h1">Book shop</h1><p className="muted text-base">Order books, uniform and stationery from the school. Pay at the office, or by JazzCash or Easypaisa.</p></div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.sent && <div className="notice-ok">Order sent. The school will tell you when it is ready to collect.</div>}
      {kids.length > 1 && (
        <div className="flex flex-wrap gap-2">{kids.map((k) => <a key={k.id} href={`${base}?kid=${k.id}`} className={`pill ${k.id === kid?.id ? "pill-blue" : "pill-gray"}`}>{k.full_name}</a>)}</div>
      )}
      {!kid && <div className="card"><p className="muted">No enrolled child found on this login.</p></div>}
      {kid && (
        <form action={placeShopOrder} className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
          <input type="hidden" name="student_id" value={kid.id} />
          <input type="hidden" name="base" value={base} />
          <section className="card">
            <h2 className="h2">For {kid.full_name}{cls ? ` · ${cls}` : ""}</h2>
            {items.length === 0 && <p className="muted">The school hasn&apos;t listed anything for sale yet.</p>}
            {SHOP_CATS.map(([c, label]) => {
              const rows = items.filter((i) => i.category === c);
              if (!rows.length) return null;
              return (
                <div key={c}>
                  <div className="kick mt-3 mb-1">{label}</div>
                  {rows.map((i) => {
                    const out = i.stock != null && i.stock <= 0;
                    return (
                      <label key={i.id} className="row-box items-center gap-2">
                        <span className="min-w-0 flex-1 font-black">{i.name}{i.size ? ` (${i.size})` : ""}
                          <span className="muted block text-xs font-bold">{out ? "Out of stock" : i.stock != null && i.stock <= 5 ? `Only ${i.stock} left` : i.class_label || "All classes"}</span></span>
                        <b className="whitespace-nowrap">{rupees(Number(i.price_paisa))}</b>
                        <select className="input w-[76px]" name={`q_${i.id}`} defaultValue="0" disabled={out} aria-label={`How many ${i.name}`}>
                          {Array.from({ length: Math.min(10, i.stock ?? 10) + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </section>
          <section className="card">
            <h2 className="h2">Pay</h2>
            <label className="field">How will you pay?<select className="input" name="mode" defaultValue="cash">
              <option value="cash">Cash at the school office</option>
              {wallets.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            {wallets.length > 0 && (
              <div className="rounded-xl p-3 text-sm font-bold" style={{ background: "var(--blue-soft)" }}>
                {wallets.map(([id, label, number, title]) => <div key={id}>{label}: {number}{title ? ` (${title})` : ""}</div>)}
                <div className="muted mt-1 text-xs">Send the total to this number first, then enter the transaction ID.</div>
              </div>
            )}
            {wallets.length > 0 && <label className="field">Transaction ID (for JazzCash or Easypaisa)<input className="input" name="txn_id" maxLength={40} placeholder="From your payment SMS" /></label>}
            <label className="field">Note for the school (optional)<input className="input" name="note" maxLength={200} placeholder="Size, or when you will collect" /></label>
            <button className="btn self-start" type="submit" disabled={items.length === 0}>Send order</button>
            <p className="muted text-xs">You see the total on the order below. Prices are the school&apos;s.</p>
          </section>
        </form>
      )}
      <section className="card">
        <h2 className="h2">My orders</h2>
        {orders.length === 0 && <p className="muted">No orders yet.</p>}
        {orders.map((o) => {
          const st = SHOP_STATUS[o.status];
          return (
            <div key={o.id} className="row-box flex-col items-stretch gap-1">
              <div className="flex flex-wrap items-center gap-2"><b>{nameOf.get(o.student_id) ?? ""}</b><span className="muted text-xs">{shortDate(o.created_at.slice(0, 10))}</span><span className={`pill ${st[1]} ml-auto`}>{st[0]}</span></div>
              <div className="text-sm font-bold">{o.shop_order_lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm"><b>{rupees(Number(o.total_paisa))}</b><span className="muted">· {SHOP_MODE[o.pay_mode]}{o.txn_id ? ` · TID ${o.txn_id}` : ""}</span>
                {o.status === "pending" && <form action={cancelShopOrder} className="ml-auto"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="base" value={base} />
                  <button className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }} type="submit">Cancel</button></form>}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
