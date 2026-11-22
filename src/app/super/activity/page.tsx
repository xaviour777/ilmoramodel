import { redirect } from "next/navigation";

// Moved: the activity list is now Security and audit.
export default function SuperActivity() {
  redirect("/super/security");
}
