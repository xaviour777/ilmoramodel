import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/me";
import { isSuper } from "@/lib/super";

export default async function Home() {
  if (await isSuper()) redirect("/super");
  const me = await getMe();
  redirect(homeFor(me.role));
}
