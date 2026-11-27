"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { mobilePK } from "@/lib/messages";
import { todayPK } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => (str(f, k) === "" ? null : Number(str(f, k)));
const admin = () => requireRole("principal", "owner");
const go = (t: string, error?: string, q: Record<string, string> = {}): never => {
  revalidatePath("/principal/care");
  redirect(`/principal/care?${new URLSearchParams({ tab: "transport", t, ...q, ...(error ? { error } : { saved: "1" }) })}`);
};

export async function saveRoute(f: FormData) {
  await admin();
  const sb = await createClient();
  const row = { name: str(f, "name"), monthly_fee_paisa: Math.round((num(f, "fee") ?? 0) * 100), note: str(f, "note") || null, active: f.get("active") !== "off" };
  const id = str(f, "id");
  const { data, error } = id ? await sb.from("transport_routes").update(row).eq("id", id).select("id").single() : await sb.from("transport_routes").insert(row).select("id").single();
  go("routes", error?.message, data ? { route: data.id } : {});
}

export async function addStop(f: FormData) {
  await admin();
  const sb = await createClient();
  const route = str(f, "route_id");
  const lat = num(f, "lat"), lng = num(f, "lng");
  const { error } = await sb.from("transport_stops").insert({
    route_id: route, name: str(f, "name"), sort: num(f, "sort") ?? 0, pickup_time: str(f, "pickup_time") || null, drop_time: str(f, "drop_time") || null,
    lat: lat != null && Math.abs(lat) <= 90 ? lat : null, lng: lng != null && Math.abs(lng) <= 180 ? lng : null,
  });
  go("routes", error?.message, { route });
}

export async function deleteStop(f: FormData) {
  await admin();
  const sb = await createClient();
  const { error } = await sb.from("transport_stops").delete().eq("id", str(f, "id"));
  go("routes", error?.message, { route: str(f, "route_id") });
}

export async function saveVehicle(f: FormData) {
  await admin();
  const sb = await createClient();
  const row = {
    name: str(f, "name"), plate: str(f, "plate") || null, seats: num(f, "seats"), monthly_fee_paisa: Math.round((num(f, "fee") ?? 0) * 100),
    route_id: str(f, "route_id") || null, driver_profile_id: str(f, "driver_profile_id") || null,
    attendant_name: str(f, "attendant_name") || null, attendant_phone: str(f, "attendant_phone") || null,
    fitness_expires_on: str(f, "fitness_expires_on") || null, insurance_expires_on: str(f, "insurance_expires_on") || null, route_permit_expires_on: str(f, "route_permit_expires_on") || null,
    active: f.get("active") !== "off",
  };
  const id = str(f, "id");
  const { data, error } = id ? await sb.from("vans").update(row).eq("id", id).select("id").single() : await sb.from("vans").insert(row).select("id").single();
  go("vehicles", error?.message, data ? { van: data.id } : {});
}

// A driver is a staff member with the Driver role; the login is their mobile number and a password.
export async function addDriver(f: FormData) {
  const me = await admin();
  const phone = str(f, "phone");
  if (!mobilePK(phone)) go("vehicles", "Write the driver's mobile like 03001234567.");
  const sb = await createClient();
  const { data, error } = await sb.from("profiles").insert({ campus_id: me.campus_id, role: "driver", full_name: str(f, "full_name"), phone }).select("id").single();
  if (error || !data) go("vehicles", error?.message ?? "Could not add.");
  if (str(f, "password")) {
    const r = await sb.rpc("set_driver_login", { p_profile: data!.id, p_password: str(f, "password") });
    if (r.error) go("vehicles", `Driver added, but no login: ${r.error.message}`);
  }
  go("vehicles", undefined, { login: phone });
}

export async function setDriverLogin(f: FormData) {
  await admin();
  const sb = await createClient();
  const { error } = await sb.rpc("set_driver_login", { p_profile: str(f, "profile_id"), p_password: str(f, "password") });
  go("vehicles", error?.message, { login: str(f, "phone") });
}

