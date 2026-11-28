"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/me";

// Owner who is also the principal: switch the menu between Principal and Director mode.
export async function switchMode(f: FormData) {
  const me = await getMe();
  const director = f.get("to") === "director";
  if (!me.combined) redirect(director ? "/principal" : "/");
  (await cookies()).set("prinqo_mode", director ? "director" : "principal", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect(director ? "/owner" : "/principal");
}
