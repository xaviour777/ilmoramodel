import Care from "../care/page";

// Vans on their own menu item (Services → Vans); the screen itself lives with School care.
export default async function Transport({ searchParams }: { searchParams: Promise<{ van?: string; saved?: string; error?: string }> }) {
  const sp = await searchParams;
  return Care({ searchParams: Promise.resolve({ ...sp, tab: "transport" }) });
}
