// Creates demo logins (password Ilmora@2026) and links them to the demo profiles from supabase/seed.sql.
// Run once after seeding:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-demo-users.mjs
// The service role key bypasses all security rules: keep it on your computer, never in the app or in git.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const PASSWORD = process.env.DEMO_PASSWORD ?? "Ilmora@2026";

const { data: profiles, error } = await supabase.from("profiles").select("id, email, full_name, role").not("email", "is", null);
if (error) throw error;

// existing users, so the script can be re-run
const existing = new Map();
for (let page = 1; ; page++) {
  const { data, error: e } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (e) throw e;
  data.users.forEach((u) => existing.set(u.email, u.id));
  if (data.users.length < 200) break;
}

for (const p of profiles) {
  let id = existing.get(p.email);
  if (!id) {
    const { data, error: e } = await supabase.auth.admin.createUser({ email: p.email, password: PASSWORD, email_confirm: true });
    if (e) { console.error(`  ${p.email}: ${e.message}`); continue; }
    id = data.user.id;
  }
  const { error: e2 } = await supabase.from("profiles").update({ user_id: id }).eq("id", p.id);
  console.log(`${e2 ? "FAILED" : "ok"}  ${p.role.padEnd(10)} ${p.email}${e2 ? "  " + e2.message : ""}`);
}
console.log(`\nDone. Sign in with any email above and the password ${PASSWORD}`);
