import { requireRole } from "@/lib/me";
import { Scanner } from "./scanner";

export default async function Scan() {
  await requireRole("teacher", "principal", "owner");
  return (
    <>
      <div><h1 className="h1">Scan cards</h1><p className="muted text-base">Scan each student&apos;s ID card at the door. Anyone not scanned stays unmarked until you mark the class.</p></div>
      <section className="card"><Scanner /></section>
    </>
  );
}
