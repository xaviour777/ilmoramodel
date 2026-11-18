import Link from "next/link";
import { requireRole } from "@/lib/me";
import { GateScanner } from "./scanner";
import { PageHead } from "@/components/ilm";

// A phone kept at the school gate, signed in as the office, scans staff QR codes.
export default async function GatePage() {
  const me = await requireRole("principal", "owner", "accountant");
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      {me.role !== "accountant" && <Link href="/principal/staff" className="text-[13px] font-extrabold text-[#0369a1]">‹ Staff</Link>}
      <PageHead kick="Staff" title="Staff gate" sub="First scan checks in (late after the school's start time), a scan 2 hours later checks out." />
      <GateScanner />
    </div>
  );
}
