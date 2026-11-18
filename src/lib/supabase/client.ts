import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/env";
import { createBrowserClient } from "@supabase/ssr";

// Supabase client for the browser (used for live updates).
export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_KEY,
  );
}
