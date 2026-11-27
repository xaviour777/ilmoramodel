"use server";

import { requireRole } from "@/lib/me";
import { pushVia } from "@/lib/push";

// Phone alerts after the board has saved a mark or an SOS (the database picks who gets them).
export async function alertSos(sosId: string, van: string) {
  await requireRole("driver", "principal", "owner");
  return pushVia("sos_push_targets", { p_sos: sosId }, { title: `SOS from ${van}`, body: "The driver pressed SOS. Open Transport to see where the van is and call the driver.", url: "/principal/care?tab=transport" });
}

export async function alertFamily(van: string, vanName: string, student: string, name: string, kind: string) {
  await requireRole("driver", "principal", "owner");
  const what = kind === "boarded" ? "got on the van" : kind === "dropped" ? "got off the van" : "was marked absent on the van";
  const time = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" });
  return pushVia("custody_push_targets", { p_van: van, p_student: student }, { title: `${name} ${what}`, body: `${vanName} · ${time}`, url: "/parent/bus" });
}
