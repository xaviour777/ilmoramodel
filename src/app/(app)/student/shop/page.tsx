import { requireRole } from "@/lib/me";
import { FamilyShop } from "@/components/shop/family-shop";

export default async function StudentShop({ searchParams }: { searchParams: Promise<{ kid?: string; sent?: string; error?: string }> }) {
  await requireRole("student");
  return <FamilyShop base="/student/shop" sp={await searchParams} />;
}
