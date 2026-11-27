import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Optional modules a school switches on in Settings → Extra modules. New schools start with them off.
export type Module = "passport" | "board" | "whatsapp";
export const MODULES: { id: Exclude<Module, "whatsapp">; name: string; what: string; who: string }[] = [
  { id: "passport", name: "Model Passport", what: "Each child's goals, projects and achievements beyond marks, approved by the class teacher, with a share link.", who: "Students, parents and class teachers" },
  { id: "board", name: "Board exam prep", what: "Chapter readiness and timed mock tests from the question bank for Class 9 to 12.", who: "Students and parents" },
];

export const moduleOn = cache(async (m: Module) => {
  const sb = await createClient();
  const { data } = await sb.rpc("has_module", { p_module: m });
  return data === true;
});

// a page of a module that is off sends the visitor back home
export async function requireModule(m: Module, back: string) {
  if (!(await moduleOn(m))) redirect(back);
}
