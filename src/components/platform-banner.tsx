import { createClient } from "@/lib/supabase/server";

// Announcements from the Prinqo AI platform (super admin → Announcements), shown to school staff.
export async function PlatformBanner() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_announcements");
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {(data as { id: string; title: string; body: string | null; tone: string }[]).map((a) => (
        <div key={a.id} role="status" className={`rounded-[14px] border-2 px-4 py-2.5 text-[14px] font-bold ${a.tone === "warn" ? "border-[#fdba74] bg-[#fff7ed] text-[#9a3412]" : "border-[#7dd3fc] bg-[#f0f9ff] text-[#075985]"}`}>
          <span className="font-black">{a.title}</span>{a.body ? <span className="font-semibold"> · {a.body}</span> : null}
        </div>
      ))}
    </div>
  );
}