export async function assignRider(f: FormData) {
  await requireRole("principal", "owner", "accountant");
  const sb = await createClient();
  const van = str(f, "van_id"), sid = str(f, "student_id");
  if (!sid) go("riders", "Choose a student.", { van });
  const legs = ["both", "pick", "drop"].includes(str(f, "legs")) ? str(f, "legs") : "both";
  const { error } = van
    ? await sb.from("van_students").upsert({ van_id: van, student_id: sid, stop_id: str(f, "stop_id") || null, legs, stop: null })
    : await sb.from("van_students").delete().eq("student_id", sid);
  go("riders", error?.message, { van: van || str(f, "back_van") });
}

export async function answerSos(f: FormData) {
  const me = await admin();
  const sb = await createClient();
  const closing = str(f, "status") === "closed";
  const { error } = await sb.from("transport_sos").update(closing ? { status: "closed" } : { status: "answered", acked_by: me.id, acked_at: new Date().toISOString() }).eq("id", str(f, "id"));
  go("live", error?.message);
}

// Fuel, repairs and other running costs: kept per vehicle and also written to expenses,
// so they appear in the day close and the income and costs report.
export async function addVehicleCost(f: FormData) {
  const me = await requireRole("principal", "owner", "accountant");
  const sb = await createClient();
  const amount = Math.round((num(f, "amount") ?? 0) * 100);
  if (amount <= 0) go("costs", "Write the amount.");
  const kind = ["fuel", "maintenance", "repair", "token_tax", "insurance", "driver_pay", "other"].includes(str(f, "kind")) ? str(f, "kind") : "other";
  const day = str(f, "spent_on") || todayPK();
  const { data: van } = await sb.from("vans").select("name, plate").eq("id", str(f, "van_id")).maybeSingle();
  // the matching expense category under Transport, made once if the school has none
  const SUB: Record<string, string> = { fuel: "Vehicle fuel", maintenance: "Vehicle maintenance", repair: "Vehicle maintenance", token_tax: "Vehicle token and insurance", insurance: "Vehicle token and insurance", driver_pay: "Driver and helper", other: "Vehicle maintenance" };
  let { data: group } = await sb.from("expense_categories").select("id").is("parent_id", null).ilike("name", "Transport").maybeSingle();
  if (!group) group = (await sb.from("expense_categories").insert({ campus_id: me.campus_id, name: "Transport", sort: 60 }).select("id").single()).data;
  let { data: cat } = group ? await sb.from("expense_categories").select("id").eq("parent_id", group.id).ilike("name", SUB[kind]).maybeSingle() : { data: null };
  if (!cat && group) cat = (await sb.from("expense_categories").insert({ campus_id: me.campus_id, name: SUB[kind], parent_id: group.id, sort: 0 }).select("id").single()).data;
  let expenseId: string | null = null;
  if (cat) {
    const tag = `EV-${day.slice(2, 4)}${day.slice(5, 7)}-`;
    const { data: last } = await sb.from("expenses").select("voucher_no").like("voucher_no", `${tag}%`).order("voucher_no", { ascending: false }).limit(1);
    const n = (Number(last?.[0]?.voucher_no?.slice(tag.length)) || 0) + 1;
    const { data: ex } = await sb.from("expenses").insert({
      campus_id: me.campus_id, category_id: cat.id, spent_on: day, amount_paisa: amount, paid_to: str(f, "paid_to") || null,
      mode: ["cash", "bank", "jazzcash", "easypaisa", "cheque"].includes(str(f, "mode")) ? str(f, "mode") : "cash",
      note: `${van?.name ?? "Vehicle"}${van?.plate ? ` (${van.plate})` : ""}${str(f, "note") ? ` · ${str(f, "note")}` : ""}`,
      voucher_no: `${tag}${String(n).padStart(4, "0")}`, created_by: me.id,
    }).select("id").single();
    expenseId = ex?.id ?? null;
  }
  const { error } = await sb.from("vehicle_costs").insert({
    campus_id: me.campus_id, van_id: str(f, "van_id"), spent_on: day, kind, amount_paisa: amount,
    liters: num(f, "liters"), odometer: num(f, "odometer"), note: str(f, "note") || null, expense_id: expenseId,
  });
  go("costs", error?.message);
}
