import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees, shortDate } from "@/lib/format";
import { Tabs } from "@/components/tabs";
import { saveShopItem, setShopOrder } from "./actions";
import { SHOP_CATS, SHOP_MODE as MODE } from "@/lib/shop";

type Search = { tab?: string; item?: string; f?: string; saved?: string; error?: string };
const STATUS: Record<string, [string, string]> = { pending: ["Waiting", "pill-orange"], paid: ["Paid", "pill-blue"], delivered: ["Handed over", "pill-green"], cancelled: ["Cancelled", "pill-gray"] };
type Item = { id: string; category: string; name: string; class_label: string | null; size: string | null; price_paisa: number; stock: number | null; active: boolean };
type Order = { id: string; status: string; pay_mode: string; txn_id: string | null; total_paisa: number; note: string | null; created_at: string; students: { full_name: string; sections: { name: string; classes: { name: string } } | null } | null; shop_order_lines: { name: string; qty: number; price_paisa: number }[] };

// The school's own shop: books, uniform and stationery that families order from their app.
export default async function Shop({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const sb = await createClient();
  const tab = sp.tab === "items" ? "items" : "orders";
  const [{ data: it, error: e1 }, { data: od, error: e2 }] = await Promise.all([
    sb.from("shop_items").select("*").order("category").order("name"),
    sb.from("shop_orders").select("id, status, pay_mode, txn_id, total_paisa, note, created_at, students(full_name, sections(name, classes(name))), shop_order_lines(name, qty, price_paisa)").order("created_at", { ascending: false }).limit(300),
  ]);
  const items = (it ?? []) as Item[];
  const orders = (od ?? []) as unknown as Order[];
  const waiting = orders.filter((o) => o.status === "pending");
  const toHand = orders.filter((o) => o.status === "paid");
  const month = new Date().toISOString().slice(0, 7);
  const sold = orders.filter((o) => (o.status === "paid" || o.status === "delivered") && o.created_at.slice(0, 7) === month).reduce((t, o) => t + Number(o.total_paisa), 0);
  const low = items.filter((i) => i.active && i.stock != null && i.stock <= 5);
  const filter = ["pending", "paid", "delivered", "cancelled"].includes(sp.f ?? "") ? sp.f! : "open";
  const shown = orders.filter((o) => (filter === "open" ? o.status === "pending" || o.status === "paid" : o.status === filter));
  const edit = sp.item === "new" ? undefined : items.find((i) => i.id === sp.item);
  const btn = { minHeight: 34, padding: "0 12px", fontSize: 12 } as const;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Book shop</h1><p className="muted text-base">Books, uniform and stationery that parents and students order from their app.</p></div>
        <Tabs current={tab} tabs={[{ id: "orders", label: `Orders${waiting.length ? ` (${waiting.length})` : ""}`, href: "/principal/shop" }, { id: "items", label: "Items and prices", href: "/principal/shop?tab=items" }]} />
      </div>
      {(sp.error || e1 || e2) && <div className="notice-bad">{sp.error ?? e1?.message ?? e2?.message}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><span className="muted">Waiting for payment</span><b>{waiting.length}</b></div>
        <div className="tile"><span className="muted">Paid, to hand over</span><b>{toHand.length}</b></div>
        <div className="tile"><span className="muted">Sold this month</span><b>{rupees(sold)}</b></div>
        <div className="tile"><span className="muted">Running low (5 or less)</span><b>{low.length}</b></div>
      </div>

      {tab === "orders" && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">Orders</h2>
            <div className="flex flex-wrap gap-2">{[["open", "Open"], ["pending", "Waiting"], ["paid", "Paid"], ["delivered", "Handed over"], ["cancelled", "Cancelled"]].map(([id, l]) => (
              <Link key={id} href={`/principal/shop?f=${id}`} className={`pill ${filter === id ? "pill-blue" : "pill-gray"}`}>{l}</Link>))}</div>
          </div>
          {shown.length === 0 && <p className="muted">No orders here.</p>}
          {shown.map((o) => {
            const st = STATUS[o.status];
            const cls = o.students?.sections ? `${o.students.sections.classes.name} ${o.students.sections.name}` : "";
            return (
              <div key={o.id} className="row-box flex-col items-stretch gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{o.students?.full_name}</b><span className="muted text-xs">{cls} · {shortDate(o.created_at.slice(0, 10))}</span>
                  <span className={`pill ${st[1]} ml-auto`}>{st[0]}</span>
                </div>
                <div className="text-sm font-bold">{o.shop_order_lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <b>{rupees(Number(o.total_paisa))}</b><span className="muted">· {MODE[o.pay_mode]}{o.txn_id ? ` · TID ${o.txn_id}` : ""}{o.note ? ` · “${o.note}”` : ""}</span>
                  <span className="ml-auto flex flex-wrap gap-2">
                    {o.status === "pending" && <form action={setShopOrder}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="paid" /><button className="btn" style={btn} type="submit">{o.pay_mode === "cash" ? "Cash received" : "Payment checked"}</button></form>}
                    {(o.status === "pending" || o.status === "paid") && <form action={setShopOrder}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="delivered" /><button className={o.status === "paid" ? "btn" : "btn-ghost"} style={btn} type="submit">Handed over</button></form>}
                    {(o.status === "pending" || o.status === "paid") && <form action={setShopOrder}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="cancelled" /><button className="btn-ghost" style={btn} type="submit">Cancel</button></form>}
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {tab === "items" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
          <form action={saveShopItem} className="card">
            <input type="hidden" name="id" value={edit?.id ?? ""} />
            <h2 className="h2">{edit ? `Edit ${edit.name}` : "Add an item"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field sm:col-span-2">Name<input className="input" name="name" required maxLength={120} defaultValue={edit?.name ?? ""} placeholder="English reader, Class 5" /></label>
              <label className="field">Category<select className="input" name="category" defaultValue={edit?.category ?? "books"}>{SHOP_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="field">Price (Rs)<input className="input" name="price" type="number" min={0} required defaultValue={edit ? edit.price_paisa / 100 : ""} /></label>
              <label className="field">For class (empty = all)<input className="input" name="class_label" defaultValue={edit?.class_label ?? ""} placeholder="Class 5" /></label>
              <label className="field">Size or edition<input className="input" name="size" defaultValue={edit?.size ?? ""} placeholder="Medium, 26" /></label>
              <label className="field">In stock (empty = don&apos;t count)<input className="input" name="stock" type="number" min={0} defaultValue={edit?.stock ?? ""} /></label>
              <label className="flex items-center gap-2.5 self-end text-sm font-extrabold"><input type="checkbox" name="active" defaultChecked={edit?.active ?? true} className="h-5 w-5" /> On sale</label>
            </div>
            <div className="flex gap-2"><button className="btn" type="submit">{edit ? "Save" : "Add item"}</button>{edit && <Link className="btn-ghost" href="/principal/shop?tab=items&item=new">New item</Link>}</div>
          </form>
          <section className="card">
            <h2 className="h2">Items · {items.filter((i) => i.active).length} on sale</h2>
            {items.length === 0 && <p className="muted">Nothing listed yet. Add books, uniform and stationery with their prices.</p>}
            {SHOP_CATS.map(([c, label]) => {
              const rows = items.filter((i) => i.category === c);
              if (!rows.length) return null;
              return (
                <div key={c}>
                  <div className="kick mt-3 mb-1">{label}</div>
                  {rows.map((i) => (
                    <Link key={i.id} href={`/principal/shop?tab=items&item=${i.id}`} className="row-box items-center gap-2">
                      <span className={`min-w-0 flex-1 font-black ${i.active ? "" : "muted line-through"}`}>{i.name}{i.size ? ` (${i.size})` : ""}<span className="muted block text-xs font-bold">{i.class_label || "All classes"}</span></span>
                      <span className={`pill ${i.stock == null ? "pill-gray" : i.stock <= 5 ? "pill-red" : "pill-green"}`}>{i.stock == null ? "Not counted" : `${i.stock} left`}</span>
                      <b>{rupees(Number(i.price_paisa))}</b>
                    </Link>
                  ))}
                </div>
              );
            })}
          </section>
        </div>
      )}
    </>
  );
}
