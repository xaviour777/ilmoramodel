"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { pushTo } from "@/lib/push";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (tab: string, error?: string): never => {
  revalidatePath("/principal/shop");
  redirect(`/principal/shop?tab=${tab}${error ? `&error=${encodeURIComponent(error)}` : "&saved=1"}`);
};
const CATS = ["books", "uniform", "stationery", "other"];

// Add or edit one item on sale.
export async function saveShopItem(f: FormData) {
  await requireRole("principal", "owner", "accountant");
  const sb = await createClient();
  const name = str(f, "name");
  const category = str(f, "category");
  const price = Number(str(f, "price").replace(/,/g, ""));
  const stock = str(f, "stock");
  if (!name) go("items", "Enter the item's name.");
  if (!CATS.includes(category)) go("items", "Choose a category.");
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000) go("items", "Enter a price in rupees.");
  if (stock && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) go("items", "Stock must be a whole number, or empty if you don't count it.");
  const row = {
    name, category, class_label: str(f, "class_label") || null, size: str(f, "size") || null,
    price_paisa: Math.round(price * 100), stock: stock ? Number(stock) : null, active: f.get("active") === "on",
  };
  const id = str(f, "id");
  const { error } = id ? await sb.from("shop_items").update(row).eq("id", id) : await sb.from("shop_items").insert(row);
  go("items", error?.message);
}

// Paid, handed over, or cancelled. The family gets a notification.
export async function setShopOrder(f: FormData) {
  await requireRole("principal", "owner", "accountant");
  const sb = await createClient();
  const id = str(f, "id");
  const status = str(f, "status");
  const { error } = await sb.rpc("set_shop_order_status", { p_order: id, p_status: status });
  if (!error) {
    const { data: o } = await sb.from("shop_orders").select("student_id").eq("id", id).maybeSingle();
    const msg = status === "paid" ? "Payment received. Collect the items from the school shop." : status === "delivered" ? "Your shop order was handed over." : "Your shop order was cancelled by the school.";
    if (o?.student_id) await pushTo({ students: [o.student_id] }, { title: "Book shop", body: msg, url: "/parent/shop" });
  }
  go("orders", error?.message);
}
