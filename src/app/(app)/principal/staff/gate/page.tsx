import Link from "next/link";
import { requireRole } from "@/lib/me";
import { GateScanner } from "./scanner";

// A phone kept at the school gate, signed in as the office, scans staff QR codes.
export default async function GatePage() {
  const me = await requireRole("principal", "owner", "accountant");
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        {me.role !== "accountant" && <Link href="/principal/staff" className="eyebrow">‹ Staff</Link>}
        <h1 className="h1">Staff gate</h1>
        <p className="muted text-base">First scan checks in (late after the school&apos;s start time), a scan 2 hours later checks out.</p>
      </div>
      <GateScanner />
    </div>
  );
}
