import { requireRole } from "@/lib/me";
import { FamilyShop } from "@/components/shop/family-shop";

export default async function ParentShop({ searchParams }: { searchParams: Promise<{ kid?: string; sent?: string; error?: string }> }) {
  await requireRole("parent");
  return <FamilyShop base="/parent/shop" sp={await searchParams} />;
}
