// Supabase project URL and public (publishable) key. Both are public by design:
// they ship to every browser and row-level security protects the data.
// Vercel hands "Sensitive" variables to the build masked as bullets (•••),
// which breaks every request, so a masked or missing value falls back here.
const FALLBACK_URL = "https://ilwspeywqhbanqfpwlgl.supabase.co";
const FALLBACK_KEY = "sb_publishable_ZnSU22v7Cea1Livw2v3QuA_P7JK2Ix2";

const usable = (v: string | undefined) => !!v && /^[\x21-\x7e]+$/.test(v.trim());

export const SUPABASE_URL = usable(process.env.NEXT_PUBLIC_SUPABASE_URL) ? process.env.NEXT_PUBLIC_SUPABASE_URL!.trim() : FALLBACK_URL;
// a key for another project must not be used with the fallback URL
export const SUPABASE_KEY = usable(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) && SUPABASE_URL !== FALLBACK_URL || usable(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) && usable(process.env.NEXT_PUBLIC_SUPABASE_URL)
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim() : FALLBACK_KEY;
