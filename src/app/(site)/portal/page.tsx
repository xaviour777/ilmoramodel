import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/me";
import { isSuper } from "@/lib/super";

// My Model: everyone signs in here on the school's own address and lands on their own
// dashboard (the role comes from their school record, never from a choice on screen).
export default async function Portal() {
  if (await isSuper()) redirect("/super");
  const me = await getMe(); // signed-out visitors go to /login
  redirect(homeFor(me.role));
}
