import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBranding, schoolDomain, DEFAULT_COLOR } from "@/lib/branding";
import { SignupForm } from "./form";

export const metadata = { title: "Sign up" };

// Parents and students ask for a login themselves; the principal approves each one.
// Works only on a school's own web address, so a request always reaches the right school.
export default async function RegisterPage() {
  const brand = await getBranding();
  const color = brand?.primary_color ?? DEFAULT_COLOR;
  const supabase = await createClient();
  const { data } = brand ? await supabase.rpc("signup_info", { p_domain: await schoolDomain() }) : { data: null };
  const info = data as { school: string; campuses: { id: string; name: string; classes: { id: string; name: string }[] }[] } | null;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <div className="text-3xl font-black tracking-tight" style={{ color }}>{brand?.name ?? "Prinqo AI"}</div>
        <p className="muted mt-2 text-base">Parents and students: ask for your login here. The principal checks it first.</p>
      </div>
      {info?.campuses?.length
        ? <SignupForm campuses={info.campuses} color={color} />
        : <div className="card"><p className="muted">Sign-up opens on your school&apos;s own web address. Ask the school office for the link.</p></div>}
      <p className="muted text-center text-sm"><Link href="/login" className="underline">Back to sign in</Link></p>
    </main>
  );
}
